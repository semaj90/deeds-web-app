import { z } from 'zod';

export const WORKFLOW_LANES = [
  'planner',
  'lexical',
  'ast',
  'semantic',
  'graph',
  'gpu',
  'tool',
  'validator',
  'materializer',
  'acp',
  'a2a'
] as const;

export type WorkflowLane = (typeof WORKFLOW_LANES)[number];

export const WORKFLOW_TRANSPORTS = ['local', 'grpc', 'rabbitmq', 'acp', 'a2a'] as const;
export type WorkflowTransport = (typeof WORKFLOW_TRANSPORTS)[number];

export const WORKFLOW_EVENT_KINDS = [
  'scheduled',
  'started',
  'progress',
  'artifact',
  'blocked',
  'retrying',
  'completed',
  'failed'
] as const;
export type WorkflowEventKind = (typeof WORKFLOW_EVENT_KINDS)[number];

export const WORKFLOW_ACTION_STATES = [
  'queued',
  'running',
  'waiting',
  'blocked',
  'succeeded',
  'failed'
] as const;
export type WorkflowActionState = (typeof WORKFLOW_ACTION_STATES)[number];

export const WORKFLOW_VISUAL_STATIONS = [
  'error-bay',
  'bitfrost',
  'ontology',
  'gpu',
  'acp',
  'a2a'
] as const;

export const WORKFLOW_VISUAL_ANIMATIONS = [
  'Idle',
  'Walk',
  'Work',
  'Inspect',
  'Repair',
  'Celebrate',
  'Error'
] as const;

export interface WorkflowActionEventV1 {
  schema: 'atlas.workflow-action.v1';

  workflowId: string;
  workflowRevision: number;
  sequence: number;

  actionId: string;
  parentActionId?: string;
  dagNodeId: string;
  attempt: number;

  lane: WorkflowLane;
  transport?: WorkflowTransport;
  kind: WorkflowEventKind;
  state: WorkflowActionState;
  operation: string;

  progress?: {
    completedUnits?: number;
    totalUnits?: number;
    fraction?: number;
    etaMs?: number;
    confidence?: number;
  };

  target?: {
    canonicalId?: string;
    resource?: string;
  };

  evidenceRefs?: string[];
  artifactRefs?: string[];

  startedAt?: string;
  emittedAt: string;
  finishedAt?: string;

  /**
   * Optional presentation hint only. It must never be used to infer workflow
   * truth, retries, DAG dependencies, evidence identity or durable status.
   */
  visual?: {
    station: (typeof WORKFLOW_VISUAL_STATIONS)[number];
    animation: (typeof WORKFLOW_VISUAL_ANIMATIONS)[number];
    fx?: string;
  };
}

export type WorkflowActionEventDraftV1 = Omit<
  WorkflowActionEventV1,
  'schema' | 'workflowRevision' | 'sequence' | 'emittedAt'
> & {
  emittedAt?: string;
};

const finiteNonNegative = z.number().finite().nonnegative();

export const workflowActionEventSchema = z
  .object({
    schema: z.literal('atlas.workflow-action.v1'),
    workflowId: z.string().uuid(),
    workflowRevision: z.number().int().positive(),
    sequence: z.number().int().positive(),
    actionId: z.string().trim().min(1).max(512),
    parentActionId: z.string().trim().min(1).max(512).optional(),
    dagNodeId: z.string().trim().min(1).max(512),
    attempt: z.number().int().nonnegative(),
    lane: z.enum(WORKFLOW_LANES),
    transport: z.enum(WORKFLOW_TRANSPORTS).optional(),
    kind: z.enum(WORKFLOW_EVENT_KINDS),
    state: z.enum(WORKFLOW_ACTION_STATES),
    operation: z.string().trim().min(1).max(4096),
    progress: z
      .object({
        completedUnits: finiteNonNegative.optional(),
        totalUnits: finiteNonNegative.optional(),
        fraction: z.number().finite().min(0).max(1).optional(),
        etaMs: finiteNonNegative.optional(),
        confidence: z.number().finite().min(0).max(1).optional()
      })
      .strict()
      .optional(),
    target: z
      .object({
        canonicalId: z.string().trim().min(1).max(4096).optional(),
        resource: z.string().trim().min(1).max(4096).optional()
      })
      .strict()
      .optional(),
    evidenceRefs: z.array(z.string().trim().min(1).max(4096)).max(10_000).optional(),
    artifactRefs: z.array(z.string().trim().min(1).max(4096)).max(10_000).optional(),
    startedAt: z.string().datetime().optional(),
    emittedAt: z.string().datetime(),
    finishedAt: z.string().datetime().optional(),
    visual: z
      .object({
        station: z.enum(WORKFLOW_VISUAL_STATIONS),
        animation: z.enum(WORKFLOW_VISUAL_ANIMATIONS),
        fx: z.string().trim().min(1).max(256).optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.progress?.completedUnits !== undefined &&
      value.progress.totalUnits !== undefined &&
      value.progress.completedUnits > value.progress.totalUnits
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['progress', 'completedUnits'],
        message: 'completedUnits must not exceed totalUnits'
      });
    }
  });

export function parseWorkflowActionEvent(value: unknown): WorkflowActionEventV1 {
  return workflowActionEventSchema.parse(value) as WorkflowActionEventV1;
}

export function workflowProgressPercent(event: Pick<WorkflowActionEventV1, 'progress' | 'state'>): number {
  if (event.progress?.fraction !== undefined) return Math.round(event.progress.fraction * 100);
  if (
    event.progress?.completedUnits !== undefined &&
    event.progress.totalUnits !== undefined &&
    event.progress.totalUnits > 0
  ) {
    return Math.round((event.progress.completedUnits / event.progress.totalUnits) * 100);
  }
  return event.state === 'succeeded' ? 100 : 0;
}
