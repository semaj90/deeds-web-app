import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lte, sql } from 'drizzle-orm';
import {
  atlasAgents,
  atlasAuditEvents,
  atlasHeartbeatRuns,
  atlasTaskEvents,
  atlasTaskLeases,
  atlasTasks,
  db
} from '$lib/server/db';

const DEFAULT_LEASE_MS = 60_000;
const MAX_LEASE_MS = 15 * 60_000;

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function newLeaseToken(): string {
  return randomBytes(32).toString('base64url');
}

function clampLeaseMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LEASE_MS;
  return Math.max(5_000, Math.min(MAX_LEASE_MS, Math.floor(value ?? DEFAULT_LEASE_MS)));
}

export interface AtlasLeaseGrantV1 {
  leaseId: string;
  leaseToken: string;
  epoch: number;
  taskId: string;
  agentId: string;
  expiresAt: Date;
}

/**
 * Atomically changes QUEUED -> CLAIMED and creates an exclusive finite lease.
 * The raw lease token is returned once and only its SHA-256 digest is stored.
 */
export async function claimAtlasTaskWithLease(input: {
  taskId: string;
  agentId: string;
  ttlMs?: number;
}): Promise<AtlasLeaseGrantV1> {
  const ttlMs = clampLeaseMs(input.ttlMs);
  const leaseToken = newLeaseToken();
  const leaseTokenHash = tokenHash(leaseToken);
  const acquiredAt = new Date();
  const expiresAt = new Date(acquiredAt.getTime() + ttlMs);

  return db.transaction(async (tx) => {
    const [agent] = await tx.select().from(atlasAgents).where(eq(atlasAgents.id, input.agentId)).limit(1);
    if (!agent) throw new Error('Atlas agent not found');
    if (!['idle', 'active', 'running'].includes(agent.status)) {
      throw new Error(`Atlas agent '${agent.name}' is not dispatchable (${agent.status})`);
    }

    const [claimed] = await tx
      .update(atlasTasks)
      .set({
        status: 'CLAIMED',
        assignedAgentId: input.agentId,
        claimedAt: acquiredAt,
        updatedAt: acquiredAt,
        attemptCount: sql`${atlasTasks.attemptCount} + 1`
      })
      .where(
        and(
          eq(atlasTasks.id, input.taskId),
          eq(atlasTasks.status, 'QUEUED'),
          sql`${atlasTasks.attemptCount} < ${atlasTasks.maxAttempts}`
        )
      )
      .returning();

    if (!claimed) {
      throw new Error('Task is not claimable, changed concurrently, or exhausted its attempt budget');
    }

    // A terminal/expired lease row may remain from an earlier attempt. The task
    // status update above is the serialization point, so replacing it here is safe.
    await tx.delete(atlasTaskLeases).where(eq(atlasTaskLeases.taskId, input.taskId));

    const [lease] = await tx
      .insert(atlasTaskLeases)
      .values({
        taskId: input.taskId,
        agentId: input.agentId,
        leaseTokenHash,
        epoch: claimed.attemptCount,
        status: 'active',
        acquiredAt,
        heartbeatAt: acquiredAt,
        expiresAt
      })
      .returning();

    await tx.insert(atlasTaskEvents).values({
      taskId: input.taskId,
      eventType: 'task.lease_acquired',
      fromStatus: 'QUEUED',
      toStatus: 'CLAIMED',
      actorType: 'agent',
      actorId: input.agentId,
      agentId: input.agentId,
      payload: { leaseId: lease.id, epoch: lease.epoch, expiresAt: expiresAt.toISOString() }
    });

    await tx.insert(atlasAuditEvents).values({
      actorType: 'agent',
      actorId: input.agentId,
      agentId: input.agentId,
      action: 'task.lease.acquire',
      entityType: 'atlas_task',
      entityId: input.taskId,
      details: { leaseId: lease.id, epoch: lease.epoch }
    });

    return {
      leaseId: lease.id,
      leaseToken,
      epoch: lease.epoch,
      taskId: input.taskId,
      agentId: input.agentId,
      expiresAt
    };
  });
}

/** Renew a live lease. A stale token or expired lease fails closed. */
export async function heartbeatAtlasLease(input: {
  leaseId: string;
  leaseToken: string;
  ttlMs?: number;
  resourceUsage?: Record<string, unknown>;
}) {
  const ttlMs = clampLeaseMs(input.ttlMs);
  const heartbeatAt = new Date();
  const expiresAt = new Date(heartbeatAt.getTime() + ttlMs);
  const hash = tokenHash(input.leaseToken);

  const [lease] = await db
    .update(atlasTaskLeases)
    .set({ heartbeatAt, expiresAt, updatedAt: heartbeatAt })
    .where(
      and(
        eq(atlasTaskLeases.id, input.leaseId),
        eq(atlasTaskLeases.leaseTokenHash, hash),
        eq(atlasTaskLeases.status, 'active'),
        sql`${atlasTaskLeases.expiresAt} > ${heartbeatAt}`
      )
    )
    .returning();

  if (!lease) throw new Error('Lease is invalid, released, or expired');

  await db
    .update(atlasAgents)
    .set({ lastHeartbeatAt: heartbeatAt, status: 'running', updatedAt: heartbeatAt })
    .where(eq(atlasAgents.id, lease.agentId));

  return { leaseId: lease.id, epoch: lease.epoch, expiresAt };
}

