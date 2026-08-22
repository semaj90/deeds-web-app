import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  atlasAgents,
  atlasApprovals,
  atlasAuditEvents,
  atlasErrorIncidents,
  atlasTaskEvents,
  atlasTasks,
  atlasVerificationReceipts,
  db
} from '$lib/server/db';
import { atlasIncidentFingerprint, recoveryDisposition } from './error-recovery';
import {
  assertAtlasTaskTransition,
  isAtlasTaskStatus,
  mayEnterSucceeded,
  type AtlasTaskStatus
} from './task-state';

export interface AtlasActorV1 {
  type: 'user' | 'agent' | 'system';
  id?: string | null;
  agentId?: string | null;
}

export interface CreateAtlasTaskV1 {
  taskKey: string;
  idempotencyKey?: string | null;
  intent: string;
  description?: string | null;
  priority?: number;
  assignedAgentId?: string | null;
  protocol?: string;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  graphRevision?: string | null;
  featureRevision?: string | null;
  expectedChecksums?: Record<string, string>;
  resourceEnvelope?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  evidenceRefs?: string[];
  approvalRequired?: boolean;
  verificationRequired?: boolean;
  maxAttempts?: number;
  createdByUserId?: string | null;
}

function now() {
  return new Date();
}

function actorId(actor: AtlasActorV1): string | null {
  return actor.id ?? actor.agentId ?? null;
}

async function recordEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    taskId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actor: AtlasActorV1;
    payload?: Record<string, unknown>;
  }
) {
  await tx.insert(atlasTaskEvents).values({
    taskId: input.taskId,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorType: input.actor.type,
    actorId: actorId(input.actor),
    agentId: input.actor.agentId ?? null,
    payload: input.payload ?? {}
  });
}

async function recordAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    actor: AtlasActorV1;
    action: string;
    entityType: string;
    entityId: string;
    outcome?: string;
    reasonCode?: string | null;
    details?: Record<string, unknown>;
  }
) {
  await tx.insert(atlasAuditEvents).values({
    actorType: input.actor.type,
    actorId: actorId(input.actor),
    agentId: input.actor.agentId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: input.outcome ?? 'ok',
    reasonCode: input.reasonCode ?? null,
    details: input.details ?? {}
  });
}

export async function createAtlasTask(input: CreateAtlasTaskV1) {
  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(atlasTasks)
        .where(eq(atlasTasks.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return existing;
    }

    const [task] = await tx
      .insert(atlasTasks)
      .values({
        taskKey: input.taskKey,
        idempotencyKey: input.idempotencyKey ?? null,
        intent: input.intent,
        description: input.description ?? null,
        priority: Math.max(0, Math.min(100, input.priority ?? 50)),
        assignedAgentId: input.assignedAgentId ?? null,
        protocol: input.protocol ?? 'internal',
        workspaceRevision: input.workspaceRevision ?? null,
        sourceRevision: input.sourceRevision ?? null,
        graphRevision: input.graphRevision ?? null,
        featureRevision: input.featureRevision ?? null,
        expectedChecksums: input.expectedChecksums ?? {},
        resourceEnvelope: input.resourceEnvelope ?? {},
        requirements: input.requirements ?? {},
        evidenceRefs: input.evidenceRefs ?? [],
        approvalRequired: input.approvalRequired ?? true,
        verificationRequired: input.verificationRequired ?? true,
        maxAttempts: Math.max(1, input.maxAttempts ?? 3),
        createdByUserId: input.createdByUserId ?? null
      })
      .returning();

    const actor: AtlasActorV1 = {
      type: input.createdByUserId ? 'user' : 'system',
      id: input.createdByUserId ?? null
    };
    await recordEvent(tx, {
      taskId: task.id,
      eventType: 'task.created',
      toStatus: 'QUEUED',
      actor,
      payload: { intent: input.intent }
    });
    await recordAudit(tx, {
      actor,
      action: 'task.create',
      entityType: 'atlas_task',
      entityId: task.id
    });
    return task;
  });
}

export async function listAtlasTasks(limit = 100) {
  return db.select().from(atlasTasks).orderBy(desc(atlasTasks.updatedAt)).limit(Math.min(500, limit));
}

