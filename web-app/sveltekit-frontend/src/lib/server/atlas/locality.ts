export interface RoutingCoordinate4DV1 {
  semantic: number;
  structural: number;
  execution: number;
  revision: number;
}

export type LocalityStrategy = 'hilbert-4d';

/**
 * Storage/layout extension point. Implementations may map a small, quantized
 * routing coordinate to a locality-preserving key (for example a 4-D Hilbert
 * index). This must never be treated as semantic distance or canonical truth.
 */
export interface LocalityKeyer {
  readonly strategy: LocalityStrategy;
  key(coordinate: RoutingCoordinate4DV1): bigint;
}
