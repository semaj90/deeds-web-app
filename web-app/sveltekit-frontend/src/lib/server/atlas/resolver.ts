import {
  addResourceUsage,
  emptyResourceUsage,
  resourceBoundaryReasons,
  withWallTime
} from './budget';
import type {
  AtlasLane,
  AtlasResolutionResultV1,
  AtlasResolutionStatus,
  CandidateEvidenceV1,
  CandidateExpansionV1,
  CandidateV1,
  ExactPromoter,
  ExactPromotionResultV1,
  HyperedgeExpander,
  ResolveTaskInputV1,
  ResourceUsageV1
} from './contracts';
import { auditCandidateProofs, validateExactPromotion } from './proof';
import { canonicalSetDelta, isStableDelta } from './stability';

export interface AtlasResolverDependencies {
  lanes: AtlasLane[];
  exactPromoter?: ExactPromoter;
  hyperedgeExpander?: HyperedgeExpander;
  now?: () => number;
  rankCandidates?: (candidates: CandidateV1[]) => CandidateV1[];
}

const DEFAULT_INITIAL_CANDIDATES = 32;
const DEFAULT_GROWTH_FACTOR = 2;
const DEFAULT_DELTA_THRESHOLD = 0.05;
const DEFAULT_STABLE_ROUNDS = 1;

function mergeEvidence(a: CandidateEvidenceV1, b: CandidateEvidenceV1): CandidateEvidenceV1 {
  return { ...a, ...b };
}

function mergeCandidate(existing: CandidateV1 | undefined, incoming: CandidateV1): CandidateV1 {
  if (!existing) {
    return {
      ...incoming,
      evidenceRefs: [...new Set(incoming.evidenceRefs ?? [])]
    };
  }

  return {
    ...existing,
    score: Math.max(existing.score, incoming.score),
    evidence: mergeEvidence(existing.evidence, incoming.evidence),
    evidenceRefs: [...new Set([...(existing.evidenceRefs ?? []), ...(incoming.evidenceRefs ?? [])])],
    sourceRef: existing.sourceRef ?? incoming.sourceRef,
    lane: existing.lane ?? incoming.lane
  };
}

function defaultRank(candidates: CandidateV1[]): CandidateV1[] {
  return [...candidates].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.canonicalId.localeCompare(b.canonicalId);
  });
}

function mergeUsageWithoutCandidateDoubleCount(
  usage: ResourceUsageV1,
  increment: Partial<ResourceUsageV1>
): ResourceUsageV1 {
  const next = addResourceUsage(usage, { ...increment, candidateCount: 0 });
  return {
    ...next,
    candidateCount: Math.max(usage.candidateCount, increment.candidateCount ?? 0)
  };
}

/** Candidate count is a search-width cap, not a reason to prevent exact promotion. */
function blockingOperationReasons(input: ResolveTaskInputV1, usage: ResourceUsageV1): string[] {
  return resourceBoundaryReasons(input.budget, usage).filter((reason) =>
    ['VRAM_BUDGET', 'CONTEXT_TOKEN_BUDGET', 'TOOL_CALL_BUDGET', 'WALL_TIME_BUDGET'].includes(reason)
  );
}

