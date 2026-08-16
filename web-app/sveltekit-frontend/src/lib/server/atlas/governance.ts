export const ATLAS_AGENT_OPERATIONS = [
  'task.read',
  'task.claim',
  'task.run',
  'task.delegate',
  'resolution.execute',
  'mutation.plan',
  'mutation.commit',
  'approval.request',
  'verification.write',
  'agent.delegate',
  'runtime.invoke'
] as const;

export type AtlasAgentOperation = (typeof ATLAS_AGENT_OPERATIONS)[number];

export interface AtlasPermissionPolicyV1 {
  allow?: string[];
  deny?: string[];
  requireApproval?: string[];
  canonicalScopes?: string[];
  maxDelegationDepth?: number;
}

export interface AtlasAuthorizationContextV1 {
  operation: AtlasAgentOperation;
  canonicalId?: string | null;
  delegationDepth?: number;
  mutation?: boolean;
}

export interface AtlasAuthorizationDecisionV1 {
  allowed: boolean;
  approvalRequired: boolean;
  reason: string;
}

function matchesRule(rule: string, operation: string): boolean {
  if (rule === '*') return true;
  if (rule === operation) return true;
  if (rule.endsWith('.*')) return operation.startsWith(rule.slice(0, -1));
  return false;
}

function matchesCanonicalScope(scope: string, canonicalId: string): boolean {
  if (scope === '*') return true;
  if (scope.endsWith('*')) return canonicalId.startsWith(scope.slice(0, -1));
  return scope === canonicalId;
}

/**
 * Deterministic authorization check for autonomous agents. Deny wins over
 * allow; mutation approval is a separate gate from authorization.
 */
export function authorizeAtlasAgent(
  rawPolicy: Record<string, unknown> | null | undefined,
  context: AtlasAuthorizationContextV1
): AtlasAuthorizationDecisionV1 {
  const policy = (rawPolicy ?? {}) as AtlasPermissionPolicyV1;
  const deny = Array.isArray(policy.deny) ? policy.deny : [];
  const allow = Array.isArray(policy.allow) ? policy.allow : [];
  const requireApproval = Array.isArray(policy.requireApproval) ? policy.requireApproval : [];

  if (deny.some((rule) => matchesRule(rule, context.operation))) {
    return { allowed: false, approvalRequired: false, reason: 'explicit_deny' };
  }

  const allowed = allow.some((rule) => matchesRule(rule, context.operation));
  if (!allowed) {
    return { allowed: false, approvalRequired: false, reason: 'not_allowed' };
  }

  const maxDelegationDepth = Math.max(0, policy.maxDelegationDepth ?? 2);
  if ((context.delegationDepth ?? 0) > maxDelegationDepth) {
    return { allowed: false, approvalRequired: false, reason: 'delegation_depth_exceeded' };
  }

  if (context.canonicalId && Array.isArray(policy.canonicalScopes) && policy.canonicalScopes.length > 0) {
    if (!policy.canonicalScopes.some((scope) => matchesCanonicalScope(scope, context.canonicalId!))) {
      return { allowed: false, approvalRequired: false, reason: 'canonical_scope_denied' };
    }
  }

  const approvalRequired =
    Boolean(context.mutation) || requireApproval.some((rule) => matchesRule(rule, context.operation));

  return {
    allowed: true,
    approvalRequired,
    reason: approvalRequired ? 'allowed_with_approval' : 'allowed'
  };
}

export function assertAtlasAgentAuthorized(
  rawPolicy: Record<string, unknown> | null | undefined,
  context: AtlasAuthorizationContextV1
): AtlasAuthorizationDecisionV1 {
  const decision = authorizeAtlasAgent(rawPolicy, context);
  if (!decision.allowed) {
    throw new Error(`Atlas agent operation '${context.operation}' denied (${decision.reason})`);
  }
  return decision;
}
