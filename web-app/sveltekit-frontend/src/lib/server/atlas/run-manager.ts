import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  atlasAgentRuns,
  atlasAgentTaskSessions,
  atlasAgentWakeups,
  atlasAgents,
  atlasAuditEvents,
  atlasTasks,
  db
} from '$lib/server/db';
import { assertAtlasAgentAuthorized } from './governance';

export const ATLAS_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'WAITING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
] as const;

export type AtlasRunStatus = (typeof ATLAS_RUN_STATUSES)[number];

export interface CreateAtlasRunV1 {
  taskId?: string | null;
  agentId: string;
  protocol?: string;
  adapterType?: string;
  invocationSource?: string;
  externalRunId?: string | null;
  sessionDisplayId?: string | null;
  contextSnapshot?: Record<string, unknown>;
  retryOfRunId?: string | null;
  retryAttempt?: number;
}

function now() {
  return new Date();
}

export async function createAtlasAgentRun(input: CreateAtlasRunV1) {
  return db.transaction(async (tx) => {
    const [agent] = await tx.select().from(atlasAgents).where(eq(atlasAgents.id, input.agentId)).limit(1);
    if (!agent) throw new Error('Atlas agent not found');
    if (!['idle', 'active', 'running'].includes(agent.status)) {
      throw new Error(`Atlas agent '${agent.name}' is not runnable (${agent.status})`);
    }
    assertAtlasAgentAuthorized(agent.permissions, { operation: 'task.run' });

    let task: typeof atlasTasks.$inferSelect | undefined;
    if (input.taskId) {
      [task] = await tx.select().from(atlasTasks).where(eq(atlasTasks.id, input.taskId)).limit(1);
      if (!task) throw new Error('Atlas task not found');
      if (task.assignedAgentId && task.assignedAgentId !== input.agentId) {
        throw new Error('Atlas task is assigned to a different agent');
      }
      if (!['CLAIMED', 'RUNNING', 'VERIFYING', 'BLOCKED'].includes(task.status)) {
        throw new Error(`Atlas task cannot create a run from status '${task.status}'`);
      }
    }

    const [run] = await tx
      .insert(atlasAgentRuns)
      .values({
        taskId: input.taskId ?? null,
        agentId: input.agentId,
        protocol: input.protocol ?? agent.protocol,
        adapterType: input.adapterType ?? 'process',
        invocationSource: input.invocationSource ?? 'on_demand',
        status: 'QUEUED',
        externalRunId: input.externalRunId ?? null,
        sessionDisplayId: input.sessionDisplayId ?? null,
        workspaceRevision: task?.workspaceRevision ?? null,
        sourceRevision: task?.sourceRevision ?? null,
        graphRevision: task?.graphRevision ?? null,
        featureRevision: task?.featureRevision ?? null,
        contextSnapshot: {
          ...(input.contextSnapshot ?? {}),
          taskKey: task?.taskKey ?? null,
          taskId: task?.id ?? null,
          intent: task?.intent ?? null
        },
        retryOfRunId: input.retryOfRunId ?? null,
        retryAttempt: Math.max(0, input.retryAttempt ?? 0)
      })
      .returning();

    await tx.insert(atlasAuditEvents).values({
      actorType: 'agent',
      actorId: input.agentId,
      agentId: input.agentId,
      action: 'run.create',
      entityType: 'atlas_agent_run',
      entityId: run.id,
      details: { taskId: task?.id ?? null, protocol: run.protocol, retryAttempt: run.retryAttempt }
    });
    return run;
  });
}

export async function startAtlasAgentRun(runId: string) {
  const [run] = await db
    .update(atlasAgentRuns)
    .set({
      status: 'RUNNING',
      livenessState: 'alive',
      livenessReason: null,
      startedAt: now(),
      lastUsefulActionAt: now(),
      updatedAt: now()
    })
    .where(and(eq(atlasAgentRuns.id, runId), eq(atlasAgentRuns.status, 'QUEUED')))
    .returning();
  if (!run) throw new Error('Atlas run is no longer startable');
  return run;
}

export async function heartbeatAtlasAgentRun(input: {
  runId: string;
  livenessState?: 'alive' | 'idle' | 'stalled' | 'unknown';
  livenessReason?: string | null;
  nextAction?: string | null;
  usefulAction?: boolean;
  usage?: Record<string, unknown>;
  processPid?: number | null;
  processGroupId?: number | null;
}) {
  const timestamp = now();
  const [run] = await db
    .update(atlasAgentRuns)
    .set({
      livenessState: input.livenessState ?? 'alive',
      livenessReason: input.livenessReason ?? null,
      nextAction: input.nextAction ?? null,
      usage: input.usage ?? {},
      processPid: input.processPid ?? undefined,
      processGroupId: input.processGroupId ?? undefined,
      lastUsefulActionAt: input.usefulAction ? timestamp : undefined,
      updatedAt: timestamp
    })
    .where(and(eq(atlasAgentRuns.id, input.runId), inArray(atlasAgentRuns.status, ['RUNNING', 'WAITING'])))
    .returning();
  if (!run) throw new Error('Atlas run is not active');

  await db
    .update(atlasAgents)
    .set({ lastHeartbeatAt: timestamp, status: 'running', updatedAt: timestamp })
    .where(eq(atlasAgents.id, run.agentId));
  return run;
}