export async function claimAtlasTask(taskId: string, agentId: string) {
  return db.transaction(async (tx) => {
    const [agent] = await tx.select().from(atlasAgents).where(eq(atlasAgents.id, agentId)).limit(1);
    if (!agent) throw new Error('Atlas agent not found');
    if (!['idle', 'active', 'running'].includes(agent.status)) {
      throw new Error(`Atlas agent '${agent.name}' is not dispatchable (${agent.status})`);
    }

    const [claimed] = await tx
      .update(atlasTasks)
      .set({
        status: 'CLAIMED',
        assignedAgentId: agentId,
        claimedAt: now(),
        updatedAt: now(),
        attemptCount: sql`${atlasTasks.attemptCount} + 1`
      })
      .where(and(eq(atlasTasks.id, taskId), eq(atlasTasks.status, 'QUEUED')))
      .returning();

    if (!claimed) throw new Error('Task is no longer claimable');
    const actor: AtlasActorV1 = { type: 'agent', id: agentId, agentId };
    await recordEvent(tx, {
      taskId,
      eventType: 'task.claimed',
      fromStatus: 'QUEUED',
      toStatus: 'CLAIMED',
      actor
    });
    return claimed;
  });
}

export async function transitionAtlasTask(input: {
  taskId: string;
  toStatus: AtlasTaskStatus;
  actor: AtlasActorV1;
  reason?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(atlasTasks).where(eq(atlasTasks.id, input.taskId)).limit(1);
    if (!current || !isAtlasTaskStatus(current.status)) throw new Error('Atlas task not found or has invalid status');

    assertAtlasTaskTransition(current.status, input.toStatus);

    if (input.toStatus === 'SUCCEEDED') {
      const [passingReceipt] = await tx
        .select({ id: atlasVerificationReceipts.id })
        .from(atlasVerificationReceipts)
        .where(
          and(
            eq(atlasVerificationReceipts.taskId, input.taskId),
            eq(atlasVerificationReceipts.status, 'PASS')
          )
        )
        .orderBy(desc(atlasVerificationReceipts.createdAt))
        .limit(1);
      if (!mayEnterSucceeded(current.status, current.verificationRequired, Boolean(passingReceipt))) {
        throw new Error('Task cannot enter SUCCEEDED without the required passing verification receipt');
      }
    }

    const [updated] = await tx
      .update(atlasTasks)
      .set({
        status: input.toStatus,
        errorReason: input.toStatus === 'FAILED' ? input.reason ?? current.errorReason : current.errorReason,
        blockedReason: input.toStatus === 'BLOCKED' ? input.reason ?? current.blockedReason : current.blockedReason,
        startedAt: input.toStatus === 'RUNNING' ? current.startedAt ?? now() : current.startedAt,
        completedAt: ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(input.toStatus) ? now() : null,
        updatedAt: now()
      })
      .where(and(eq(atlasTasks.id, input.taskId), eq(atlasTasks.status, current.status)))
      .returning();
    if (!updated) throw new Error('Task changed concurrently; retry from fresh state');

    await recordEvent(tx, {
      taskId: input.taskId,
      eventType: 'task.transitioned',
      fromStatus: current.status,
      toStatus: input.toStatus,
      actor: input.actor,
      payload: input.reason ? { reason: input.reason } : {}
    });
    await recordAudit(tx, {
      actor: input.actor,
      action: 'task.transition',
      entityType: 'atlas_task',
      entityId: input.taskId,
      details: { from: current.status, to: input.toStatus, reason: input.reason ?? null }
    });
    return updated;
  });
}

