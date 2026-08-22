import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type AtlasJsonObject = Record<string, unknown>;
export type AtlasEvidenceRef = string;

/**
 * Native Parent Atlas control-plane tables.
 *
 * These deliberately live outside the legacy monolithic schema so agentic
 * orchestration can evolve without coupling canonical legal-domain tables to
 * volatile agent/runtime state.
 */
export const atlasAgents = pgTable(
  "atlas_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    role: text("role").notNull().default("general"),
    title: text("title"),
    protocol: text("protocol").notNull().default("internal"),
    status: text("status").notNull().default("idle"),
    reportsTo: uuid("reports_to").references((): AnyPgColumn => atlasAgents.id, {
      onDelete: "set null",
    }),
    endpoint: text("endpoint"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    permissions: jsonb("permissions").$type<AtlasJsonObject>().notNull().default({}),
    runtimeConfig: jsonb("runtime_config").$type<AtlasJsonObject>().notNull().default({}),
    budgetPolicy: jsonb("budget_policy").$type<AtlasJsonObject>().notNull().default({}),
    errorReason: text("error_reason"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<AtlasJsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("atlas_agents_status_idx").on(table.status),
    protocolStatusIdx: index("atlas_agents_protocol_status_idx").on(table.protocol, table.status),
    reportsToIdx: index("atlas_agents_reports_to_idx").on(table.reportsTo),
  }),
);

export const atlasTasks = pgTable(
  "atlas_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskKey: text("task_key").notNull(),
    idempotencyKey: text("idempotency_key"),
    intent: text("intent").notNull(),
    description: text("description"),
    status: text("status").notNull().default("QUEUED"),
    priority: integer("priority").notNull().default(50),
    assignedAgentId: uuid("assigned_agent_id").references(() => atlasAgents.id, {
      onDelete: "set null",
    }),
    protocol: text("protocol").notNull().default("internal"),
    workspaceRevision: text("workspace_revision"),
    sourceRevision: text("source_revision"),
    graphRevision: text("graph_revision"),
    featureRevision: text("feature_revision"),
    expectedChecksums: jsonb("expected_checksums")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    resourceEnvelope: jsonb("resource_envelope").$type<AtlasJsonObject>().notNull().default({}),
    requirements: jsonb("requirements").$type<AtlasJsonObject>().notNull().default({}),
    evidenceRefs: jsonb("evidence_refs").$type<AtlasEvidenceRef[]>().notNull().default([]),
    approvalRequired: boolean("approval_required").notNull().default(true),
    verificationRequired: boolean("verification_required").notNull().default(true),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    errorReason: text("error_reason"),
    blockedReason: text("blocked_reason"),
    createdByUserId: text("created_by_user_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskKeyUq: uniqueIndex("atlas_tasks_task_key_uq").on(table.taskKey),
    idempotencyKeyUq: uniqueIndex("atlas_tasks_idempotency_key_uq")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    statusPriorityUpdatedIdx: index("atlas_tasks_status_priority_updated_idx").on(
      table.status,
      table.priority,
      table.updatedAt,
    ),
    agentStatusIdx: index("atlas_tasks_agent_status_idx").on(table.assignedAgentId, table.status),
    workspaceStatusIdx: index("atlas_tasks_workspace_status_idx").on(
      table.workspaceRevision,
      table.status,
    ),
    protocolStatusIdx: index("atlas_tasks_protocol_status_idx").on(table.protocol, table.status),
    updatedIdx: index("atlas_tasks_updated_idx").on(table.updatedAt),
  }),
);

export const atlasTaskEvents = pgTable(
  "atlas_task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => atlasTasks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorType: text("actor_type").notNull().default("system"),
    actorId: text("actor_id"),
    agentId: uuid("agent_id").references(() => atlasAgents.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<AtlasJsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskCreatedIdx: index("atlas_task_events_task_created_idx").on(table.taskId, table.createdAt),
    typeCreatedIdx: index("atlas_task_events_type_created_idx").on(table.eventType, table.createdAt),
  }),
);

