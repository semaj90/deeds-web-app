import type { HyperedgeV1 } from './contracts';

export interface HypergraphProjectionEdgeV1 {
  sourceCanonicalId: string;
  targetCanonicalId: string;
  weight: number;
  evidenceHyperedgeIds: string[];
}

/**
 * Creates a disposable entity→entity weighted projection from canonical n-ary
 * hyperedges. Canonical hyperedges remain the source of truth; this projection
 * is suitable for PageRank/cuGraph/Neo4j materialization and may be rebuilt.
 *
 * Each hyperedge contributes 1/(n-1) to every directed pair so one large
 * hyperedge does not receive n-times more outgoing mass merely for having more
 * participants.
 */
export function projectHyperedgesToWeightedEdges(
  hyperedges: readonly HyperedgeV1[]
): HypergraphProjectionEdgeV1[] {
  const projected = new Map<string, HypergraphProjectionEdgeV1>();

  for (const hyperedge of hyperedges) {
    const participants = [...new Set(hyperedge.participants.map((p) => p.canonicalId))].sort();
    if (participants.length < 2) continue;

    const contribution = 1 / (participants.length - 1);

    for (const source of participants) {
      for (const target of participants) {
        if (source === target) continue;
        const key = `${source}\u0000${target}`;
        const existing = projected.get(key);

        if (existing) {
          existing.weight += contribution;
          existing.evidenceHyperedgeIds.push(hyperedge.hyperedgeId);
        } else {
          projected.set(key, {
            sourceCanonicalId: source,
            targetCanonicalId: target,
            weight: contribution,
            evidenceHyperedgeIds: [hyperedge.hyperedgeId]
          });
        }
      }
    }
  }

  return [...projected.values()]
    .map((edge) => ({
      ...edge,
      evidenceHyperedgeIds: [...new Set(edge.evidenceHyperedgeIds)].sort()
    }))
    .sort((a, b) => {
      const source = a.sourceCanonicalId.localeCompare(b.sourceCanonicalId);
      return source !== 0 ? source : a.targetCanonicalId.localeCompare(b.targetCanonicalId);
    });
}
