import type {
  AtlasResolutionResultV1,
  MutationPlanV1,
  ResolveTaskInputV1
} from './contracts';

export const ATLAS_CONTROL_TOOLS = {
  resolveTask: 'atlas.resolve_task',
  planMutation: 'atlas.plan_mutation',
  commitMutation: 'atlas.commit_mutation',
  verifyMutation: 'atlas.verify_mutation'
} as const;

export interface AtlasControlPlaneHandlers {
  resolveTask(input: ResolveTaskInputV1): Promise<AtlasResolutionResultV1>;
  planMutation(input: {
    requestId: string;
    resolution: AtlasResolutionResultV1;
    instruction: string;
  }): Promise<MutationPlanV1>;
}

/**
 * Protocol-neutral semantic surface for MCP/A2A adapters. Backend primitives
 * such as CAGRA, cuVS, Qdrant, PageRank, rg, and AST parsers stay behind these
 * handlers instead of becoming model-level scheduling decisions.
 */
export function createAtlasControlPlane(handlers: AtlasControlPlaneHandlers): AtlasControlPlaneHandlers {
  return handlers;
}