function operationBlocked(input: ResolveTaskInputV1, usage: ResourceUsageV1): boolean {
  return blockingOperationReasons(input, usage).length > 0;
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function assertUniqueLogicalLanes(lanes: readonly AtlasLane[]): void {
  const seen = new Set<string>();
  for (const lane of lanes) {
    if (seen.has(lane.name)) {
      throw new Error(
        `Duplicate logical Atlas lane '${lane.name}'. Multiple executors must be combined behind one lane.`
      );
    }
    seen.add(lane.name);
  }
}

function sanitizeProposal(lane: AtlasLane, candidates: readonly CandidateV1[]): CandidateV1[] {
  const clean: CandidateV1[] = [];
  for (const candidate of candidates) {
    if (!candidate.canonicalId.trim()) continue;
    if (!Number.isFinite(candidate.score)) continue;
    clean.push({ ...candidate, lane: candidate.lane ?? lane.name });
  }
  return clean;
}

/**
 * Bounded, progressively expanding Parent Atlas resolver.
 *
 * Observed stability is not proof. Exact promotion is accepted only when its
 * canonical ID belongs to the current fiber, was actually verified, links
 * evidence when required, and emits a receipt checksum.
 */
export async function resolveAtlasTask(
  input: ResolveTaskInputV1,
  dependencies: AtlasResolverDependencies
): Promise<AtlasResolutionResultV1> {
  assertUniqueLogicalLanes(dependencies.lanes);

  const now = dependencies.now ?? Date.now;
  const rank = dependencies.rankCandidates ?? defaultRank;
  const startedAt = now();
  let usage = emptyResourceUsage();
  let boundaryReasons: string[] = [];

  const maxCandidates = Math.max(0, Math.floor(input.budget.maxCandidates));
  if (maxCandidates === 0) {
    return {
      fiber: {
        requestId: input.requestId,
        candidates: [],
        multiplicity: 0,
        stable: false,
        status: 'BOUNDARY_EXHAUSTED',
        revisions: input.revisions,
        expansions: [],
        unresolvedRevisionCandidateIds: []
      },
      usage,
      diagnostics: { boundaryReasons: ['CANDIDATE_BUDGET'], hyperedgeCount: 0 }
    };
  }

  const initialLimit = Math.max(
    1,
    Math.min(
      maxCandidates,
      Math.floor(input.stabilization?.initialCandidateLimit ?? DEFAULT_INITIAL_CANDIDATES)
    )
  );
  const growthFactor = Math.max(1.1, input.stabilization?.growthFactor ?? DEFAULT_GROWTH_FACTOR);
  const deltaThreshold = Math.max(
    0,
    Math.min(1, input.stabilization?.deltaThreshold ?? DEFAULT_DELTA_THRESHOLD)
  );
  const stableRoundsRequired = Math.max(
    1,
    Math.floor(input.stabilization?.stableRoundsRequired ?? DEFAULT_STABLE_ROUNDS)
  );

  let candidateLimit = initialLimit;
  let previousIds: string[] | undefined;
  let candidates: CandidateV1[] = [];
  let stableRounds = 0;
  let stable = false;
  let lastDelta: number | undefined;
  const expansions: CandidateExpansionV1[] = [];
  let round = 0;

  while (true) {
    usage = withWallTime(usage, now() - startedAt);
    const preRoundBlocks = blockingOperationReasons(input, usage);
    if (preRoundBlocks.length > 0) {
      boundaryReasons.push(...preRoundBlocks);
      break;
    }

    const byCanonicalId = new Map<string, CandidateV1>();
    let partialRound = false;

    for (const lane of dependencies.lanes) {
      usage = withWallTime(usage, now() - startedAt);
      const preLaneBlocks = blockingOperationReasons(input, usage);
      if (preLaneBlocks.length > 0) {
        partialRound = true;
        boundaryReasons.push(...preLaneBlocks);
        break;
      }

      const proposal = await lane.propose(input, {
        candidateLimit,
        lod: Math.min(7, round) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
        usage
      });

      if (proposal.lane !== lane.name) {
        throw new Error(`Atlas lane '${lane.name}' returned proposal for '${proposal.lane}'.`);
      }

      usage = addResourceUsage(usage, { toolCalls: 1 });
      usage = mergeUsageWithoutCandidateDoubleCount(usage, proposal.usage ?? {});

      const postLaneBlocks = blockingOperationReasons(input, usage);
      if (postLaneBlocks.length > 0) {
        boundaryReasons.push(...postLaneBlocks);
        partialRound = true;
      }

      for (const candidate of sanitizeProposal(lane, proposal.candidates)) {
        byCanonicalId.set(
          candidate.canonicalId,
          mergeCandidate(byCanonicalId.get(candidate.canonicalId), candidate)
        );
      }

      if (partialRound) break;
    }

    candidates = rank([...byCanonicalId.values()]).slice(0, candidateLimit);
    usage = { ...usage, candidateCount: Math.max(usage.candidateCount, candidates.length) };

    const currentIds = candidates.map((candidate) => candidate.canonicalId);
    lastDelta = previousIds ? canonicalSetDelta(previousIds, currentIds) : undefined;

    expansions.push({
      candidateLimit,
      candidateIds: currentIds,
      deltaFromPrevious: lastDelta
    });

    if (lastDelta !== undefined && isStableDelta(lastDelta, deltaThreshold) && !partialRound) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
    }

    if (stableRounds >= stableRoundsRequired) {
      stable = true;
      break;
    }

    if (partialRound) break;
    if (candidateLimit >= maxCandidates) {
      boundaryReasons.push('CANDIDATE_BUDGET');
      break;
    }

    previousIds = currentIds;
    const nextLimit = Math.min(maxCandidates, Math.ceil(candidateLimit * growthFactor));
    if (nextLimit <= candidateLimit) {
      boundaryReasons.push('CANDIDATE_BUDGET');
      break;
    }
    candidateLimit = nextLimit;
    round += 1;
  }

  usage = withWallTime(usage, now() - startedAt);
  const proofAudit = auditCandidateProofs(input, candidates);
  const unresolvedRevisionCandidateIds = proofAudit.revisionConflicts;

  let status: AtlasResolutionStatus;
  if (input.requirements.revisionQualified && proofAudit.revisionConflicts.length > 0) {
    status = 'REVISION_CONFLICT';
  } else if (!stable) {
    status = 'BOUNDARY_EXHAUSTED';
  } else if (input.requirements.evidenceLinked && proofAudit.evidenceMissing.length > 0) {
    status = 'AMBIGUOUS';
    boundaryReasons.push(...proofAudit.evidenceMissing.map((id) => `EVIDENCE_MISSING:${id}`));
  } else {
    status = 'STABLE_APPROXIMATION';
  }

  let hyperedgeCount = 0;
  if (
    stable &&
    status === 'STABLE_APPROXIMATION' &&
    dependencies.hyperedgeExpander &&
    input.budget.maxHyperedges > 0 &&
    !operationBlocked(input, usage)
  ) {
    const expansion = await dependencies.hyperedgeExpander.expand(input, candidates, usage);
    usage = addResourceUsage(usage, { toolCalls: 1 });
    usage = mergeUsageWithoutCandidateDoubleCount(usage, expansion.usage ?? {});

    hyperedgeCount = Math.min(expansion.hyperedges.length, input.budget.maxHyperedges);
    usage = { ...usage, hyperedges: Math.max(usage.hyperedges, hyperedgeCount) };

    if (expansion.hyperedges.length > input.budget.maxHyperedges) {
      boundaryReasons.push('HYPEREDGE_BUDGET');
    }
  }

  let exactPromotion: ExactPromotionResultV1 | undefined;
  if (
    stable &&
    status === 'STABLE_APPROXIMATION' &&
    input.requirements.exactPromotion &&
    dependencies.exactPromoter &&
    !operationBlocked(input, usage)
  ) {
    exactPromotion = await dependencies.exactPromoter.verify(input, candidates, usage);
    usage = addResourceUsage(usage, { toolCalls: 1 });
    usage = mergeUsageWithoutCandidateDoubleCount(usage, exactPromotion.usage ?? {});

    const rejected = validateExactPromotion(exactPromotion, candidates, input.requirements);
    if (rejected.length > 0) {
      boundaryReasons.push(...rejected);
      status = 'AMBIGUOUS';
    } else if (exactPromotion.decision === 'PROVEN') {
      status = 'PROVEN';
    } else if (exactPromotion.decision === 'AMBIGUOUS') {
      status = 'AMBIGUOUS';
    }
  } else if (
    stable &&
    status === 'STABLE_APPROXIMATION' &&
    input.requirements.exactPromotion &&
    !dependencies.exactPromoter
  ) {
    boundaryReasons.push('EXACT_PROMOTER_UNAVAILABLE');
  }

  usage = withWallTime(usage, now() - startedAt);
  boundaryReasons.push(
    ...resourceBoundaryReasons(input.budget, usage).filter(
      (reason) => reason !== 'CANDIDATE_BUDGET' || !stable
    )
  );
  boundaryReasons = uniqueReasons(boundaryReasons);

  if (
    status === 'STABLE_APPROXIMATION' &&
    input.requirements.exactPromotion &&
    (operationBlocked(input, usage) || !dependencies.exactPromoter)
  ) {
    status = 'BOUNDARY_EXHAUSTED';
  }

  return {
    fiber: {
      requestId: input.requestId,
      candidates,
      multiplicity: candidates.length,
      stabilizationDelta: lastDelta,
      stable,
      status,
      revisions: input.revisions,
      expansions,
      unresolvedRevisionCandidateIds
    },
    usage,
    diagnostics: {
      boundaryReasons,
      exactPromotion,
      hyperedgeCount
    }
  };
}