export async function recordAtlasRunOutput(input: {
  runId: string;
  sequence: number;
  stream: 'stdout' | 'stderr' | 'event';
  byteCount?: number;
  stdoutExcerpt?: string | null;
  stderrExcerpt?: string | null;
  logStore?: string | null;
  logRef?: string | null;
  logSha256?: string | null;
  logBytes?: number | null;
  logCompressed?: boolean;
}) {
  const [current] = await db.select().from(atlasAgentRuns).where(eq(atlasAgentRuns.id, input.runId)).limit(1);
  if (!current || !['RUNNING', 'WAITING'].includes(current.status)) throw new Error('Atlas run is not active');
  if (input.sequence <= current.lastOutputSeq) return current;

  const [updated] = await db
    .update(atlasAgentRuns)
    .set({
      lastOutputAt: now(),
      lastOutputSeq: input.sequence,
      lastOutputStream: input.stream,
      stdoutExcerpt: input.stdoutExcerpt ?? current.stdoutExcerpt,
      stderrExcerpt: input.stderrExcerpt ?? current.stderrExcerpt,
      logStore: input.logStore ?? current.logStore,
      logRef: input.logRef ?? current.logRef,
      logSha256: input.logSha256 ?? current.logSha256,
      logBytes: input.logBytes ?? current.logBytes,
      logCompressed: input.logCompressed ?? current.logCompressed,
      updatedAt: now()
    })
    .where(and(eq(atlasAgentRuns.id, input.runId), eq(atlasAgentRuns.lastOutputSeq, current.lastOutputSeq)))
    .returning();
  if (!updated) throw new Error('Atlas run output changed concurrently');
  return updated;
}

export async function finishAtlasAgentRun(input: {
  runId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  result?: Record<string, unknown>;
  errorCode?: string | null;
  errorReason?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(atlasAgentRuns).where(eq(atlasAgentRuns.id, input.runId)).limit(1);
    if (!current || !['QUEUED', 'RUNNING', 'WAITING'].includes(current.status)) {
      throw new Error('Atlas run is already terminal or missing');
    }

    const [run] = await tx
      .update(atlasAgentRuns)
      .set({
        status: input.status,
        livenessState: input.status === 'SUCCEEDED' ? 'complete' : 'stopped',
        result: input.result ?? {},
        errorCode: input.errorCode ?? null,
        errorReason: input.errorReason ?? null,
        finishedAt: now(),
        updatedAt: now()
      })
      .where(and(eq(atlasAgentRuns.id, input.runId), eq(atlasAgentRuns.status, current.status)))
      .returning();
    if (!run) throw new Error('Atlas run changed concurrently');

    await tx
      .update(atlasAgents)
      .set({
        status: input.status === 'FAILED' ? 'error' : 'idle',
        errorReason: input.status === 'FAILED' ? input.errorReason ?? 'Run failed' : null,
        updatedAt: now()
      })
      .where(eq(atlasAgents.id, run.agentId));

    await tx.insert(atlasAuditEvents).values({
      actorType: 'agent',
      actorId: run.agentId,
      agentId: run.agentId,
      action: `run.${input.status.toLowerCase()}`,
      entityType: 'atlas_agent_run',
      entityId: run.id,
      outcome: input.status === 'SUCCEEDED' ? 'ok' : input.status.toLowerCase(),
      reasonCode: input.errorCode ?? null,
      details: { taskId: run.taskId, errorReason: input.errorReason ?? null }
    });
    return run;
  });
}

export async function upsertAtlasAgentTaskSession(input: {
  agentId: string;
  taskKey: string;
  protocol: string;
  adapterType: string;
  sessionDisplayId?: string | null;
  sessionParams?: Record<string, unknown>;
  lastRunId?: string | null;
  lastError?: string | null;
}) {
  const [session] = await db
    .insert(atlasAgentTaskSessions)
    .values({
      agentId: input.agentId,
      taskKey: input.taskKey,
      protocol: input.protocol,
      adapterType: input.adapterType,
      sessionDisplayId: input.sessionDisplayId ?? null,
      sessionParams: input.sessionParams ?? {},
      lastRunId: input.lastRunId ?? null,
      lastError: input.lastError ?? null
    })
    .onConflictDoUpdate({
      target: [
        atlasAgentTaskSessions.agentId,
        atlasAgentTaskSessions.taskKey,
        atlasAgentTaskSessions.protocol,
        atlasAgentTaskSessions.adapterType
      ],
      set: {
        sessionDisplayId: input.sessionDisplayId ?? null,
        sessionParams: input.sessionParams ?? {},
        lastRunId: input.lastRunId ?? null,
        lastError: input.lastError ?? null,
        updatedAt: now()
      }
    })
    .returning();
  return session;
}

export async function requestAtlasAgentWakeup(input: {
  agentId: string;
  taskId?: string | null;
  reason: string;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
  requestedByType?: 'user' | 'agent' | 'system';
  requestedById?: string | null;
}) {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(atlasAgentWakeups)
      .where(eq(atlasAgentWakeups.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return existing;
  }

  const [wakeup] = await db
    .insert(atlasAgentWakeups)
    .values({
      agentId: input.agentId,
      taskId: input.taskId ?? null,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey ?? null,
      payload: input.payload ?? {},
      requestedByType: input.requestedByType ?? 'system',
      requestedById: input.requestedById ?? null
    })
    .returning();
  return wakeup;
}

export async function listRecentAtlasAgentRuns(limit = 100) {
  return db.select().from(atlasAgentRuns).orderBy(desc(atlasAgentRuns.createdAt)).limit(Math.min(500, limit));
}
