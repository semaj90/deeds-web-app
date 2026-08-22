import { expect, test } from '@playwright/test';
import {
  parseWorkflowActionEvent,
  workflowProgressPercent,
  WORKFLOW_LANES,
  WORKFLOW_TRANSPORTS
} from '../src/lib/server/atlas/workflow-event';
import {
  createUnsupportedWorkflowTransport,
  WorkflowTransportRegistry
} from '../src/lib/server/atlas/workflow-transport';

test('WorkflowActionEventV1 accepts revisioned semantic workflow truth', () => {
  const event = parseWorkflowActionEvent({
    schema: 'atlas.workflow-action.v1',
    workflowId: '0f06a59b-43e8-49d4-aac0-c2260b286ac2',
    workflowRevision: 7,
    sequence: 19,
    actionId: 'ast:owner:1',
    dagNodeId: 'ast',
    attempt: 1,
    lane: 'ast',
    transport: 'local',
    kind: 'progress',
    state: 'running',
    operation: 'Resolve AST ownership evidence',
    progress: { completedUnits: 38, totalUnits: 100, fraction: 0.38 },
    evidenceRefs: ['ast:evidence:1'],
    emittedAt: '2026-08-17T20:00:00.000Z',
    visual: { station: 'error-bay', animation: 'Repair', fx: 'repair-sparks' }
  });

  expect(event.workflowRevision).toBe(7);
  expect(event.sequence).toBe(19);
  expect(workflowProgressPercent(event)).toBe(38);
});

test('visual hints remain optional', () => {
  const event = parseWorkflowActionEvent({
    schema: 'atlas.workflow-action.v1',
    workflowId: '0f06a59b-43e8-49d4-aac0-c2260b286ac2',
    workflowRevision: 1,
    sequence: 1,
    actionId: 'planner:1',
    dagNodeId: 'planner',
    attempt: 0,
    lane: 'planner',
    kind: 'started',
    state: 'running',
    operation: 'Plan ready set',
    emittedAt: '2026-08-17T20:00:00.000Z'
  });

  expect(event.visual).toBeUndefined();
});

test('event validation rejects impossible progress', () => {
  expect(() =>
    parseWorkflowActionEvent({
      schema: 'atlas.workflow-action.v1',
      workflowId: '0f06a59b-43e8-49d4-aac0-c2260b286ac2',
      workflowRevision: 1,
      sequence: 1,
      actionId: 'gpu:1',
      dagNodeId: 'gpu',
      attempt: 0,
      lane: 'gpu',
      kind: 'progress',
      state: 'running',
      operation: 'Run exact KNN',
      progress: { completedUnits: 11, totalUnits: 10 },
      emittedAt: '2026-08-17T20:00:00.000Z'
    })
  ).toThrow();
});

test('workflow lanes and transports preserve intended scheduler boundaries', () => {
  expect(WORKFLOW_LANES).toContain('materializer');
  expect(WORKFLOW_LANES).toContain('acp');
  expect(WORKFLOW_LANES).toContain('a2a');
  expect(WORKFLOW_TRANSPORTS).toEqual(['local', 'grpc', 'rabbitmq', 'acp', 'a2a']);
});

test('unproven remote transports fail closed', async () => {
  const registry = new WorkflowTransportRegistry();
  registry.register(createUnsupportedWorkflowTransport('rabbitmq'));

  const adapter = registry.require('rabbitmq');
  const health = await adapter.health();
  const dispatch = await adapter.dispatch({
    workflowId: '0f06a59b-43e8-49d4-aac0-c2260b286ac2',
    actionId: 'materialize:1',
    dagNodeId: 'materialize',
    lane: 'materializer',
    operation: 'Warm BitFrost bucket',
    payload: {}
  });

  expect(health.status).toBe('unsupported');
  expect(dispatch.accepted).toBeFalsy();
});