export async function requestAtlasApproval(input: {
  taskId: string;
  type?: string;
  actor: AtlasActorV1;
  payload?: Record<string, unknown>;
  requiredRevision?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(atlasTasks).where(eq(atlasTasks.id, input.taskId)).limit(1);
    if (!task || !isAtlasTaskStatus(task.status)) throw new Error('Atlas task not found');
    if (task.status !== 'RUNNING') throw new Error('Approval may only be requested from RUNNING');

    const [approval] = await tx
      .insert(atlasApprovals)
      .values({
        taskId: input.taskId,
        type: input.type ?? 'mutation',
        requestedByAgentId: input.actor.agentId ?? null,
        requestedByUserId: input.actor.type === 'user' ? input.actor.id ?? null : null,
        payload: input.payload ?? {},
        requiredRevision: input.requiredRevision ?? task.workspaceRevision
      })
      .returning();

    const [updated] = await tx
      .update(atlasTasks)
      .set({ status: 'AWAITING_APPROVAL', updatedAt: now() })
      .where(and(eq(atlasTasks.id, input.taskId), eq(atlasTasks.status, 'RUNNING')))
      .returning();
    if (!updated) throw new Error('Task changed concurrently while requesting approval');

    await recordEvent(tx, {
      taskId: input.taskId,
      eventType: 'approval.requested',
      fromStatus: 'RUNNING',
      toStatus: 'AWAITING_APPROVAL',
      actor: input.actor,
      payload: { approvalId: approval.id, type: approval.type }
    });
    return approval;
  });
}

export async function decideAtlasApproval(input: {
  approvalId: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
  userId: string;
  note?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [approval] = await tx
      .select()
      .from(atlasApprovals)
      .where(eq(atlasApprovals.id, input.approvalId))
      .limit(1);
    if (!approval || !['pending', 'revision_requested'].includes(approval.status)) {
      throw new Error('Approval is not pending');
    }

    const [task] = await tx.select().from(atlasTasks).where(eq(atlasTasks.id, approval.taskId)).limit(1);
    if (!task || task.status !== 'AWAITING_APPROVAL') throw new Error('Task is not awaiting this approval');
    if (approval.requiredRevision && task.workspaceRevision !== approval.requiredRevision) {
      throw new Error('Approval revision no longer matches the task revision');
    }

    const [decided] = await tx
      .update(atlasApprovals)
      .set({
        status: input.decision,
        decisionNote: input.note ?? null,
        decidedByUserId: input.userId,
        decidedAt: now(),
        updatedAt: now()
      })
      .where(and(eq(atlasApprovals.id, input.approvalId), inArray(atlasApprovals.status, ['pending', 'revision_requested'])))
      .returning();
    if (!decided) throw new Error('Approval changed concurrently');

    const toStatus: AtlasTaskStatus =
      input.decision === 'approved' ? 'RUNNING' : input.decision === 'revision_requested' ? 'BLOCKED' : 'FAILED';
    const [updatedTask] = await tx
      .update(atlasTasks)
      .set({
        status: toStatus,
        blockedReason: input.decision === 'revision_requested' ? input.note ?? 'Revision requested' : task.blockedReason,
        errorReason: input.decision === 'rejected' ? input.note ?? 'Approval rejected' : task.errorReason,
        completedAt: input.decision === 'rejected' ? now() : null,
        updatedAt: now()
      })
      .where(and(eq(atlasTasks.id, task.id), eq(atlasTasks.status, 'AWAITING_APPROVAL')))
      .returning();
    if (!updatedTask) throw new Error('Task changed concurrently during approval decision');

    const actor: AtlasActorV1 = { type: 'user', id: input.userId };
    await recordEvent(tx, {
      taskId: task.id,
      eventType: `approval.${input.decision}`,
      fromStatus: 'AWAITING_APPROVAL',
      toStatus,
      actor,
      payload: { approvalId: approval.id, note: input.note ?? null }
    });
    await recordAudit(tx, {
      actor,
      action: `approval.${input.decision}`,
      entityType: 'atlas_approval',
      entityId: approval.id,
      details: { taskId: task.id }
    });
    return { approval: decided, task: updatedTask };
  });
}

