import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

export type AtlasWorkflowJson = Record<string, unknown>;

export const atlasWorkflowRuns = pgTable(
  'atlas_workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowKey: text('workflow_key').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('queued'),
    revision: integer('revision').notNull().default(0),
    lastSequence: integer('last_sequence').notNull().default(0),
    source: text('source').notNull().default('parent-atlas'),
    workspaceRevision: text('workspace_revision'),
    metadata: jsonb('metadata').$type<AtlasWorkflowJson>().notNull().default({}),
    createdByUserId: text('created_by_user_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    keyUq: uniqueIndex('atlas_workflow_runs_key_uq').on(table.workflowKey),
    statusUpdatedIdx: index('atlas_workflow_runs_status_updated_idx').on(table.status, table.updatedAt)
  })
);

export const atlasWorkflowActionEvents = pgTable(
  'atlas_workflow_action_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => atlasWorkflowRuns.id, { onDelete: 'cascade' }),
    workflowRevision: integer('workflow_revision').notNull(),
    sequence: integer('sequence').notNull(),
    actionId: text('action_id').notNull(),
    parentActionId: text('parent_action_id'),
    dagNodeId: text('dag_node_id').notNull(),
    attempt: integer('attempt').notNull().default(0),
    lane: text('lane').notNull(),
    transport: text('transport'),
    kind: text('kind').notNull(),
    state: text('state').notNull(),
    operation: text('operation').notNull(),
    progress: jsonb('progress').$type<AtlasWorkflowJson>().notNull().default({}),
    target: jsonb('target').$type<AtlasWorkflowJson>().notNull().default({}),
    evidenceRefs: jsonb('evidence_refs').$type<string[]>().notNull().default([]),
    artifactRefs: jsonb('artifact_refs').$type<string[]>().notNull().default([]),
    visual: jsonb('visual').$type<AtlasWorkflowJson | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    workflowSequenceUq: uniqueIndex('atlas_workflow_action_events_workflow_sequence_uq').on(
      table.workflowId,
      table.sequence
    ),
    actionRevisionIdx: index('atlas_workflow_action_events_action_revision_idx').on(
      table.workflowId,
      table.actionId,
      table.workflowRevision
    ),
    workflowCreatedIdx: index('atlas_workflow_action_events_workflow_created_idx').on(
      table.workflowId,
      table.createdAt
    )
  })
);

export const atlasWorkflowActionCurrent = pgTable(
  'atlas_workflow_action_current',
  {
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => atlasWorkflowRuns.id, { onDelete: 'cascade' }),
    actionId: text('action_id').notNull(),
    parentActionId: text('parent_action_id'),
    dagNodeId: text('dag_node_id').notNull(),
    workflowRevision: integer('workflow_revision').notNull(),
    sequence: integer('sequence').notNull(),
    attempt: integer('attempt').notNull().default(0),
    lane: text('lane').notNull(),
    transport: text('transport'),
    kind: text('kind').notNull(),
    state: text('state').notNull(),
    operation: text('operation').notNull(),
    progress: jsonb('progress').$type<AtlasWorkflowJson>().notNull().default({}),
    target: jsonb('target').$type<AtlasWorkflowJson>().notNull().default({}),
    evidenceRefs: jsonb('evidence_refs').$type<string[]>().notNull().default([]),
    artifactRefs: jsonb('artifact_refs').$type<string[]>().notNull().default([]),
    visual: jsonb('visual').$type<AtlasWorkflowJson | null>(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workflowId, table.actionId] }),
    workflowStateIdx: index('atlas_workflow_action_current_workflow_state_idx').on(
      table.workflowId,
      table.state
    ),
    workflowLaneIdx: index('atlas_workflow_action_current_workflow_lane_idx').on(
      table.workflowId,
      table.lane
    )
  })
);

export const atlasWorkflowDagEdges = pgTable(
  'atlas_workflow_dag_edges',
  {
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => atlasWorkflowRuns.id, { onDelete: 'cascade' }),
    fromNodeId: text('from_node_id').notNull(),
    toNodeId: text('to_node_id').notNull(),
    relation: text('relation').notNull().default('depends_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workflowId, table.fromNodeId, table.toNodeId] }),
    toIdx: index('atlas_workflow_dag_edges_to_idx').on(table.workflowId, table.toNodeId)
  })
);

export const atlasWorkflowOutbox = pgTable(
  'atlas_workflow_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => atlasWorkflowRuns.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    routingKey: text('routing_key').notNull(),
    payload: jsonb('payload').$type<AtlasWorkflowJson>().notNull(),
    status: text('status').notNull().default('pending'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    workflowSequenceUq: uniqueIndex('atlas_workflow_outbox_workflow_sequence_uq').on(
      table.workflowId,
      table.sequence
    ),
    pendingIdx: index('atlas_workflow_outbox_pending_idx')
      .on(table.status, table.createdAt)
      .where(sql`${table.status} = 'pending'`)
  })
);
