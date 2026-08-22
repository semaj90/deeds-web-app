import { and, asc, desc, eq, gt } from 'drizzle-orm';
import {
  atlasWorkflowActionCurrent,
  atlasWorkflowActionEvents,
  atlasWorkflowDagEdges,
  atlasWorkflowOutbox,
  atlasWorkflowRuns,
  db
} from '$lib/server/db';
import {
  parseWorkflowActionEvent,
  type WorkflowActionEventDraftV1,
  type WorkflowActionEventV1
} from './workflow-event';

export interface CreateAtlasWorkflowV1 {
  workflowKey: string;
  title: string;
  source?: string;
  workspaceRevision?: string | null;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
}

export interface WorkflowDagEdgeV1 {
  fromNodeId: string;
  toNodeId: string;
  relation?: string;
}

function eventRowToContract(
  row: typeof atlasWorkflowActionEvents.$inferSelect
): WorkflowActionEventV1 {
  return parseWorkflowActionEvent({
    schema: 'atlas.workflow-action.v1',
    workflowId: row.workflowId,
    workflowRevision: row.workflowRevision,
    sequence: row.sequence,
    actionId: row.actionId,
    parentActionId: row.parentActionId ?? undefined,
    dagNodeId: row.dagNodeId,
    attempt: row.attempt,
    lane: row.lane,
    transport: row.transport ?? undefined,
    kind: row.kind,
    state: row.state,
    operation: row.operation,
    progress:
      row.progress && Object.keys(row.progress).length > 0 ? row.progress : undefined,
    target: row.target && Object.keys(row.target).length > 0 ? row.target : undefined,
    evidenceRefs: row.evidenceRefs.length > 0 ? row.evidenceRefs : undefined,
    artifactRefs: row.artifactRefs.length > 0 ? row.artifactRefs : undefined,
    startedAt: row.startedAt?.toISOString(),
    emittedAt: row.emittedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
    visual: row.visual ?? undefined
  });
}

export async function createAtlasWorkflow(input: CreateAtlasWorkflowV1) {
  const [workflow] = await db
    .insert(atlasWorkflowRuns)
    .values({
      workflowKey: input.workflowKey,
      title: input.title,
      source: input.source ?? 'parent-atlas',
      workspaceRevision: input.workspaceRevision ?? null,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null
    })
    .returning();
  return workflow;
}

/**
 * Durable semantic-event writer. Canonical workflow state, append-only history,
 * current projection and outbox are advanced in one PostgreSQL transaction.
 * Browser/WebGPU consumers are downstream projections and never write truth.
 */
export async function appendWorkflowActionEvent(
  workflowId: string,
  draft: WorkflowActionEventDraftV1
): Promise<WorkflowActionEventV1> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(atlasWorkflowRuns)
      .where(eq(atlasWorkflowRuns.id, workflowId))
      .limit(1);
    if (!current) throw new Error('Atlas workflow not found');

    const sequence = current.lastSequence + 1;
    const workflowRevision = current.revision + 1;
    const emittedAt = draft.emittedAt ?? new Date().toISOString();

    const event = parseWorkflowActionEvent({
      ...draft,
      schema: 'atlas.workflow-action.v1',
      workflowId,
      workflowRevision,
      sequence,
      emittedAt
    });

    const [advanced] = await tx
      .update(atlasWorkflowRuns)
      .set({
        revision: workflowRevision,
        lastSequence: sequence,
        status:
          event.state === 'failed'
            ? 'failed'
            : event.state === 'succeeded' && event.kind === 'completed'
              ? current.status
              : 'running',
        startedAt: current.startedAt ?? new Date(event.startedAt ?? event.emittedAt),
        updatedAt: new Date(event.emittedAt)
      })
      .where(
        and(
          eq(atlasWorkflowRuns.id, workflowId),
          eq(atlasWorkflowRuns.revision, current.revision),
          eq(atlasWorkflowRuns.lastSequence, current.lastSequence)
        )
      )
      .returning();

    if (!advanced) {
      throw new Error('Workflow advanced concurrently; retry from fresh revision');
    }

    await tx.insert(atlasWorkflowActionEvents).values({
      workflowId,
      workflowRevision,
      sequence,
      actionId: event.actionId,
      parentActionId: event.parentActionId ?? null,
      dagNodeId: event.dagNodeId,
      attempt: event.attempt,
      lane: event.lane,
      transport: event.transport ?? null,
      kind: event.kind,
      state: event.state,
      operation: event.operation,
      progress: event.progress ?? {},
      target: event.target ?? {},
      evidenceRefs: event.evidenceRefs ?? [],
      artifactRefs: event.artifactRefs ?? [],
      visual: event.visual ?? null,
      startedAt: event.startedAt ? new Date(event.startedAt) : null,
      emittedAt: new Date(event.emittedAt),
      finishedAt: event.finishedAt ? new Date(event.finishedAt) : null
    });

    await tx
      .insert(atlasWorkflowActionCurrent)
      .values({
        workflowId,
        actionId: event.actionId,
        parentActionId: event.parentActionId ?? null,
        dagNodeId: event.dagNodeId,
        workflowRevision,
        sequence,
        attempt: event.attempt,
        lane: event.lane,
        transport: event.transport ?? null,
        kind: event.kind,
        state: event.state,
        operation: event.operation,
        progress: event.progress ?? {},
        target: event.target ?? {},
        evidenceRefs: event.evidenceRefs ?? [],
        artifactRefs: event.artifactRefs ?? [],
        visual: event.visual ?? null,
        startedAt: event.startedAt ? new Date(event.startedAt) : null,
        emittedAt: new Date(event.emittedAt),
        finishedAt: event.finishedAt ? new Date(event.finishedAt) : null,
        updatedAt: new Date(event.emittedAt)
      })
      .onConflictDoUpdate({
        target: [atlasWorkflowActionCurrent.workflowId, atlasWorkflowActionCurrent.actionId],
        set: {
          parentActionId: event.parentActionId ?? null,
          dagNodeId: event.dagNodeId,
          workflowRevision,
          sequence,
          attempt: event.attempt,
          lane: event.lane,
          transport: event.transport ?? null,
          kind: event.kind,
          state: event.state,
          operation: event.operation,
          progress: event.progress ?? {},
          target: event.target ?? {},
          evidenceRefs: event.evidenceRefs ?? [],
          artifactRefs: event.artifactRefs ?? [],
          visual: event.visual ?? null,
          startedAt: event.startedAt ? new Date(event.startedAt) : null,
          emittedAt: new Date(event.emittedAt),
          finishedAt: event.finishedAt ? new Date(event.finishedAt) : null,
          updatedAt: new Date(event.emittedAt)
        },
        setWhere: gt(atlasWorkflowActionCurrent.sequence, 0)
      });

    await tx.insert(atlasWorkflowOutbox).values({
      workflowId,
      sequence,
      routingKey: `workflow.action.${event.kind}`,
      payload: event as unknown as Record<string, unknown>
    });

    return event;
  });
}

