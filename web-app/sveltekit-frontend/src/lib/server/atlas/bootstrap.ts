import type { AtlasLane, AtlasLaneName } from './contracts';
import { createExecutorBackedLane } from './lane-adapters';
import { createRemoteAtlasExecutor } from './remote-executor';
import { createRemoteExactPromoter, createRemoteHyperedgeExpander } from './remote-proof';
import { configureAtlasRuntime, getAtlasRuntime } from './runtime';

const LANE_ENV: Record<AtlasLaneName, string> = {
  lexical: 'ATLAS_LEXICAL_EXECUTOR_URL',
  ast: 'ATLAS_AST_EXECUTOR_URL',
  semantic: 'ATLAS_SEMANTIC_EXECUTOR_URL',
  graph: 'ATLAS_GRAPH_EXECUTOR_URL'
};

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value ?? 10_000);
  return Number.isFinite(parsed) && parsed >= 100 ? Math.floor(parsed) : 10_000;
}

/**
 * Optional workstation bootstrap. It only registers endpoints explicitly
 * configured for the Atlas executor contract; legacy search/Qdrant services are
 * not auto-wired because their identity/revision semantics are not sufficient.
 */
export function bootstrapAtlasRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (getAtlasRuntime()) return true;

  const timeoutMs = parseTimeout(env.ATLAS_EXECUTOR_TIMEOUT_MS);
  const lanes: AtlasLane[] = [];

  for (const [name, envName] of Object.entries(LANE_ENV) as Array<[AtlasLaneName, string]>) {
    const url = env[envName]?.trim();
    if (!url) continue;
    lanes.push(
      createExecutorBackedLane({
        name,
        executors: [createRemoteAtlasExecutor({ id: `${name}-primary`, url, timeoutMs })]
      })
    );
  }

  if (lanes.length === 0) return false;

  const exactUrl = env.ATLAS_EXACT_PROMOTER_URL?.trim();
  const hyperedgeUrl = env.ATLAS_HYPEREDGE_EXPANDER_URL?.trim();

  configureAtlasRuntime({
    lanes,
    exactPromoter: exactUrl ? createRemoteExactPromoter(exactUrl, timeoutMs) : undefined,
    hyperedgeExpander: hyperedgeUrl
      ? createRemoteHyperedgeExpander(hyperedgeUrl, timeoutMs)
      : undefined
  });
  return true;
}
