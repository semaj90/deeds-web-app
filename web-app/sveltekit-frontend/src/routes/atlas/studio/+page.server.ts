import { fail, redirect } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { atlasRuntimeEndpoints, db } from '$lib/server/db';
import {
  appendWorkflowActionEvent,
  createAtlasWorkflow,
  getAtlasWorkflowSnapshot,
  listRecentAtlasWorkflows,
  replaceWorkflowDagEdges
} from '$lib/server/atlas/workflow-store';

function requireUser(locals: App.Locals) {
  if (!locals.user) throw redirect(303, '/login');
  return locals.user;
}

function requireOperator(locals: App.Locals) {
  const user = requireUser(locals);
  if (!['admin', 'prosecutor'].includes(user.role)) throw redirect(303, '/atlas');
  return user;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requireUser(locals);

  const [workflows, runtimeEndpoints] = await Promise.all([
    listRecentAtlasWorkflows(80),
    db.select().from(atlasRuntimeEndpoints).orderBy(asc(atlasRuntimeEndpoints.name)).limit(100)
  ]);

  const requestedWorkflowId = url.searchParams.get('workflowId');
  const selected =
    (requestedWorkflowId && workflows.find((workflow) => workflow.id === requestedWorkflowId)) ??
    workflows[0] ??
    null;
  const snapshot = selected ? await getAtlasWorkflowSnapshot(selected.id) : null;

  return { workflows, runtimeEndpoints, snapshot };
};

export const actions: Actions = {
  createWorkflow: async ({ request, locals }) => {
    const user = requireOperator(locals);
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    if (!title) return fail(400, { studioError: 'Workflow title is required' });

    const workflow = await createAtlasWorkflow({
      workflowKey: `studio:${Date.now()}:${crypto.randomUUID()}`,
      title,
      source: 'parent-atlas-studio',
      createdByUserId: user.id,
      metadata: {
        mode: 'admin-studio',
        invariant: 'SSR snapshot + SSE delta; canvas is projection only'
      }
    });

    await replaceWorkflowDagEdges(workflow.id, [
      { fromNodeId: 'planner', toNodeId: 'ast' },
      { fromNodeId: 'planner', toNodeId: 'semantic' },
      { fromNodeId: 'ast', toNodeId: 'materialize' },
      { fromNodeId: 'semantic', toNodeId: 'materialize' },
      { fromNodeId: 'materialize', toNodeId: 'validate' }
    ]);

    await appendWorkflowActionEvent(workflow.id, {
      actionId: 'planner:0',
      dagNodeId: 'planner',
      attempt: 0,
      lane: 'planner',
      transport: 'local',
      kind: 'started',
      state: 'running',
      operation: 'Plan workflow ready set',
      progress: { fraction: 0.1, etaMs: 45_000, confidence: 0.7 },
      visual: { station: 'ontology', animation: 'Inspect', fx: 'route-pulse' }
    });

    return { workflowCreated: true, workflowId: workflow.id };
  },

  emitDemoStep: async ({ request, locals }) => {
    requireOperator(locals);
    const form = await request.formData();
    const workflowId = String(form.get('workflowId') ?? '').trim();
    const step = String(form.get('step') ?? '').trim();
    if (!workflowId || !step) return fail(400, { studioError: 'Workflow and step are required' });

    const presets = {
      ast: {
        actionId: `ast:${Date.now()}`,
        parentActionId: 'planner:0',
        dagNodeId: 'ast',
        lane: 'ast' as const,
        transport: 'local' as const,
        operation: 'Resolve AST ownership evidence',
        visual: { station: 'error-bay' as const, animation: 'Repair' as const, fx: 'repair-sparks' }
      },
      semantic: {
        actionId: `semantic:${Date.now()}`,
        parentActionId: 'planner:0',
        dagNodeId: 'semantic',
        lane: 'semantic' as const,
        transport: 'grpc' as const,
        operation: 'Promote semantic candidates',
        visual: { station: 'gpu' as const, animation: 'Work' as const, fx: 'vector-pulse' }
      },
      bitfrost: {
        actionId: `materialize:${Date.now()}`,
        dagNodeId: 'materialize',
        lane: 'materializer' as const,
        transport: 'rabbitmq' as const,
        operation: 'Warm BitFrost materialization bucket',
        visual: { station: 'bitfrost' as const, animation: 'Work' as const, fx: 'warm-embers' }
      },
      acp: {
        actionId: `acp:${Date.now()}`,
        dagNodeId: 'materialize',
        lane: 'acp' as const,
        transport: 'acp' as const,
        operation: 'Normalize ACP tool-call update',
        visual: { station: 'acp' as const, animation: 'Inspect' as const, fx: 'protocol-pulse' }
      },
      a2a: {
        actionId: `a2a:${Date.now()}`,
        dagNodeId: 'validate',
        lane: 'a2a' as const,
        transport: 'a2a' as const,
        operation: 'Normalize A2A task status update',
        visual: { station: 'a2a' as const, animation: 'Walk' as const, fx: 'transfer' }
      },
      validate: {
        actionId: `validate:${Date.now()}`,
        dagNodeId: 'validate',
        lane: 'validator' as const,
        transport: 'local' as const,
        operation: 'Verify workflow evidence and receipts',
        visual: { station: 'error-bay' as const, animation: 'Celebrate' as const, fx: 'receipt-burst' }
      }
    } as const;

    const preset = presets[step as keyof typeof presets];
    if (!preset) return fail(400, { studioError: 'Unknown demo step' });

    await appendWorkflowActionEvent(workflowId, {
      ...preset,
      attempt: 0,
      kind: step === 'validate' ? 'completed' : 'progress',
      state: step === 'validate' ? 'succeeded' : 'running',
      progress: {
        fraction: step === 'validate' ? 1 : 0.62,
        completedUnits: step === 'validate' ? 1 : 62,
        totalUnits: step === 'validate' ? 1 : 100,
        etaMs: step === 'validate' ? 0 : 18_000,
        confidence: 0.82
      },
      evidenceRefs: step === 'validate' ? ['receipt:studio-demo'] : undefined,
      finishedAt: step === 'validate' ? new Date().toISOString() : undefined
    });

    return { demoStepEmitted: true };
  }
};