export const atlasApprovals = pgTable(
  "atlas_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => atlasTasks.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("mutation"),
    status: text("status").notNull().default("pending"),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => atlasAgents.id, {
      onDelete: "set null",
    }),
    requestedByUserId: text("requested_by_user_id"),
    payload: jsonb("payload").$type<AtlasJsonObject>().notNull().default({}),
    requiredRevision: text("required_revision"),
    decisionNote: text("decision_note"),
    decidedByUserId: text("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusCreatedIdx: index("atlas_approvals_status_created_idx").on(table.status, table.createdAt),
    taskStatusIdx: index("atlas_approvals_task_status_idx").on(table.taskId, table.status),
    activeTaskApprovalUq: uniqueIndex("atlas_approvals_active_task_uq")
      .on(table.taskId, table.type)
      .where(sql`${table.status} in ('pending', 'revision_requested')`),
  }),
);

export const atlasVerificationReceipts = pgTable(
  "atlas_verification_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => atlasTasks.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    verifierType: text("verifier_type").notNull().default("system"),
    verifierId: text("verifier_id"),
    verifierAgentId: uuid("verifier_agent_id").references(() => atlasAgents.id, {
      onDelete: "set null",
    }),
    workspaceRevision: text("workspace_revision"),
    sourceRevision: text("source_revision"),
    expectedChecksums: jsonb("expected_checksums")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    observedChecksums: jsonb("observed_checksums")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    diffRefs: jsonb("diff_refs").$type<string[]>().notNull().default([]),
    screenshotRefs: jsonb("screenshot_refs").$type<string[]>().notNull().default([]),
    testRefs: jsonb("test_refs").$type<string[]>().notNull().default([]),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    metrics: jsonb("metrics").$type<AtlasJsonObject>().notNull().default({}),
    failureReason: text("failure_reason"),
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskCreatedIdx: index("atlas_verification_receipts_task_created_idx").on(
      table.taskId,
      table.createdAt,
    ),
    taskStatusIdx: index("atlas_verification_receipts_task_status_idx").on(
      table.taskId,
      table.status,
    ),
  }),
);

export const atlasErrorIncidents = pgTable(
  "atlas_error_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").references(() => atlasTasks.id, { onDelete: "set null" }),
    recoveryTaskId: uuid("recovery_task_id").references(() => atlasTasks.id, {
      onDelete: "set null",
    }),
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull().default("error"),
    status: text("status").notNull().default("active"),
    message: text("message").notNull(),
    sourceRef: text("source_ref"),
    workspaceRevision: text("workspace_revision"),
    evidence: jsonb("evidence").$type<AtlasJsonObject>().notNull().default({}),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusLastSeenIdx: index("atlas_error_incidents_status_last_seen_idx").on(
      table.status,
      table.lastSeenAt,
    ),
    taskStatusIdx: index("atlas_error_incidents_task_status_idx").on(table.taskId, table.status),
    activeFingerprintUq: uniqueIndex("atlas_error_incidents_active_fingerprint_uq")
      .on(table.fingerprint)
      .where(sql`${table.status} in ('active', 'escalated')`),
  }),
);

export const atlasTaskWatchdogs = pgTable(
  "atlas_task_watchdogs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => atlasTasks.id, { onDelete: "cascade" }),
    watchdogAgentId: uuid("watchdog_agent_id").references(() => atlasAgents.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    instructions: text("instructions"),
    lastObservedFingerprint: text("last_observed_fingerprint"),
    lastReviewedFingerprint: text("last_reviewed_fingerprint"),
    stopSnapshot: jsonb("stop_snapshot").$type<AtlasJsonObject>(),
    triggerCount: integer("trigger_count").notNull().default(0),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskUq: uniqueIndex("atlas_task_watchdogs_task_uq").on(table.taskId),
    statusIdx: index("atlas_task_watchdogs_status_idx").on(table.status),
    agentStatusIdx: index("atlas_task_watchdogs_agent_status_idx").on(
      table.watchdogAgentId,
      table.status,
    ),
  }),
);

