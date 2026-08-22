import { createHash } from 'node:crypto';
import type { AtlasEndToEndResultV1 } from './runtime';
import type { ResolveTaskInputV1 } from './contracts';

export interface AtlasResolutionReceiptV1 {
  schema: 'atlas.resolution-receipt.v1';
  requestId: string;
  revisions: ResolveTaskInputV1['revisions'];
  status: AtlasEndToEndResultV1['resolution']['fiber']['status'];
  canonicalId?: string;
  candidateIds: string[];
  lineageCandidateIds: string[][];
  boundaryReasons: string[];
  usage: AtlasEndToEndResultV1['resolution']['usage'];
  routeMask: number;
  checksum: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildResolutionReceipt(
  input: ResolveTaskInputV1,
  result: AtlasEndToEndResultV1
): AtlasResolutionReceiptV1 {
  const unsigned = {
    schema: 'atlas.resolution-receipt.v1' as const,
    requestId: input.requestId,
    revisions: input.revisions,
    status: result.resolution.fiber.status,
    canonicalId: result.resolution.diagnostics.exactPromotion?.canonicalId,
    candidateIds: result.resolution.fiber.candidates.map((candidate) => candidate.canonicalId),
    lineageCandidateIds: result.lineages.map((lineage) => lineage.candidateIds),
    boundaryReasons: [...result.resolution.diagnostics.boundaryReasons].sort(),
    usage: result.resolution.usage,
    routeMask: result.routeMask
  };

  return {
    ...unsigned,
    checksum: sha256Canonical(unsigned)
  };
}
