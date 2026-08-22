import { z } from 'zod';
import type { ResolveTaskInputV1 } from './contracts';

const revision = z.string().trim().min(1).max(256);
const nonNegativeFinite = z.number().finite().nonnegative();
const positiveInt = z.number().int().positive();

export const atlasRevisionSetSchema = z.object({
  workspace: revision,
  source: revision,
  graph: revision,
  feature: revision
});

export const resourceEnvelopeSchema = z
  .object({
    maxVramBytes: positiveInt,
    maxContextTokens: positiveInt,
    maxCandidates: positiveInt.max(1_000_000),
    maxGraphHops: z.number().int().nonnegative().max(1_024),
    maxHyperedges: z.number().int().nonnegative().max(10_000_000),
    maxToolCalls: positiveInt.max(100_000),
    maxWallMs: positiveInt.max(3_600_000)
  })
  .strict();

export const resolveRequirementsSchema = z
  .object({
    canonicalIdentity: z.boolean(),
    revisionQualified: z.boolean(),
    evidenceLinked: z.boolean(),
    exactPromotion: z.boolean()
  })
  .strict();

export const stabilizationPolicySchema = z
  .object({
    initialCandidateLimit: positiveInt.optional(),
    growthFactor: z.number().finite().gt(1).max(16).optional(),
    deltaThreshold: z.number().finite().min(0).max(1).optional(),
    stableRoundsRequired: positiveInt.max(32).optional()
  })
  .strict();

export const resolveTaskInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(256),
    query: z.string().trim().min(1).max(64_000),
    revisions: atlasRevisionSetSchema.strict(),
    budget: resourceEnvelopeSchema,
    requirements: resolveRequirementsSchema,
    stabilization: stabilizationPolicySchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const initial = value.stabilization?.initialCandidateLimit;
    if (initial !== undefined && initial > value.budget.maxCandidates) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stabilization', 'initialCandidateLimit'],
        message: 'initialCandidateLimit must not exceed maxCandidates'
      });
    }

    // A caller may request approximate discovery only, but cannot claim canonical
    // identity while explicitly disabling both revision qualification and exact promotion.
    if (
      value.requirements.canonicalIdentity &&
      !value.requirements.revisionQualified &&
      !value.requirements.exactPromotion
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requirements'],
        message: 'canonicalIdentity requires revisionQualified or exactPromotion'
      });
    }
  });

export function parseResolveTaskInput(value: unknown): ResolveTaskInputV1 {
  return resolveTaskInputSchema.parse(value) as ResolveTaskInputV1;
}

export function validateUsageNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

export function validateScore(value: number, name = 'score'): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}
