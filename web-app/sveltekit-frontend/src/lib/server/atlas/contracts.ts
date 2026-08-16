export const ATLAS_RESOLUTION_STATUSES = [
  'PROVEN',
  'AMBIGUOUS',
  'STABLE_APPROXIMATION',
  'REVISION_CONFLICT',
  'BOUNDARY_EXHAUSTED'
] as const;

export type AtlasResolutionStatus = (typeof ATLAS_RESOLUTION_STATUSES)[number];

export type AtlasLaneName = 'lexical' | 'ast' | 'semantic' | 'graph';

export type AtlasLod = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AtlasRevisionSet {
  workspace: string;
  source: string;
  graph: string;
  feature: string;
}

/**
 * Hard limits for one bounded Atlas resolution request.
 *
 * No caller may interpret exhausting this envelope as proof that no answer exists.
 */
export interface ResourceEnvelopeV1 {
  maxVramBytes: number;
  maxContextTokens: number;
  maxCandidates: number;
  maxGraphHops: number;
  maxHyperedges: number;
  maxToolCalls: number;
  maxWallMs: number;
}

export interface ResourceUsageV1 {
  vramBytes: number;
  contextTokens: number;
  candidateCount: number;
  graphHops: number;
  hyperedges: number;
  toolCalls: number;
  wallMs: number;
}

export interface ResolveRequirementsV1 {
  canonicalIdentity: boolean;
  revisionQualified: boolean;
  evidenceLinked: boolean;
  exactPromotion: boolean;
}

export interface StabilizationPolicyV1 {
  initialCandidateLimit?: number;
  growthFactor?: number;
  deltaThreshold?: number;
  stableRoundsRequired?: number;
}

export interface ResolveTaskInputV1 {
  requestId: string;
  query: string;
  revisions: AtlasRevisionSet;
  budget: ResourceEnvelopeV1;
  requirements: ResolveRequirementsV1;
  stabilization?: StabilizationPolicyV1;
}

/**
 * PageRank is deliberately named pageRankPrior: it is structural evidence, never
 * canonical identity or execution proof.
 */
export interface CandidateEvidenceV1 {
  semantic?: number;
  lexical?: number;
  ast?: number;
  hypergraph?: number;
  pageRankPrior?: number;
  execution?: number;
  freshness?: number;
}

export interface CandidateV1 {
  canonicalId: string;
  score: number;
  evidence: CandidateEvidenceV1;
  revisions: AtlasRevisionSet;
  evidenceRefs?: string[];
  sourceRef?: string;
  lane?: AtlasLaneName;
}

export interface CandidateExpansionV1 {
  candidateLimit: number;
  candidateIds: string[];
  deltaFromPrevious?: number;
}

export interface CandidateFiberV1 {
  requestId: string;
  candidates: CandidateV1[];
  multiplicity: number;
  stabilizationDelta?: number;
  stable: boolean;
  status: AtlasResolutionStatus;
  revisions: AtlasRevisionSet;
  expansions: CandidateExpansionV1[];
  unresolvedRevisionCandidateIds: string[];
}

export interface HyperedgeParticipantV1 {
  canonicalId: string;
  role: string;
}

/**
 * Use HyperedgeV1 only when the n-ary relation is the fact. Ordinary binary AST
 * edges such as CALLS/IMPORTS/EXTENDS should remain ordinary graph edges.
 */
export interface HyperedgeV1 {
  hyperedgeId: string;
  predicate: string;
  participants: HyperedgeParticipantV1[];
  evidenceRefs: string[];
  workspaceRevision: string;
  graphRevision: string;
  sourceRevision: string;
  producerRevision: string;
  checksum: string;
}

export interface LaneContextV1 {
  candidateLimit: number;
  lod: AtlasLod;
  usage: Readonly<ResourceUsageV1>;
}

export interface LaneProposalV1 {
  lane: AtlasLaneName;
  candidates: CandidateV1[];
  usage?: Partial<ResourceUsageV1>;
}

/**
 * One logical lane gets one proposal surface. Multiple semantic executors
 * (for example Qdrant, cuVS exact, CAGRA) must not become multiple semantic votes.
 */
export interface AtlasLane {
  readonly name: AtlasLaneName;
  propose(input: ResolveTaskInputV1, context: LaneContextV1): Promise<LaneProposalV1>;
}

export type ExactPromotionDecision = 'PROVEN' | 'AMBIGUOUS' | 'UNRESOLVED';

export interface ExactPromotionResultV1 {
  decision: ExactPromotionDecision;
  canonicalId?: string;
  verifiedCandidateIds: string[];
  evidenceRefs: string[];
  receiptChecksum?: string;
  usage?: Partial<ResourceUsageV1>;
  reason?: string;
}

export interface ExactPromoter {
  verify(
    input: ResolveTaskInputV1,
    candidates: readonly CandidateV1[],
    usage: Readonly<ResourceUsageV1>
  ): Promise<ExactPromotionResultV1>;
}

export interface HyperedgeExpansionResultV1 {
  hyperedges: HyperedgeV1[];
  usage?: Partial<ResourceUsageV1>;
}

export interface HyperedgeExpander {
  expand(
    input: ResolveTaskInputV1,
    candidates: readonly CandidateV1[],
    usage: Readonly<ResourceUsageV1>
  ): Promise<HyperedgeExpansionResultV1>;
}

export interface AtlasResolutionDiagnosticsV1 {
  boundaryReasons: string[];
  exactPromotion?: ExactPromotionResultV1;
  hyperedgeCount: number;
}

export interface AtlasResolutionResultV1 {
  fiber: CandidateFiberV1;
  usage: ResourceUsageV1;
  diagnostics: AtlasResolutionDiagnosticsV1;
}

export interface MutationPreconditionsV1 {
  expectedRevisions: AtlasRevisionSet;
  expectedChecksums: Record<string, string>;
}

export interface MutationPlanV1 {
  mutationId: string;
  requestId: string;
  targetCanonicalIds: string[];
  patchRef: string;
  preconditions: MutationPreconditionsV1;
  evidenceRefs: string[];
}

export interface MutationCommitReceiptV1 {
  mutationId: string;
  committed: boolean;
  sourceRevisionBefore: string;
  sourceRevisionAfter?: string;
  checksum?: string;
  reason?: string;
}

export interface MutationVerificationReceiptV1 {
  mutationId: string;
  verified: boolean;
  testEvidenceRefs: string[];
  graphEvidenceRefs: string[];
  astEvidenceRefs: string[];
  retrievalEvidenceRefs: string[];
  checksum: string;
}