export async function releaseAtlasLease(input: {
  leaseId: string;
  leaseToken: string;
  reason?: string;
}) {
  const releasedAt = new Date();
  const hash = tokenHash(input.leaseToken);
  const [lease] = await db
    .update(atlasTaskLeases)
    .set({ status: 'released', releasedAt, updatedAt: releasedAt })
    .where(
      and(
        eq(atlasTaskLeases.id, input.leaseId),
        eq(atlasTaskLeases.leaseTokenHash, hash),
        eq(atlasTaskLeases.status, 'active')
      )
    )
    .returning();
  if (!lease) throw new Error('Lease is invalid or already inactive');

  await db.insert(atlasTaskEvents).values({
    taskId: lease.taskId,
    eventType: 'task.lease_released',
    actorType: 'agent',
    actorId: lease.agentId,
    agentId: lease.agentId,
    payload: { leaseId: lease.id, reason: input.reason ?? null }
  });
  return lease;
}

export async function startAtlasHeartbeatRun(input: {
  agentId: string;
  taskId?: string | null;
  leaseId?: string | null;
  trigger?: string;
  protocol?: string;
  workspaceRevision?: string | null;
  inputSnapshot?: Record<string, unknown>;
}) {
  const [run] = await db
    .insert(atlasHeartbeatRuns)
    .values({
      agentId: input.agentId,
      taskId: input.taskId ?? null,
      leaseId: input.leaseId ?? null,
      trigger: input.trigger ?? 'schedule',
      protocol: input.protocol ?? 'internal',
      workspaceRevision: input.workspaceRevision ?? null,
      inputSnapshot: input.inputSnapshot ?? {}
    })
    .returning();
  return run;
}

export async function completeAtlasHeartbeatRun(input: {
  runId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  resourceUsage?: Record<string, unknown>;
  resultSummary?: Record<string, unknown>;
  errorReason?: string | null;
}) {
  const [run] = await db
    .update(atlasHeartbeatRuns)
    .set({
      status: input.status,
      resourceUsage: input.resourceUsage ?? {},
      resultSummary: input.resultSummary ?? {},
      errorReason: input.errorReason ?? null,
      completedAt: new Date()
    })
    .where(and(eq(atlasHeartbeatRuns.id, input.runId), eq(atlasHeartbeatRuns.status, 'started')))
    .returning();
  if (!run) throw new Error('Heartbeat run is missing or already completed');
  return run;
}

/**
 * Requeue expired CLAIMED/RUNNING work. This is deliberately explicit rather
 * than a background side effect; call it from the scheduler/watchdog lane.
 */
export async function reclaimExpiredAtlasLeases(limit = 100) {
  const observedAt = new Date();
  const expired = await db
    .select()
    .from(atlasTaskLeases)
    .where(and(eq(atlasTaskLeases.status, 'active'), lte(atlasTaskLeases.expiresAt, observedAt)))
    .limit(Math.max(1, Math.min(500, limit)));

  const reclaimed: string[] = [];
  for (const lease of expired) {
    await db.transaction(async (tx) => {
      const [expiredLease] = await tx
        .update(atlasTaskLeases)
        .set({ status: 'expired', releasedAt: observedAt, updatedAt: observedAt })
        .where(
          and(
            eq(atlasTaskLeases.id, lease.id),
            eq(atlasTaskLeases.status, 'active'),
            lte(atlasTaskLeases.expiresAt, observedAt)
          )
        )
        .returning();
      if (!expiredLease) return;

      const [task] = await tx.select().from(atlasTasks).where(eq(atlasTasks.id, lease.taskId)).limit(1);
      if (!task || !['CLAIMED', 'RUNNING'].includes(task.status)) return;

      const exhausted = task.attemptCount >= task.maxAttempts;
      const nextStatus = exhausted ? 'BLOCKED' : 'QUEUED';
      await tx
        .update(atlasTasks)
        .set({
          status: nextStatus,
          assignedAgentId: exhausted ? task.assignedAgentId : null,
          blockedReason: exhausted ? 'Execution lease expired and retry budget is exhausted' : task.blockedReason,
          updatedAt: observedAt
        })
        .where(and(eq(atlasTasks.id, task.id), eq(atlasTasks.status, task.status)));

      await tx.insert(atlasTaskEvents).values({
        taskId: task.id,
        eventType: 'task.lease_expired',
        fromStatus: task.status,
        toStatus: nextStatus,
        actorType: 'system',
        payload: { leaseId: lease.id, epoch: lease.epoch, exhausted }
      });
      reclaimed.push(task.id);
    });
  }
  return reclaimed;
}
