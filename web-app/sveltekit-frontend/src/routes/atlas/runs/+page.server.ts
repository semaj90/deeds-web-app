import { fail, redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
  atlasAgentRuns,
  atlasAgentWakeups,
  atlasAgents,
  atlasTasks,
  db
} from '$lib/server/db';
import { requestAtlasAgentWakeup } from '$lib/server/atlas/run-manager';

function requireUser(locals: App.Locals) {
  if (!locals.user) throw redirect(303, '/login');
  return locals.user;
}

function requireOperator(locals: App.Locals) {
  const user = requireUser(locals);
  if (!['admin', 'prosecutor'].includes(user.role)) throw redirect(303, '/atlas/runs');
  return user;
}

export const load: PageServerLoad = async ({ locals }) => {
  requireUser(locals);
  const [runs, wakeups, agents, tasks] = await Promise.all([
    db.select().from(atlasAgentRuns).orderBy(desc(atlasAgentRuns.createdAt)).limit(150),
    db.select().from(atlasAgentWakeups).orderBy(desc(atlasAgentWakeups.createdAt)).limit(100),
    db.select().from(atlasAgents).orderBy(atlasAgents.name).limit(200),
    db.select().from(atlasTasks).orderBy(desc(atlasTasks.updatedAt)).limit(200)
  ]);
  return { runs, wakeups, agents, tasks };
};

export const actions: Actions = {
  requestWakeup: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const agentId = String(form.get('agentId') ?? '').trim();
    const taskId = String(form.get('taskId') ?? '').trim();
    const reason = String(form.get('reason') ?? '').trim();
    if (!agentId || !reason) return fail(400, { wakeupError: 'Agent and reason are required' });

    try {
      await requestAtlasAgentWakeup({
        agentId,
        taskId: taskId || null,
        reason,
        idempotencyKey: `control-panel:${agentId}:${taskId || 'none'}:${reason}`,
        requestedByType: 'user',
        requestedById: user.id
      });
      return { wakeupCreated: true };
    } catch (error) {
      return fail(409, {
        wakeupError: error instanceof Error ? error.message : 'Wakeup request failed'
      });
    }
  }
};
