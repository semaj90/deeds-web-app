import type { ResourceEnvelopeV1 } from './contracts';

export const ATLAS_AGENT_PROTOCOLS = [
  'internal',
  'mcp',
  'a2a',
  'acp',
  'acpx',
  'hermes'
] as const;

export type AtlasAgentProtocol = (typeof ATLAS_AGENT_PROTOCOLS)[number];

export interface AgentDispatchRequestV1 {
  taskId: string;
  taskKey: string;
  intent: string;
  description?: string | null;
  protocol: AtlasAgentProtocol;
  endpoint?: string | null;
  revisions: {
    workspace?: string | null;
    source?: string | null;
    graph?: string | null;
    feature?: string | null;
  };
  resourceEnvelope?: Partial<ResourceEnvelopeV1>;
  evidenceRefs: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentDispatchReceiptV1 {
  accepted: boolean;
  protocol: AtlasAgentProtocol;
  remoteRunId?: string;
  message?: string;
  evidenceRefs?: string[];
}

export interface AgentHealthV1 {
  status: 'healthy' | 'degraded' | 'unavailable' | 'unsupported';
  message?: string;
  catalogRevision?: string;
  catalogChecksum?: string;
}

export interface AgentRuntimeAdapter {
  readonly protocol: AtlasAgentProtocol;
  dispatch(request: AgentDispatchRequestV1): Promise<AgentDispatchReceiptV1>;
  health(endpoint?: string | null): Promise<AgentHealthV1>;
  cancel?(remoteRunId: string, endpoint?: string | null): Promise<void>;
}

export class AgentAdapterRegistry {
  private readonly adapters = new Map<AtlasAgentProtocol, AgentRuntimeAdapter>();

  register(adapter: AgentRuntimeAdapter): void {
    if (this.adapters.has(adapter.protocol)) {
      throw new Error(`Agent adapter already registered for protocol '${adapter.protocol}'`);
    }
    this.adapters.set(adapter.protocol, adapter);
  }

  get(protocol: AtlasAgentProtocol): AgentRuntimeAdapter | undefined {
    return this.adapters.get(protocol);
  }

  require(protocol: AtlasAgentProtocol): AgentRuntimeAdapter {
    const adapter = this.get(protocol);
    if (!adapter) {
      throw new Error(
        `No Atlas runtime adapter is configured for '${protocol}'. ` +
          'Protocol configuration is not the same as protocol compliance.'
      );
    }
    return adapter;
  }

  protocols(): AtlasAgentProtocol[] {
    return [...this.adapters.keys()];
  }
}

/**
 * Useful for the in-process worker lane. It does not pretend to implement any
 * external protocol and delegates execution to a caller-owned function.
 */
export function createInternalAgentAdapter(
  execute: (request: AgentDispatchRequestV1) => Promise<AgentDispatchReceiptV1>
): AgentRuntimeAdapter {
  return {
    protocol: 'internal',
    dispatch: execute,
    async health() {
      return { status: 'healthy', message: 'in-process adapter registered' };
    }
  };
}

/**
 * Explicit placeholder for configured-but-not-yet-implemented remote protocols.
 * This fails closed rather than silently treating an HTTP POST as MCP/A2A/ACP.
 */
export function createUnsupportedRemoteAdapter(
  protocol: Exclude<AtlasAgentProtocol, 'internal'>
): AgentRuntimeAdapter {
  return {
    protocol,
    async dispatch() {
      return {
        accepted: false,
        protocol,
        message: `The '${protocol}' transport adapter has not been proven on this runtime.`
      };
    },
    async health() {
      return {
        status: 'unsupported',
        message: `No verified '${protocol}' transport implementation is installed.`
      };
    }
  };
}

export function isAtlasAgentProtocol(value: unknown): value is AtlasAgentProtocol {
  return typeof value === 'string' && (ATLAS_AGENT_PROTOCOLS as readonly string[]).includes(value);
}
