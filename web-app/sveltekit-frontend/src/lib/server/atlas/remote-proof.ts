import { z } from 'zod';
import type {
  CandidateV1,
  ExactPromoter,
  HyperedgeExpander,
  ResolveTaskInputV1,
  ResourceUsageV1
} from './contracts';

const usageSchema = z
  .object({
    vramBytes: z.number().nonnegative().optional(),
    contextTokens: z.number().nonnegative().optional(),
    candidateCount: z.number().nonnegative().optional(),
    graphHops: z.number().nonnegative().optional(),
    hyperedges: z.number().nonnegative().optional(),
    toolCalls: z.number().nonnegative().optional(),
    wallMs: z.number().nonnegative().optional()
  })
  .partial();

const exactPromotionSchema = z.object({
  decision: z.enum(['PROVEN', 'AMBIGUOUS', 'UNRESOLVED']),
  canonicalId: z.string().min(1).optional(),
  verifiedCandidateIds: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  receiptChecksum: z.string().min(1).optional(),
  usage: usageSchema.optional(),
  reason: z.string().optional()
});

const hyperedgeSchema = z.object({
  hyperedgeId: z.string().min(1),
  predicate: z.string().min(1),
  participants: z
    .array(
      z.object({
        canonicalId: z.string().min(1),
        role: z.string().min(1)
      })
    )
    .min(2),
  evidenceRefs: z.array(z.string().min(1)),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  checksum: z.string().min(1)
});

const hyperedgeResponseSchema = z.object({
  hyperedges: z.array(hyperedgeSchema),
  usage: usageSchema.optional()
});

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Atlas remote proof service failed with HTTP ${response.status}.`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function createRemoteExactPromoter(url: string, timeoutMs = 10_000): ExactPromoter {
  return {
    async verify(
      input: ResolveTaskInputV1,
      candidates: readonly CandidateV1[],
      usage: Readonly<ResourceUsageV1>
    ) {
      const result = await postJson(
        url,
        {
          schema: 'atlas.exact-promotion-request.v1',
          requestId: input.requestId,
          revisions: input.revisions,
          candidates,
          usage
        },
        timeoutMs
      );
      return exactPromotionSchema.parse(result);
    }
  };
}

export function createRemoteHyperedgeExpander(url: string, timeoutMs = 10_000): HyperedgeExpander {
  return {
    async expand(
      input: ResolveTaskInputV1,
      candidates: readonly CandidateV1[],
      usage: Readonly<ResourceUsageV1>
    ) {
      const result = await postJson(
        url,
        {
          schema: 'atlas.hyperedge-expansion-request.v1',
          requestId: input.requestId,
          revisions: input.revisions,
          maxHyperedges: input.budget.maxHyperedges,
          candidates,
          usage
        },
        timeoutMs
      );
      return hyperedgeResponseSchema.parse(result);
    }
  };
}
