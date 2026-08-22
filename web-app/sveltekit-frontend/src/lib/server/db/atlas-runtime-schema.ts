import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { atlasAgents, atlasTasks } from './atlas-control-schema';

export type AtlasRuntimeJson = Record<string, unknown>;

/**
 * Durable execution state inspired by Paperclip's heartbeat/session split, but
 * revision-qualified for Parent Atlas. A task is intent/workflow state; a run
 * is one concrete execution attempt by one agent/runtime.
 */
export const atlasAgentRuns = pgTable(
  'atlas_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').references(() => atlasTasks.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => atlasAgents.id, { onDelete: 'cascade' }),
    protocol: text('protocol').notNull().default('internal'),
    adapterType: text('adapter_type').notNull().default('process'),
    invocationSource: text('invocation_source').notNull().default('on_demand'),
    status: text('status').notNull().default('QUEUED'),
    livenessState: text('liveness_state').notNull().default('unknown'),
    livenessReason: text('liveness_reason'),
    externalRunId: text('external_run_id'),
    sessionDisplayId: text('session_display_id'),
    workspaceRevision: text('workspace_revision'),
    sourceRevision: text('source_revision'),
    graphRevision: text('graph_revision'),
    featureRevision: text('feature_revision'),
    contextSnapshot: jsonb('context_snapshot').$type<AtlasRuntimeJson>().notNull().default({}),
    usage: jsonb('usage').$type<AtlasRuntimeJson>().notNull().default({}),
    result: jsonb('result').$type<AtlasRuntimeJson>().notNull().default({}),
    logStore: text('log_store'),
    logRef: text('log_ref'),
    logSha256: text('log_sha256'),
    logBytes: bigint('log_bytes', { mode: 'number' }),
    logCompressed: boolean('log_compressed').notNull().default(false),
    stdoutExcerpt: text('stdout_excerpt'),
    stderrExcerpt: text('stderr_excerpt'),
    errorCode: text('error_code'),
    errorReason: text('error_reason'),
    processPid: integer('process_pid'),
    processGroupId: integer('process_group_id'),
    lastOutputAt: timestamp('last_output_at', { withTimezone: true }),
    lastOutputSeq: integer('last_output_seq').notNull().default(0),
    lastOutputStream: text('last_output_stream'),
    lastUsefulActionAt: timestamp('last_useful_action_at', { withTimezone: true }),
    nextAction: text('next_action'),
    retryOfRunId: uuid('retry_of_run_id').references((): any => atlasAgentRuns.id, {
      onDelete: 'set null'
    }),
    retryAttempt: integer('retry_attempt').notNull().default(0),
    scheduledRetryAt: timestamp('scheduled_retry_at', { withTimezone: true }),
    scheduledRetryReason: text('scheduled_retry_reason'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    taskCreatedIdx: index('atlas_agent_runs_task_created_idx').on(table.taskId, table.createdAt),
    agentStatusIdx: index('atlas_agent_runs_agent_status_idx').on(table.agentId, table.status),
    statusOutputIdx: index('atlas_agent_runs_status_output_idx').on(table.status, table.lastOutputAt),
    retryIdx: index('atlas_agent_runs_retry_idx').on(table.scheduledRetryAt, table.status),
    taskContextIdx: index('atlas_agent_runs_context_task_idx').on(
      sql`(${table.contextSnapshot} ->> 'taskKey')`,
      table.createdAt
    )
  })
);

/** Durable per-agent/per-task protocol session; never canonical task truth. */
export const atlasAgentTaskSessions = pgTable(
  'atlas_agent_task_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => atlasAgents.id, { onDelete: 'cascade' }),
    taskKey: text('task_key').notNull(),
    protocol: text('protocol').notNull().default('internal'),
    adapterType: text('adapter_type').notNull().default('process'),
    sessionParams: jsonb('session_params').$type<AtlasRuntimeJson>().notNull().default({}),
    sessionDisplayId: text('session_display_id'),
    lastRunId: uuid('last_run_id').references(() => atlasAgentRuns.id, { onDelete: 'set null' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    agentTaskProtocolUq: uniqueIndex('atlas_agent_task_sessions_agent_task_protocol_uq').on(
      table.agentId,
      table.taskKey,
      table.protocol,
      table.adapterType
    ),
    taskUpdatedIdx: index('atlas_agent_task_sessions_task_updated_idx').on(table.taskKey, table.updatedAt)
  })
);

/** Explicit wakeup/resume request so agent continuation is auditable and idempotent. */
export const atlasAgentWakeups = pgTable(
  'atlas_agent_wakeups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => atlasAgents.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => atlasTasks.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key'),
    payload: jsonb('payload').$type<AtlasRuntimeJson>().notNull().default({}),
    requestedByType: text('requested_by_type').notNull().default('system'),
    requestedById: text('requested_by_id'),
    claimedByRunId: uuid('claimed_by_run_id').references(() => atlasAgentRuns.id, {
      onDelete: 'set null'
    }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    idempotencyUq: uniqueIndex('atlas_agent_wakeups_idempotency_uq')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    agentStatusIdx: index('atlas_agent_wakeups_agent_status_idx').on(table.agentId, table.status),
    taskStatusIdx: index('atlas_agent_wakeups_task_status_idx').on(table.taskId, table.status)
  })
);

/** Immutable-ish configuration revisions let approvals and run receipts name the exact agent policy used. */
export const atlasAgentConfigRevisions = pgTable(
  'atlas_agent_config_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => atlasAgents.id, { onDelete: 'cascade' }),
    revision: text('revision').notNull(),
    checksum: text('checksum').notNull(),
    config: jsonb('config').$type<AtlasRuntimeJson>().notNull().default({}),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    agentRevisionUq: uniqueIndex('atlas_agent_config_revisions_agent_revision_uq').on(
      table.agentId,
      table.revision
    ),
    agentCreatedIdx: index('atlas_agent_config_revisions_agent_created_idx').on(
      table.agentId,
      table.createdAt
    )
  })
);