export const atlasSkills = pgTable(
  "atlas_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    revision: text("revision").notNull(),
    status: text("status").notNull().default("draft"),
    definition: jsonb("definition").$type<AtlasJsonObject>().notNull().default({}),
    evalPolicy: jsonb("eval_policy").$type<AtlasJsonObject>().notNull().default({}),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugRevisionUq: uniqueIndex("atlas_skills_slug_revision_uq").on(table.slug, table.revision),
    statusIdx: index("atlas_skills_status_idx").on(table.status),
  }),
);

export const atlasSkillAssignments = pgTable(
  "atlas_skill_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => atlasSkills.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => atlasAgents.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    policy: jsonb("policy").$type<AtlasJsonObject>().notNull().default({}),
    assignedByUserId: text("assigned_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skillAgentUq: uniqueIndex("atlas_skill_assignments_skill_agent_uq").on(
      table.skillId,
      table.agentId,
    ),
    agentEnabledIdx: index("atlas_skill_assignments_agent_enabled_idx").on(
      table.agentId,
      table.enabled,
    ),
  }),
);

export const atlasEvalRuns = pgTable(
  "atlas_eval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id").references(() => atlasSkills.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => atlasAgents.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => atlasTasks.id, { onDelete: "set null" }),
    status: text("status").notNull().default("queued"),
    suiteRevision: text("suite_revision").notNull(),
    inputSnapshot: jsonb("input_snapshot").$type<AtlasJsonObject>().notNull().default({}),
    metrics: jsonb("metrics").$type<AtlasJsonObject>().notNull().default({}),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusCreatedIdx: index("atlas_eval_runs_status_created_idx").on(table.status, table.createdAt),
    skillCreatedIdx: index("atlas_eval_runs_skill_created_idx").on(table.skillId, table.createdAt),
    agentCreatedIdx: index("atlas_eval_runs_agent_created_idx").on(table.agentId, table.createdAt),
  }),
);

export const atlasRuntimeEndpoints = pgTable(
  "atlas_runtime_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    protocol: text("protocol").notNull(),
    transport: text("transport").notNull().default("http"),
    endpoint: text("endpoint").notNull(),
    agentId: uuid("agent_id").references(() => atlasAgents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("unchecked"),
    enabled: boolean("enabled").notNull().default(true),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    config: jsonb("config").$type<AtlasJsonObject>().notNull().default({}),
    catalogRevision: text("catalog_revision"),
    catalogChecksum: text("catalog_checksum"),
    lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
    healthMessage: text("health_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameUq: uniqueIndex("atlas_runtime_endpoints_name_uq").on(table.name),
    protocolStatusIdx: index("atlas_runtime_endpoints_protocol_status_idx").on(
      table.protocol,
      table.status,
    ),
    enabledStatusIdx: index("atlas_runtime_endpoints_enabled_status_idx").on(
      table.enabled,
      table.status,
    ),
  }),
);

export const atlasPermissionGrants = pgTable(
  "atlas_permission_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    permissionKey: text("permission_key").notNull(),
    scope: jsonb("scope").$type<AtlasJsonObject | null>(),
    grantedByUserId: text("granted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    grantUq: uniqueIndex("atlas_permission_grants_unique_idx").on(
      table.principalType,
      table.principalId,
      table.permissionKey,
    ),
    permissionIdx: index("atlas_permission_grants_permission_idx").on(table.permissionKey),
  }),
);

export const atlasAuditEvents = pgTable(
  "atlas_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: text("actor_type").notNull().default("system"),
    actorId: text("actor_id"),
    agentId: uuid("agent_id").references(() => atlasAgents.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    outcome: text("outcome").notNull().default("ok"),
    reasonCode: text("reason_code"),
    details: jsonb("details").$type<AtlasJsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdIdx: index("atlas_audit_events_created_idx").on(table.createdAt),
    entityIdx: index("atlas_audit_events_entity_idx").on(table.entityType, table.entityId),
    agentCreatedIdx: index("atlas_audit_events_agent_created_idx").on(
      table.agentId,
      table.createdAt,
    ),
  }),
);
