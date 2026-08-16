import type { AtlasRevisionSet, ResourceEnvelopeV1 } from './contracts';

export type AtlasTensorDtype = 'f32' | 'f16' | 'bf16' | 'i8' | 'u8' | 'u32';

/**
 * Control-plane descriptor for data that stays in mmap/shared-memory/RPC/GPU
 * storage. MCP/A2A messages should pass this descriptor, not serialize the
 * tensor payload itself.
 */
export interface TensorHandleV1 {
  handle: string;
  shape: number[];
  dtype: AtlasTensorDtype;
  revision: string;
  checksum: string;
  location: string;
  operation?: string;
}

export interface AtlasControlPacketV1 {
  requestId: string;
  applicationHandle?: string;
  revisions: AtlasRevisionSet;
  budget: ResourceEnvelopeV1;
  expectedChecksum?: string;
  tensorHandles?: TensorHandleV1[];
}
