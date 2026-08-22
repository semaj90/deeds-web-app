import type { AtlasRevisionSet, CandidateV1, ResolveTaskInputV1 } from './contracts';

export interface ApproximateProposalV1 {
  challengerId: string;
  candidates: CandidateV1[];
  evidenceRefs: string[];
  approximation: 'low-rank-sampling' | 'learned-routing' | 'other';
}

/**
 * Tang-style samplers, learned routing heads, and other approximations may
 * propose candidates. They have no authority to promote canonical identity.
 */
export interface CandidateProposalChallenger {
  readonly challengerId: string;
  propose(input: ResolveTaskInputV1): Promise<ApproximateProposalV1>;
}

export interface VerifiedTrainingReceiptV1 {
  receiptId: string;
  revisions: AtlasRevisionSet;
  verified: true;
  evidenceRefs: string[];
  inputChecksum: string;
  outcomeChecksum: string;
}

/** QLoRA/adapter training consumes verified receipts, never live canonical state. */
export interface ReceiptOnlyTrainer {
  readonly trainerId: string;
  train(receipts: readonly VerifiedTrainingReceiptV1[]): Promise<{
    adapterId: string;
    adapterRevision: string;
    outputChecksum: string;
  }>;
}
