import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
  atlasAgents,
  atlasApprovals,
  atlasAuditEvents,
  atlasErrorIncidents,
  atlasEvalRuns,
  atlasRuntimeEndpoints,
  atlasSkills,
  atlasTasks,
  atlasVerificationReceipts,
  db
} from '$lib/server/db';
import {
  claimAtlasTask,
  createAtlasTask,
  decideAtlasApproval,
  transitionAtlasTask
} from '$lib/server/atlas/task-manager';
import { isAtlasTaskStatus } from '$lib/server/atlas/task-state';

function requireUser(locals: App.Locals) {
  if (!locals.user) throw redirect(303, '/login');
  return locals.user;
}

function requireOperator(locals: App.Locals) {
  const user = requireUser(locals);
  if (!['admin', 'prosecutor'].includes(user.role)) {
    throw redirect(303, '/');
  }
  return user;
}

export const load: PageServerLoad = async ({ locals }) => {
  requireUser(locals);

  const [tasks, approvals, agents, incidents, receipts, skills, evalRuns, runtimeEndpoints, audit] =
    await Promise.all([
      db.select().from(atlasTasks).orderBy(desc(atlasTasks.updatedAt)).limit(100),
      db
        .select()
        .from(atlasApprovals)
        .where(inArray(atlasApprovals.status, ['pending', 'revision_requested']))
        .orderBy(desc(atlasApprovals.createdAt))
        .limit(100),
      db.select().from(atlasAgents).orderBy(atlasAgents.name).limit(200),
      db
        .select()
        .from(atlasErrorIncidents)
        .where(inArray(atlasErrorIncidents.status, ['active', 'escalated']))
        .orderBy(desc(atlasErrorIncidents.lastSeenAt))
        .limit(100),
      db.select().from(atlasVerificationReceipts).orderBy(desc(atlasVerificationReceipts.createdAt)).limit(100),
      db.select().from(atlasSkills).orderBy(desc(atlasSkills.updatedAt)).limit(100),
      db.select().from(atlasEvalRuns).orderBy(desc(atlasEvalRuns.createdAt)).limit(100),
      db.select().from(atlasRuntimeEndpoints).orderBy(atlasRuntimeEndpoints.name).limit(100),
      db.select().from(atlasAuditEvents).orderBy(desc(atlasAuditEvents.createdAt)).limit(100)
    ]);

  return { tasks, approvals, agents, incidents, receipts, skills, evalRuns, runtimeEndpoints, audit };
};

export const actions: Actions = {
  createTask: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const intent = String(form.get('intent') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    if (!intent) return fail(400, { createTaskError: 'Intent is required' });

    const taskKey = `atlas:${Date.now()}:${crypto.randomUUID()}`;
    await createAtlasTask({
      taskKey,
      intent,
      description: description || null,
      priority: Number(form.get('priority') ?? 50),
      protocol: String(form.get('protocol') ?? 'internal'),
      approvalRequired: form.get('approvalRequired') === 'on',
      verificationRequired: form.get('verificationRequired') !== 'off',
      createdByUserId: user.id,
      resourceEnvelope: {
        maxCandidates: 256,
        maxGraphHops: 3,
        maxHyperedges: 128,
        maxToolCalls: 16
      }
    });
    return { created: true };
  },

  claimTask: async ({ request, locals }) => {
    requireOperator(locals);
    const form = await request.formData();
    const taskId = String(form.get('taskId') ?? '');
    const agentId = String(form.get('agentId') ?? '');
    if (!taskId || !agentId) return fail(400, { taskError: 'Task and agent are required' });
    try {
      await claimAtlasTask(taskId, agentId);
      return { claimed: true };
    } catch (error) {
      return fail(409, { taskError: error instanceof Error ? error.message : 'Claim failed' });
    }
  },

  transitionTask: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const taskId = String(form.get('taskId') ?? '');
    const toStatus = form.get('toStatus');
    if (!taskId || !isAtlasTaskStatus(toStatus)) {
      return fail(400, { taskError: 'Invalid task transition request' });
    }

    try {
      await transitionAtlasTask({
        taskId,
        toStatus,
        actor: { type: 'user', id: user.id },
        reason: String(form.get('reason') ?? '') || null
      });
      return { transitioned: true };
    } catch (error) {
      return fail(409, { taskError: error instanceof Error ? error.message : 'Transition failed' });
    }
  },

  decideApproval: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const approvalId = String(form.get('approvalId') ?? '');
    const decision = String(form.get('decision') ?? '');
    if (!approvalId || !['approved', 'rejected', 'revision_requested'].includes(decision)) {
      return fail(400, { approvalError: 'Invalid approval decision' });
    }

    try {
      await decideAtlasApproval({
        approvalId,
        decision: decision as 'approved' | 'rejected' | 'revision_requested',
        userId: user.id,
        note: String(form.get('note') ?? '') || null
      });
      return { approvalDecided: true };
    } catch (error) {
      return fail(409, {
        approvalError: error instanceof Error ? error.message : 'Approval decision failed'
      });
    }
  },

  createAgent: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    const role = String(form.get('role') ?? 'general').trim();
    const protocol = String(form.get('protocol') ?? 'internal').trim();
    if (!name) return fail(400, { agentError: 'Agent name is required' });

    const [agent] = await db
      .insert(atlasAgents)
      .values({
        name,
        role,
        title: String(form.get('title') ?? '') || null,
        protocol,
        endpoint: String(form.get('endpoint') ?? '') || null,
        capabilities: String(form.get('capabilities') ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        metadata: { createdByUserId: user.id }
      })
      .returning();

    await db.insert(atlasAuditEvents).values({
      actorType: 'user',
      actorId: user.id,
      action: 'agent.create',
      entityType: 'atlas_agent',
      entityId: agent.id,
      details: { protocol, role }
    });
    return { agentCreated: true };
  },

  toggleRuntime: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const endpointId = String(form.get('endpointId') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    if (!endpointId) return fail(400, { runtimeError: 'Runtime endpoint is required' });

    await db
      .update(atlasRuntimeEndpoints)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(atlasRuntimeEndpoints.id, endpointId));
    await db.insert(atlasAuditEvents).values({
      actorType: 'user',
      actorId: user.id,
      action: enabled ? 'runtime.enable' : 'runtime.disable',
      entityType: 'atlas_runtime_endpoint',
      entityId: endpointId
    });
    return { runtimeUpdated: true };
  }
};
