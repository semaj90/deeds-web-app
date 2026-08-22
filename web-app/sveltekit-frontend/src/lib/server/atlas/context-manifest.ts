import type {
  AtlasResolutionResultV1,
  AtlasRevisionSet,
  CandidateV1,
  HyperedgeV1,
  ResolveTaskInputV1
} from './contracts';

export interface ContextManifestEntryV1 {
  canonicalId: string;
  score: number;
  evidenceRefs: string[];
  sourceRef?: string;
}

export interface ContextManifestV1 {
  schema: 'atlas.context-manifest.v1';
  requestId: string;
  status: AtlasResolutionResultV1['fiber']['status'];
  revisions: AtlasRevisionSet;
  exactPromotedCanonicalId?: string;
  candidates: ContextManifestEntryV1[];
  hyperedgeIds: string[];
  tokenBudget: number;
  estimatedTokens: number;
  truncated: boolean;
  boundaryReasons: string[];
}

function estimateEntryTokens(candidate: CandidateV1): number {
  // Deterministic, conservative heuristic used only for envelope accounting.
  // The eventual tokenizer-specific materializer may replace this estimator.
  const chars =
    candidate.canonicalId.length +
    (candidate.sourceRef?.length ?? 0) +
    (candidate.evidenceRefs ?? []).reduce((sum, ref) => sum + ref.length, 0);
  return Math.max(8, Math.ceil(chars / 3));
}

export function buildContextManifest(
  input: ResolveTaskInputV1,
  resolution: AtlasResolutionResultV1,
  hyperedges: readonly HyperedgeV1[] = []
): ContextManifestV1 {
  const tokenBudget = input.budget.maxContextTokens;
  let estimatedTokens = 0;
  let truncated = false;
  const candidates: ContextManifestEntryV1[] = [];

  for (const candidate of resolution.fiber.candidates) {
    const cost = estimateEntryTokens(candidate);
    if (estimatedTokens + cost > tokenBudget) {
      truncated = true;
      break;
    }
    estimatedTokens += cost;
    candidates.push({
      canonicalId: candidate.canonicalId,
      score: candidate.score,
      evidenceRefs: [...new Set(candidate.evidenceRefs ?? [])],
      sourceRef: candidate.sourceRef
    });
  }

  return {
    schema: 'atlas.context-manifest.v1',
    requestId: input.requestId,
    status: resolution.fiber.status,
    revisions: input.revisions,
    exactPromotedCanonicalId: resolution.diagnostics.exactPromotion?.canonicalId,
    candidates,
    hyperedgeIds: hyperedges.slice(0, input.budget.maxHyperedges).map((edge) => edge.hyperedgeId),
    tokenBudget,
    estimatedTokens,
    truncated,
    boundaryReasons: [...resolution.diagnostics.boundaryReasons]
  };
}
