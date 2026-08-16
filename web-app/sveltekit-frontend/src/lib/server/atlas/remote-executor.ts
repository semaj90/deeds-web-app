import { z } from 'zod';
import type { AtlasCandidateExecutorV1, AtlasExecutorResultV1 } from './lane-adapters';
import type { LaneContextV1, ResolveTaskInputV1 } from './contracts';

const candidateSchema = z.object({
  canonicalId: z.string().min(1),
  score: z.number().finite(),
  evidence: z.record(z.number().finite()).default({}),
  revisions: z.object({
    workspace: z.string().min(1),
    source: z.string().min(1),
    graph: z.string().min(1),
    feature: z.string().min(1)
  }),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  sourceRef: z.string().optional()
});

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

const executorResponseSchema = z.object({
  executor: z.string().min(1),
  candidates: z.array(candidateSchema),
  usage: usageSchema.optional()
});

export interface RemoteAtlasExecutorOptions {
  id: string;
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export function createRemoteAtlasExecutor(options: RemoteAtlasExecutorOptions): AtlasCandidateExecutorV1 {
  const timeoutMs = Math.max(100, options.timeoutMs ?? 10_000);

  return {
    id: options.id,
    async search(input: ResolveTaskInputV1, context: LaneContextV1): Promise<AtlasExecutorResultV1> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();

      try {
        const response = await fetch(options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...options.headers
          },
          body: JSON.stringify({
            schema: 'atlas.executor-request.v1',
            executor: options.id,
            requestId: input.requestId,
            query: input.query,
            revisions: input.revisions,
            candidateLimit: context.candidateLimit,
            lod: context.lod,
            remainingBudget: {
              maxVramBytes: Math.max(0, input.budget.maxVramBytes - context.usage.vramBytes),
              maxContextTokens: Math.max(
                0,
                input.budget.maxContextTokens - context.usage.contextTokens
              ),
              maxGraphHops: Math.max(0, input.budget.maxGraphHops - context.usage.graphHops),
              maxHyperedges: Math.max(0, input.budget.maxHyperedges - context.usage.hyperedges),
              maxToolCalls: Math.max(0, input.budget.maxToolCalls - context.usage.toolCalls),
              maxWallMs: Math.max(0, input.budget.maxWallMs - context.usage.wallMs)
            }
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Atlas executor '${options.id}' failed with HTTP ${response.status}.`);
        }

        const parsed = executorResponseSchema.parse(await response.json());
        if (parsed.executor !== options.id) {
          throw new Error(
            `Atlas executor '${options.id}' response identity mismatch: '${parsed.executor}'.`
          );
        }

        return {
          executor: parsed.executor,
          candidates: parsed.candidates,
          usage: {
            ...parsed.usage,
            wallMs: Math.max(parsed.usage?.wallMs ?? 0, Date.now() - startedAt)
          }
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
