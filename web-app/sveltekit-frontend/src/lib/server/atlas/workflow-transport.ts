import type {
  WorkflowActionEventDraftV1,
  WorkflowLane,
  WorkflowTransport
} from './workflow-event';

export interface WorkflowTransportHealthV1 {
  status: 'healthy' | 'degraded' | 'unavailable' | 'unsupported';
  message?: string;
}

export interface WorkflowDispatchRequestV1 {
  workflowId: string;
  actionId: string;
  dagNodeId: string;
  lane: WorkflowLane;
  operation: string;
  payload: Record<string, unknown>;
}

export interface WorkflowDispatchReceiptV1 {
  accepted: boolean;
  transport: WorkflowTransport;
  remoteId?: string;
  message?: string;
}

/**
 * Transport is execution plumbing, not workflow truth. Implementations may use
 * gRPC, RabbitMQ, ACP or A2A, but they must report semantic transitions through
 * WorkflowActionEventV1 rather than mutating the browser/scene directly.
 */
export interface WorkflowTransportAdapter {
  readonly transport: WorkflowTransport;
  dispatch(request: WorkflowDispatchRequestV1): Promise<WorkflowDispatchReceiptV1>;
  health(): Promise<WorkflowTransportHealthV1>;
  normalizeUpdate?(input: unknown): WorkflowActionEventDraftV1 | null;
}

export class WorkflowTransportRegistry {
  private readonly adapters = new Map<WorkflowTransport, WorkflowTransportAdapter>();

  register(adapter: WorkflowTransportAdapter) {
    if (this.adapters.has(adapter.transport)) {
      throw new Error(`Workflow transport '${adapter.transport}' is already registered`);
    }
    this.adapters.set(adapter.transport, adapter);
  }

  get(transport: WorkflowTransport) {
    return this.adapters.get(transport);
  }

  require(transport: WorkflowTransport) {
    const adapter = this.adapters.get(transport);
    if (!adapter) throw new Error(`Workflow transport '${transport}' is not configured`);
    return adapter;
  }

  list() {
    return [...this.adapters.values()];
  }
}

export function createUnsupportedWorkflowTransport(
  transport: Exclude<WorkflowTransport, 'local'>
): WorkflowTransportAdapter {
  return {
    transport,
    async dispatch() {
      return {
        accepted: false,
        transport,
        message: `${transport} workflow transport is configured as a capability placeholder but is not proven on this runtime.`
      };
    },
    async health() {
      return {
        status: 'unsupported',
        message: `No verified ${transport} workflow transport implementation is installed.`
      };
    }
  };
}

export function createLocalWorkflowTransport(
  execute: (request: WorkflowDispatchRequestV1) => Promise<WorkflowDispatchReceiptV1>
): WorkflowTransportAdapter {
  return {
    transport: 'local',
    dispatch: execute,
    async health() {
      return { status: 'healthy', message: 'In-process workflow executor registered' };
    }
  };
}
