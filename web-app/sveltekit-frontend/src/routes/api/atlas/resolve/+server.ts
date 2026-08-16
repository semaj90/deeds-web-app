import { json } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { getAtlasRuntime, resolveAtlasTaskEndToEnd } from '$lib/server/atlas/runtime';
import { parseResolveTaskInput } from '$lib/server/atlas/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = parseResolveTaskInput(body);
    const runtime = getAtlasRuntime();

    if (!runtime || runtime.lanes.length === 0) {
      return json(
        {
          error: 'ATLAS_RUNTIME_UNCONFIGURED',
          message:
            'Parent Atlas control plane is installed, but no logical retrieval lanes are registered in this process.'
        },
        { status: 503 }
      );
    }

    const result = await resolveAtlasTaskEndToEnd(input, runtime);
    const httpStatus = result.resolution.fiber.status === 'REVISION_CONFLICT' ? 409 : 200;
    return json(result, { status: httpStatus });
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          error: 'INVALID_ATLAS_REQUEST',
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof SyntaxError) {
      return json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    console.error('atlas.resolve_task failed', error);
    return json(
      {
        error: 'ATLAS_RESOLVE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown resolution failure'
      },
      { status: 500 }
    );
  }
};
