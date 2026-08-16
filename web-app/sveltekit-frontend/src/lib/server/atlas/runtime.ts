import type {
  AtlasLane,
  AtlasResolutionResultV1,
  CandidateV1,
  ExactPromoter,
  HyperedgeExpander,
  HyperedgeV1,
  ResolveTaskInputV1
} from './contracts';
import { buildContextManifest, type ContextManifestV1 } from './context-manifest';
import { decodeKBestLineages, type LineagePathV1 } from './lineage';
import { buildRouteMask, type RouteMaskInputV1 } from './route-mask';
import { resolveAtlasTask } from './resolver';

export interface RevisionFiberProvider {
  loadHistoricalFibers(
    input: ResolveTaskInputV1,
    currentCandidates: readonly CandidateV1[]
  ): Promise<Array<{ revisions: ResolveTaskInputV1['revisions']; candidates: CandidateV1[] }>>;
}

export type TransitionScorer = Parameters<typeof decodeKBestLineages>[1];

export interface AtlasRuntimeV1 {
  lanes: AtlasLane[];
  exactPromoter?: ExactPromoter;
  hyperedgeExpander?: HyperedgeExpander;
  revisionFiberProvider?: RevisionFiberProvider;
  transitionScorer?: TransitionScorer;
  routeMask?: (input: ResolveTaskInputV1) => RouteMaskInputV1;
  kBestLineages?: number;
}

export interface AtlasEndToEndResultV1 {
  schema: 'atlas.resolve-result.v1';
  resolution: AtlasResolutionResultV1;
  contextManifest: ContextManifestV1;
  routeMask: number;
  lineages: LineagePathV1[];
  hyperedges: HyperedgeV1[];
}

let configuredRuntime: AtlasRuntimeV1 | undefined;

export function configureAtlasRuntime(runtime: AtlasRuntimeV1): void {
  configuredRuntime = runtime;
}

export function clearAtlasRuntime(): void {
  configuredRuntime = undefined;
}

export function getAtlasRuntime(): AtlasRuntimeV1 | undefined {
  return configuredRuntime;
}

function defaultRouteMask(input: ResolveTaskInputV1): RouteMaskInputV1 {
  return {
    semanticRequired: true,
    astRequired: input.requirements.canonicalIdentity,
    graphRequired: input.requirements.canonicalIdentity,
    exactOracleRequired: input.requirements.exactPromotion,
    mutationPresent: false,
    staleRevision: false,
    degradedIdentity: false,
    sourceRequired: input.requirements.evidenceLinked
  };
}

export async function resolveAtlasTaskEndToEnd(
  input: ResolveTaskInputV1,
  runtime: AtlasRuntimeV1
): Promise<AtlasEndToEndResultV1> {
  const capturedHyperedges: HyperedgeV1[] = [];
  const expander = runtime.hyperedgeExpander
    ? {
        async expand(...args: Parameters<NonNullable<AtlasRuntimeV1['hyperedgeExpander']>['expand']>) {
          const result = await runtime.hyperedgeExpander!.expand(...args);
          capturedHyperedges.push(...result.hyperedges);
          return result;
        }
      }
    : undefined;

  const resolution = await resolveAtlasTask(input, {
    lanes: runtime.lanes,
    exactPromoter: runtime.exactPromoter,
    hyperedgeExpander: expander
  });

  const routeMask = buildRouteMask((runtime.routeMask ?? defaultRouteMask)(input));
  let lineages: LineagePathV1[] = [];

  if (runtime.revisionFiberProvider && runtime.transitionScorer && resolution.fiber.candidates.length > 0) {
    const historical = await runtime.revisionFiberProvider.loadHistoricalFibers(
      input,
      resolution.fiber.candidates
    );
    const fibers = [
      ...historical,
      { revisions: input.revisions, candidates: resolution.fiber.candidates }
    ];

    lineages = decodeKBestLineages(
      fibers,
      runtime.transitionScorer,
      Math.max(1, Math.floor(runtime.kBestLineages ?? 3))
    );
  }

  return {
    schema: 'atlas.resolve-result.v1',
    resolution,
    contextManifest: buildContextManifest(input, resolution, capturedHyperedges),
    routeMask,
    lineages,
    hyperedges: capturedHyperedges.slice(0, input.budget.maxHyperedges)
  };
}
