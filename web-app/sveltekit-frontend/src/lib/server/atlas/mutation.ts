import type {
  AtlasRevisionSet,
  MutationCommitReceiptV1,
  MutationPlanV1,
  MutationVerificationReceiptV1
} from './contracts';

export interface MutationCommitter {
  currentRevisions(): Promise<AtlasRevisionSet>;
  currentChecksum(ref: string): Promise<string | undefined>;
  commit(plan: MutationPlanV1): Promise<MutationCommitReceiptV1>;
}

export interface MutationVerifier {
  verify(
    plan: MutationPlanV1,
    commit: MutationCommitReceiptV1
  ): Promise<MutationVerificationReceiptV1>;
}

export interface MutationWorkflowResultV1 {
  committed: boolean;
  verified: boolean;
  commit?: MutationCommitReceiptV1;
  verification?: MutationVerificationReceiptV1;
  reason?: 'REVISION_CONFLICT' | 'CHECKSUM_CONFLICT' | 'COMMIT_FAILED' | 'VERIFY_FAILED';
}

function sameRevisions(a: AtlasRevisionSet, b: AtlasRevisionSet): boolean {
  return (
    a.workspace === b.workspace &&
    a.source === b.source &&
    a.graph === b.graph &&
    a.feature === b.feature
  );
}

/**
 * Mutation is deliberately separated from resolution. A plan is committed only
 * after optimistic revision/checksum preconditions still match, then receives a
 * separate behavioral verification receipt.
 */
export async function executeMutationPlan(
  plan: MutationPlanV1,
  committer: MutationCommitter,
  verifier: MutationVerifier
): Promise<MutationWorkflowResultV1> {
  const current = await committer.currentRevisions();
  if (!sameRevisions(current, plan.preconditions.expectedRevisions)) {
    return { committed: false, verified: false, reason: 'REVISION_CONFLICT' };
  }

  for (const [ref, expected] of Object.entries(plan.preconditions.expectedChecksums)) {
    const actual = await committer.currentChecksum(ref);
    if (actual !== expected) {
      return { committed: false, verified: false, reason: 'CHECKSUM_CONFLICT' };
    }
  }

  const commit = await committer.commit(plan);
  if (!commit.committed) {
    return { committed: false, verified: false, commit, reason: 'COMMIT_FAILED' };
  }

  const verification = await verifier.verify(plan, commit);
  if (!verification.verified) {
    return {
      committed: true,
      verified: false,
      commit,
      verification,
      reason: 'VERIFY_FAILED'
    };
  }

  return { committed: true, verified: true, commit, verification };
}
