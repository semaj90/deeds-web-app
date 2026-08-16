import { eq } from 'drizzle-orm';
import { atlasAgents, atlasAuditEvents, db } from '$lib/server/db';
import { ATLAS_AGENT_OPERATIONS } from './governance';

export interface UpdateAtlasAgentGovernanceV1 {
  agentId: string;
  userId: string;
  reportsTo?: string | null;
  capabilities?: string[];
  permissions?: Record<string, unknown>;
  budgetPolicy?: Record<string, unknown>;
  status?: string;
}

function validatePermissionPolicy(value: Record<string, unknown>) {
  for (const key of ['allow', 'deny', 'requireApproval'] as const) {
    const rules = value[key];
    if (rules === undefined) continue;
    if (!Array.isArray(rules) || rules.some((rule) => typeof rule !== 'string')) {
      throw new Error(`permissions.${key} must be an array of strings`);
    }
  }
  const scopes = value.canonicalScopes;
  if (scopes !== undefined && (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string'))) {
    throw new Error('permissions.canonicalScopes must be an array of strings');
  }
  const depth = value.maxDelegationDepth;
  if (depth !== undefined && (!Number.isInteger(depth) || Number(depth) < 0)) {
    throw new Error('permissions.maxDelegationDepth must be a non-negative integer');
  }
}

function assertKnownOperations(value: Record<string, unknown>) {
  const known = new Set<string>(ATLAS_AGENT_OPERATIONS);
  for (const key of ['allow', 'deny', 'requireApproval'] as const) {
    const rules = value[key];
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (rule === '*' || (typeof rule === 'string' && rule.endsWith('.*'))) continue;
      if (typeof rule === 'string' && !known.has(rule)) {
        throw new Error(`Unknown Atlas agent operation '${rule}' in permissions.${key}`);
      }
    }
  }
}

async function assertManagerDoesNotCreateCycle(agentId: string, reportsTo: string | null) {
  if (!reportsTo) return;
  if (reportsTo === agentId) throw new Error('An agent cannot report to itself');

  const agents = await db.select({ id: atlasAgents.id, reportsTo: atlasAgents.reportsTo }).from(atlasAgents);
  const parent = new Map(agents.map((agent) => [agent.id, agent.reportsTo]));
  if (!parent.has(reportsTo)) throw new Error('Manager agent not found');

  const visited = new Set<string>([agentId]);
  let cursor: string | null | undefined = reportsTo;
  while (cursor) {
    if (visited.has(cursor)) throw new Error('Agent reporting change would create an organization cycle');
    visited.add(cursor);
    cursor = parent.get(cursor);
  }
}

export async function updateAtlasAgentGovernance(input: UpdateAtlasAgentGovernanceV1) {
  const [current] = await db.select().from(atlasAgents).where(eq(atlasAgents.id, input.agentId)).limit(1);
  if (!current) throw new Error('Atlas agent not found');

  if (input.reportsTo !== undefined) await assertManagerDoesNotCreateCycle(input.agentId, input.reportsTo);
  if (input.permissions) {
    validatePermissionPolicy(input.permissions);
    assertKnownOperations(input.permissions);
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(atlasAgents)
      .set({
        reportsTo: input.reportsTo === undefined ? current.reportsTo : input.reportsTo,
        capabilities: input.capabilities ?? current.capabilities,
        permissions: input.permissions ?? current.permissions,
        budgetPolicy: input.budgetPolicy ?? current.budgetPolicy,
        status: input.status ?? current.status,
        updatedAt: new Date()
      })
      .where(eq(atlasAgents.id, input.agentId))
      .returning();

    await tx.insert(atlasAuditEvents).values({
      actorType: 'user',
      actorId: input.userId,
      action: 'agent.governance.update',
      entityType: 'atlas_agent',
      entityId: input.agentId,
      details: {
        reportsTo: updated.reportsTo,
        capabilities: updated.capabilities,
        permissions: updated.permissions,
        budgetPolicy: updated.budgetPolicy,
        status: updated.status
      }
    });
    return updated;
  });
}
