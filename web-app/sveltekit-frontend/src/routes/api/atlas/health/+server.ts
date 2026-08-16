import { json } from '@sveltejs/kit';
import { getAtlasRuntime } from '$lib/server/atlas/runtime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const runtime = getAtlasRuntime();
  if (!runtime) {
    return json(
      {
        schema: 'atlas.runtime-health.v1',
        ready: false,
        reason: 'ATLAS_RUNTIME_UNCONFIGURED',
        lanes: [],
        exactPromotion: false,
        hypergraphExpansion: false,
        temporalLineage: false
      },
      { status: 503 }
    );
  }

  const lanes = runtime.lanes.map((lane) => lane.name);
  const ready = lanes.length > 0;
  return json(
    {
      schema: 'atlas.runtime-health.v1',
      ready,
      reason: ready ? undefined : 'NO_LOGICAL_LANES',
      lanes,
      exactPromotion: Boolean(runtime.exactPromoter),
      hypergraphExpansion: Boolean(runtime.hyperedgeExpander),
      temporalLineage: Boolean(runtime.revisionFiberProvider && runtime.transitionScorer)
    },
    { status: ready ? 200 : 503 }
  );
};
