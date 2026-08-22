import { json } from '@sveltejs/kit';
import {
  claimAtlasTaskWithLease,
  heartbeatAtlasLease,
  releaseAtlasLease
} from '$lib/server/atlas/leases';
import type { RequestHandler } from './$types';

function isOperator(locals: App.Locals): boolean {
  return Boolean(locals.user && ['admin', 'prosecutor'].includes(locals.user.role));
}

/**
 * Control-plane lease endpoint. For now this intentionally requires the normal
 * authenticated operator session. Do not expose it directly to remote Hermes /
 * A2A / ACP agents until short-lived agent-run credentials are implemented.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!isOperator(locals)) return json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const operation = String(body.operation ?? '');

    if (operation === 'claim') {
      const taskId = String(body.taskId ?? '');
      const agentId = String(body.agentId ?? '');
      if (!taskId || !agentId) {
        return json({ error: 'INVALID_LEASE_REQUEST', message: 'taskId and agentId are required' }, { status: 400 });
      }
      const grant = await claimAtlasTaskWithLease({
        taskId,
        agentId,
        ttlMs: typeof body.ttlMs === 'number' ? body.ttlMs : undefined
      });
      return json({ operation, grant }, { status: 201 });
    }

    if (operation === 'heartbeat') {
      const leaseId = String(body.leaseId ?? '');
      const leaseToken = String(body.leaseToken ?? '');
      if (!leaseId || !leaseToken) {
        return json({ error: 'INVALID_LEASE_REQUEST', message: 'leaseId and leaseToken are required' }, { status: 400 });
      }
      const result = await heartbeatAtlasLease({
        leaseId,
        leaseToken,
        ttlMs: typeof body.ttlMs === 'number' ? body.ttlMs : undefined,
        resourceUsage:
          body.resourceUsage && typeof body.resourceUsage === 'object'
            ? (body.resourceUsage as Record<string, unknown>)
            : undefined
      });
      return json({ operation, lease: result });
    }

    if (operation === 'release') {
      const leaseId = String(body.leaseId ?? '');
      const leaseToken = String(body.leaseToken ?? '');
      if (!leaseId || !leaseToken) {
        return json({ error: 'INVALID_LEASE_REQUEST', message: 'leaseId and leaseToken are required' }, { status: 400 });
      }
      const lease = await releaseAtlasLease({
        leaseId,
        leaseToken,
        reason: typeof body.reason === 'string' ? body.reason : undefined
      });
      return json({ operation, leaseId: lease.id, status: lease.status });
    }

    return json({ error: 'UNKNOWN_LEASE_OPERATION' }, { status: 400 });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'INVALID_JSON' }, { status: 400 });
    return json(
      {
        error: 'ATLAS_LEASE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown lease failure'
      },
      { status: 409 }
    );
  }
};