export async function recordVerification(input: {
  taskId: string;
  status: 'PASS' | 'FAIL';
  actor: AtlasActorV1;
  checksum: string;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  expectedChecksums?: Record<string, string>;
  observedChecksums?: Record<string, string>;
  diffRefs?: string[];
  screenshotRefs?: string[];
  testRefs?: string[];
  evidenceRefs?: string[];
  metrics?: Record<string, unknown>;
  failureReason?: string | null;
}) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(atlasTasks).where(eq(atlasTasks.id, input.taskId)).limit(1);
    if (!task || task.status !== 'VERIFYING') throw new Error('Task must be VERIFYING before receipt insertion');
    if (task.workspaceRevision && input.workspaceRevision && task.workspaceRevision !== input.workspaceRevision) {
      throw new Error('Verification receipt workspace revision mismatch');
    }

    const [receipt] = await tx
      .insert(atlasVerificationReceipts)
      .values({
        taskId: input.taskId,
        status: input.status,
        verifierType: input.actor.type,
        verifierId: input.actor.id ?? null,
        verifierAgentId: input.actor.agentId ?? null,
        workspaceRevision: input.workspaceRevision ?? task.workspaceRevision,
        sourceRevision: input.sourceRevision ?? task.sourceRevision,
        expectedChecksums: input.expectedChecksums ?? task.expectedChecksums,
        observedChecksums: input.observedChecksums ?? {},
        diffRefs: input.diffRefs ?? [],
        screenshotRefs: input.screenshotRefs ?? [],
        testRefs: input.testRefs ?? [],
        evidenceRefs: input.evidenceRefs ?? [],
        metrics: input.metrics ?? {},
        failureReason: input.failureReason ?? null,
        checksum: input.checksum
      })
      .returning();

    const disposition = recoveryDisposition({
      verified: input.status === 'PASS',
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts
    });
    const toStatus: AtlasTaskStatus =
      disposition === 'RESOLVE' ? 'SUCCEEDED' : disposition === 'RETRY' ? 'RUNNING' : 'FAILED';

    const [updated] = await tx
      .update(atlasTasks)
      .set({
        status: toStatus,
        errorReason: input.status === 'FAIL' ? input.failureReason ?? 'Verification failed' : null,
        completedAt: ['SUCCEEDED', 'FAILED'].includes(toStatus) ? now() : null,
        updatedAt: now()
      })
      .where(and(eq(atlasTasks.id, task.id), eq(atlasTasks.status, 'VERIFYING')))
      .returning();
    if (!updated) throw new Error('Task changed concurrently during verification');

    await recordEvent(tx, {
      taskId: task.id,
      eventType: input.status === 'PASS' ? 'verification.passed' : 'verification.failed',
      fromStatus: 'VERIFYING',
      toStatus,
      actor: input.actor,
      payload: { receiptId: receipt.id, disposition }
    });
    return { receipt, task: updated, disposition };
  });
}

export async function openAtlasIncident(input: {
  taskId?: string | null;
  kind: string;
  severity?: string;
  message: string;
  sourceRef?: string | null;
  workspaceRevision?: string | null;
  canonicalId?: string | null;
  toolName?: string | null;
  testName?: string | null;
  evidence?: Record<string, unknown>;
}) {
  const fingerprint = atlasIncidentFingerprint(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(atlasErrorIncidents)
      .where(
        and(
          eq(atlasErrorIncidents.fingerprint, fingerprint),
          inArray(atlasErrorIncidents.status, ['active', 'escalated'])
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(atlasErrorIncidents)
        .set({
          occurrenceCount: sql`${atlasErrorIncidents.occurrenceCount} + 1`,
          lastSeenAt: now(),
          evidence: { ...(existing.evidence ?? {}), ...(input.evidence ?? {}) },
          updatedAt: now()
        })
        .where(eq(atlasErrorIncidents.id, existing.id))
        .returning();
      return updated;
    }

    const [incident] = await tx
      .insert(atlasErrorIncidents)
      .values({
        taskId: input.taskId ?? null,
        fingerprint,
        kind: input.kind,
        severity: input.severity ?? 'error',
        message: input.message,
        sourceRef: input.sourceRef ?? null,
        workspaceRevision: input.workspaceRevision ?? null,
        evidence: input.evidence ?? {}
      })
      .returning();
    return incident;
  });
}

export async function listPendingAtlasApprovals(limit = 100) {
  return db
    .select()
    .from(atlasApprovals)
    .where(inArray(atlasApprovals.status, ['pending', 'revision_requested']))
    .orderBy(desc(atlasApprovals.createdAt))
    .limit(Math.min(500, limit));
}

export async function listActiveAtlasIncidents(limit = 100) {
  return db
    .select()
    .from(atlasErrorIncidents)
    .where(inArray(atlasErrorIncidents.status, ['active', 'escalated']))
    .orderBy(desc(atlasErrorIncidents.lastSeenAt))
    .limit(Math.min(500, limit));
}
