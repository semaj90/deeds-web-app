import { createExecutorBackedLane } from './lane-adapters';
import { createRemoteAtlasExecutor } from './remote-executor';
import { configureAtlasRuntime, getAtlasRuntime } from './runtime';
import type { AtlasLaneName } from './contracts';

const LANE_ENV: Record<AtlasLaneName, string> = {
  lexical: 'ATLAS_LEXICAL_EXECUTOR_URL',
  ast: 'ATLAS_AST_EXECUTOR_URL',
  semantic: 'ATLAS_SEMANTIC_EXECUTOR_URL',
  graph: 'ATLAS_GRAPH_EXECUTOR_URL'
};

/**
 * Optional workstation bootstrap. It only registers endpoints explicitly
 * configured for the Atlas executor contract; legacy search/Qdrant services are
 * not auto-wired because their identity/revision semantics are not sufficient.
 */
export function bootstrapAtlasRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (getAtlasRuntime()) return true;

  const lanes = (Object.entries(LANE_ENV) as Array<[AtlasLaneName, string]>)
    .map(([name, envName]) => {
      const url = env[envName]?.trim();
      if (!url) return undefined;
      return createExecutorBackedLane({
        name,
        executors: [
          createRemoteAtlasExecutor({
            id: `${name}-primary`,
            url,
            timeoutMs: Number(env.ATLAS_EXECUTOR_TIMEOUT_MS ?? 10_000)
          })
        ]
      });
    })
    .filter((lane): lane is NonNullable<typeof lane> => Boolean(lane));

  if (lanes.length === 0) return false;
  configureAtlasRuntime({ lanes });
  return true;
}