export async function replaceWorkflowDagEdges(
  workflowId: string,
  edges: readonly WorkflowDagEdgeV1[]
) {
  return db.transaction(async (tx) => {
    await tx.delete(atlasWorkflowDagEdges).where(eq(atlasWorkflowDagEdges.workflowId, workflowId));
    if (edges.length === 0) return [];
    return tx
      .insert(atlasWorkflowDagEdges)
      .values(
        edges.map((edge) => ({
          workflowId,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          relation: edge.relation ?? 'depends_on'
        }))
      )
      .returning();
  });
}

export async function listRecentAtlasWorkflows(limit = 50) {
  return db
    .select()
    .from(atlasWorkflowRuns)
    .orderBy(desc(atlasWorkflowRuns.updatedAt))
    .limit(Math.max(1, Math.min(250, limit)));
}

export async function getAtlasWorkflowSnapshot(workflowId: string) {
  const [workflow] = await db
    .select()
    .from(atlasWorkflowRuns)
    .where(eq(atlasWorkflowRuns.id, workflowId))
    .limit(1);
  if (!workflow) return null;

  const [actions, dagEdges, recentRows] = await Promise.all([
    db
      .select()
      .from(atlasWorkflowActionCurrent)
      .where(eq(atlasWorkflowActionCurrent.workflowId, workflowId))
      .orderBy(asc(atlasWorkflowActionCurrent.sequence)),
    db
      .select()
      .from(atlasWorkflowDagEdges)
      .where(eq(atlasWorkflowDagEdges.workflowId, workflowId))
      .orderBy(atlasWorkflowDagEdges.fromNodeId, atlasWorkflowDagEdges.toNodeId),
    db
      .select()
      .from(atlasWorkflowActionEvents)
      .where(eq(atlasWorkflowActionEvents.workflowId, workflowId))
      .orderBy(desc(atlasWorkflowActionEvents.sequence))
      .limit(100)
  ]);

  return {
    workflow,
    actions,
    dagEdges,
    events: recentRows.reverse().map(eventRowToContract)
  };
}

export async function listWorkflowEventsAfter(
  workflowId: string,
  sequence: number,
  limit = 250
): Promise<WorkflowActionEventV1[]> {
  const rows = await db
    .select()
    .from(atlasWorkflowActionEvents)
    .where(
      and(
        eq(atlasWorkflowActionEvents.workflowId, workflowId),
        gt(atlasWorkflowActionEvents.sequence, Math.max(0, Math.floor(sequence)))
      )
    )
    .orderBy(asc(atlasWorkflowActionEvents.sequence))
    .limit(Math.max(1, Math.min(1000, limit)));

  return rows.map(eventRowToContract);
}
