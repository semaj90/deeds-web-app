import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { atlasAgents, atlasTasks, type AtlasJsonObject } from './atlas-control-schema';

/**
 * Exclusive execution lease for a task. A task may have at most one lease row;
 * ownership is represented by an opaque token and a finite expiry. This makes
 * checkout recoverable after an agent/process disappears instead of relying on
 * invisible session state.
 */
export const atlasTaskLeases = pgTable(
  'atlas_task_leases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => atlasTasks.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => atlasAgents.id, { onDelete: 'cascade' }),
    leaseTokenHash: text('lease_token_hash').notNull(),
    epoch: integer('epoch').notNull().default(1),
    status: text('status').notNull().default('active'),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<AtlasJsonObject>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    taskUq: uniqueIndex('atlas_task_leases_task_uq').on(table.taskId),
    tokenUq: uniqueIndex('atlas_task_leases_token_uq').on(table.leaseTokenHash),
    agentStatusIdx: index('atlas_task_leases_agent_status_idx').on(table.agentId, table.status),
    expiryStatusIdx: index('atlas_task_leases_expiry_status_idx').on(table.expiresAt, table.status)
  })
);

/**
 * One immutable row per agent wake/run. The mutable lease says who may execute;
 * these rows explain what actually happened during each heartbeat.
 */
export const atlasHeartbeatRuns = pgTable(
  'atlas_heartbeat_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => atlasAgents.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => atlasTasks.id, { onDelete: 'set null' }),
    leaseId: uuid('lease_id').references(() => atlasTaskLeases.id, { onDelete: 'set null' }),
    trigger: text('trigger').notNull().default('schedule'),
    status: text('status').notNull().default('started'),
    protocol: text('protocol').notNull().default('internal'),
    runtimeEndpointId: text('runtime_endpoint_id'),
    workspaceRevision: text('workspace_revision'),
    inputSnapshot: jsonb('input_snapshot').$type<AtlasJsonObject>().notNull().default({}),
    resourceUsage: jsonb('resource_usage').$type<AtlasJsonObject>().notNull().default({}),
    resultSummary: jsonb('result_summary').$type<AtlasJsonObject>().notNull().default({}),
    errorReason: text('error_reason'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    agentCreatedIdx: index('atlas_heartbeat_runs_agent_created_idx').on(table.agentId, table.createdAt),
    taskCreatedIdx: index('atlas_heartbeat_runs_task_created_idx').on(table.taskId, table.createdAt),
    statusCreatedIdx: index('atlas_heartbeat_runs_status_created_idx').on(table.status, table.createdAt)
  })
);
