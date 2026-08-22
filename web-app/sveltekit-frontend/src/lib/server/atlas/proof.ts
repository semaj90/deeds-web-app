import type {
  CandidateV1,
  ExactPromotionResultV1,
  ResolveRequirementsV1,
  ResolveTaskInputV1
} from './contracts';

export interface CandidateProofAuditV1 {
  revisionConflicts: string[];
  evidenceMissing: string[];
  degradedIdentity: string[];
}

function sameRevisions(a: CandidateV1['revisions'], b: ResolveTaskInputV1['revisions']): boolean {
  return (
    a.workspace === b.workspace &&
    a.source === b.source &&
    a.graph === b.graph &&
    a.feature === b.feature
  );
}

export function auditCandidateProofs(
  input: ResolveTaskInputV1,
  candidates: readonly CandidateV1[]
): CandidateProofAuditV1 {
  const audit: CandidateProofAuditV1 = {
    revisionConflicts: [],
    evidenceMissing: [],
    degradedIdentity: []
  };

  for (const candidate of candidates) {
    if (input.requirements.revisionQualified && !sameRevisions(candidate.revisions, input.revisions)) {
      audit.revisionConflicts.push(candidate.canonicalId);
    }
    if (input.requirements.evidenceLinked && (candidate.evidenceRefs?.length ?? 0) === 0) {
      audit.evidenceMissing.push(candidate.canonicalId);
    }
    if (input.requirements.canonicalIdentity && !candidate.canonicalId.trim()) {
      audit.degradedIdentity.push(candidate.canonicalId);
    }
  }

  return audit;
}

export function validateExactPromotion(
  promotion: ExactPromotionResultV1,
  candidates: readonly CandidateV1[],
  requirements: ResolveRequirementsV1
): string[] {
  const reasons: string[] = [];
  const candidateIds = new Set(candidates.map((candidate) => candidate.canonicalId));
  const verifiedIds = new Set(promotion.verifiedCandidateIds);

  if (promotion.decision === 'PROVEN') {
    if (!promotion.canonicalId) reasons.push('PROMOTION_MISSING_CANONICAL_ID');
    if (promotion.canonicalId && !candidateIds.has(promotion.canonicalId)) {
      reasons.push('PROMOTION_CANONICAL_ID_OUTSIDE_FIBER');
    }
    if (promotion.canonicalId && !verifiedIds.has(promotion.canonicalId)) {
      reasons.push('PROMOTION_CANONICAL_ID_NOT_VERIFIED');
    }
    if (requirements.evidenceLinked && promotion.evidenceRefs.length === 0) {
      reasons.push('PROMOTION_MISSING_EVIDENCE');
    }
    if (!promotion.receiptChecksum) reasons.push('PROMOTION_MISSING_RECEIPT_CHECKSUM');
  }

  for (const id of promotion.verifiedCandidateIds) {
    if (!candidateIds.has(id)) reasons.push(`PROMOTION_VERIFIED_ID_OUTSIDE_FIBER:${id}`);
  }

  return reasons;
}
