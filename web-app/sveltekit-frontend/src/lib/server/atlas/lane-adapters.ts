import type {
  AtlasLane,
  AtlasLaneName,
  CandidateV1,
  LaneContextV1,
  LaneProposalV1,
  ResolveTaskInputV1,
  ResourceUsageV1
} from './contracts';

export interface AtlasExecutorResultV1 {
  executor: string;
  candidates: CandidateV1[];
  usage?: Partial<ResourceUsageV1>;
}

export interface AtlasCandidateExecutorV1 {
  readonly id: string;
  search(input: ResolveTaskInputV1, context: LaneContextV1): Promise<AtlasExecutorResultV1>;
}

export type ExecutorMergePolicyV1 = 'PRIMARY_THEN_FILL' | 'MAX_SCORE_BY_CANONICAL_ID';

function mergeUsage(results: readonly AtlasExecutorResultV1[]): Partial<ResourceUsageV1> {
  const usage: Partial<ResourceUsageV1> = {};
  for (const result of results) {
    for (const key of [
      'vramBytes',
      'contextTokens',
      'graphHops',
      'hyperedges',
      'toolCalls'
    ] as const) {
      usage[key] = (usage[key] ?? 0) + (result.usage?.[key] ?? 0);
    }
    usage.wallMs = Math.max(usage.wallMs ?? 0, result.usage?.wallMs ?? 0);
    usage.candidateCount = Math.max(
      usage.candidateCount ?? 0,
      result.usage?.candidateCount ?? result.candidates.length
    );
  }
  return usage;
}

function primaryThenFill(
  results: readonly AtlasExecutorResultV1[],
  limit: number,
  lane: AtlasLaneName
): CandidateV1[] {
  const seen = new Set<string>();
  const merged: CandidateV1[] = [];
  for (const result of results) {
    for (const candidate of result.candidates) {
      if (seen.has(candidate.canonicalId)) continue;
      seen.add(candidate.canonicalId);
      merged.push({ ...candidate, lane });
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

function maxScoreByCanonicalId(
  results: readonly AtlasExecutorResultV1[],
  limit: number,
  lane: AtlasLaneName
): CandidateV1[] {
  const byId = new Map<string, CandidateV1>();
  for (const result of results) {
    for (const candidate of result.candidates) {
      const existing = byId.get(candidate.canonicalId);
      if (!existing || candidate.score > existing.score) {
        byId.set(candidate.canonicalId, { ...candidate, lane });
      } else if (existing) {
        byId.set(candidate.canonicalId, {
          ...existing,
          evidenceRefs: [
            ...new Set([...(existing.evidenceRefs ?? []), ...(candidate.evidenceRefs ?? [])])
          ]
        });
      }
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.canonicalId.localeCompare(b.canonicalId))
    .slice(0, limit);
}

/**
 * Multiple physical executors are intentionally collapsed behind ONE logical
 * lane. Qdrant, cuVS exact and CAGRA may all execute, but this adapter returns a
 * single `semantic` proposal so RRF/fusion cannot count them as three votes.
 */
export function createExecutorBackedLane(options: {
  name: AtlasLaneName;
  executors: AtlasCandidateExecutorV1[];
  mergePolicy?: ExecutorMergePolicyV1;
}): AtlasLane {
  if (options.executors.length === 0) {
    throw new Error(`Atlas lane '${options.name}' requires at least one executor.`);
  }
  const ids = new Set<string>();
  for (const executor of options.executors) {
    if (ids.has(executor.id)) throw new Error(`Duplicate Atlas executor id '${executor.id}'.`);
    ids.add(executor.id);
  }

  return {
    name: options.name,
    async propose(input, context): Promise<LaneProposalV1> {
      // Sequential by default: deterministic resource accounting and predictable
      // 8 GB workstation pressure. A future scheduler can parallelize only after
      // it has a real VRAM arbiter.
      const results: AtlasExecutorResultV1[] = [];
      for (const executor of options.executors) {
        const result = await executor.search(input, context);
        if (result.executor !== executor.id) {
          throw new Error(
            `Atlas executor '${executor.id}' returned result tagged '${result.executor}'.`
          );
        }
        results.push(result);
      }

      const candidates =
        (options.mergePolicy ?? 'PRIMARY_THEN_FILL') === 'MAX_SCORE_BY_CANONICAL_ID'
          ? maxScoreByCanonicalId(results, context.candidateLimit, options.name)
          : primaryThenFill(results, context.candidateLimit, options.name);

      return {
        lane: options.name,
        candidates,
        usage: mergeUsage(results)
      };
    }
  };
}
