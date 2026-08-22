import { createHash } from 'node:crypto';

export interface AtlasIncidentFingerprintInput {
  kind: string;
  message: string;
  sourceRef?: string | null;
  workspaceRevision?: string | null;
  canonicalId?: string | null;
  toolName?: string | null;
  testName?: string | null;
}

function normalizeMessage(message: string): string {
  return message
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\b\d+(?:\.\d+)?ms\b/gi, '<duration>')
    .replace(/\bline\s+\d+\b/gi, 'line <n>')
    .replace(/:\d+:\d+/g, ':<line>:<col>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function atlasIncidentFingerprint(input: AtlasIncidentFingerprintInput): string {
  const canonical = JSON.stringify({
    kind: input.kind.trim().toLowerCase(),
    message: normalizeMessage(input.message),
    sourceRef: input.sourceRef?.trim() || null,
    workspaceRevision: input.workspaceRevision?.trim() || null,
    canonicalId: input.canonicalId?.trim() || null,
    toolName: input.toolName?.trim().toLowerCase() || null,
    testName: input.testName?.trim() || null
  });

  return createHash('sha256').update(canonical).digest('hex');
}

export function shouldRetryIncident(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts;
}

export type RecoveryDisposition = 'RETRY' | 'ESCALATE' | 'RESOLVE';

export function recoveryDisposition(input: {
  verified: boolean;
  attemptCount: number;
  maxAttempts: number;
}): RecoveryDisposition {
  if (input.verified) return 'RESOLVE';
  return shouldRetryIncident(input.attemptCount, input.maxAttempts) ? 'RETRY' : 'ESCALATE';
}
