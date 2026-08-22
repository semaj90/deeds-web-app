export const ATLAS_TASK_STATUSES = [
  'QUEUED',
  'CLAIMED',
  'RUNNING',
  'AWAITING_APPROVAL',
  'VERIFYING',
  'SUCCEEDED',
  'FAILED',
  'BLOCKED',
  'CANCELLED'
] as const;

export type AtlasTaskStatus = (typeof ATLAS_TASK_STATUSES)[number];

const TERMINAL = new Set<AtlasTaskStatus>(['SUCCEEDED', 'FAILED', 'CANCELLED']);

const TRANSITIONS: Readonly<Record<AtlasTaskStatus, readonly AtlasTaskStatus[]>> = {
  QUEUED: ['CLAIMED', 'CANCELLED', 'BLOCKED'],
  CLAIMED: ['RUNNING', 'QUEUED', 'FAILED', 'CANCELLED', 'BLOCKED'],
  RUNNING: ['AWAITING_APPROVAL', 'VERIFYING', 'FAILED', 'BLOCKED', 'CANCELLED'],
  AWAITING_APPROVAL: ['RUNNING', 'VERIFYING', 'FAILED', 'BLOCKED', 'CANCELLED'],
  VERIFYING: ['SUCCEEDED', 'RUNNING', 'FAILED', 'BLOCKED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: ['QUEUED'],
  BLOCKED: ['QUEUED', 'CANCELLED'],
  CANCELLED: []
};

export function isAtlasTaskStatus(value: unknown): value is AtlasTaskStatus {
  return typeof value === 'string' && (ATLAS_TASK_STATUSES as readonly string[]).includes(value);
}

export function isTerminalAtlasTaskStatus(status: AtlasTaskStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionAtlasTask(
  from: AtlasTaskStatus,
  to: AtlasTaskStatus
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertAtlasTaskTransition(
  from: AtlasTaskStatus,
  to: AtlasTaskStatus
): void {
  if (!canTransitionAtlasTask(from, to)) {
    throw new Error(`Illegal Atlas task transition: ${from} -> ${to}`);
  }
}

export function allowedAtlasTaskTransitions(status: AtlasTaskStatus): readonly AtlasTaskStatus[] {
  return TRANSITIONS[status];
}

/**
 * Success is never a direct agent assertion. A task that requires verification
 * must pass through VERIFYING and receive a qualifying verification receipt.
 */
export function mayEnterSucceeded(
  current: AtlasTaskStatus,
  verificationRequired: boolean,
  hasPassingReceipt: boolean
): boolean {
  if (current !== 'VERIFYING') return false;
  return !verificationRequired || hasPassingReceipt;
}
