import { expect, test } from '@playwright/test';
import type {
  AtlasLane,
  AtlasRevisionSet,
  CandidateV1,
  ResolveTaskInputV1
} from '../src/lib/server/atlas/contracts';
import { projectHyperedgesToWeightedEdges } from '../src/lib/server/atlas/hypergraph';
import { decodeKBestLineages } from '../src/lib/server/atlas/lineage';
import { resolveAtlasTask } from '../src/lib/server/atlas/resolver';
import { buildRouteMask, routeHammingDistance } from '../src/lib/server/atlas/route-mask';
import { canonicalSetDelta } from '../src/lib/server/atlas/stability';

const revisions: AtlasRevisionSet = {
  workspace: 'w1',
  source: 's1',
  graph: 'g1',
  feature: 'f1'
};

function candidate(canonicalId: string, score: number, patch: Partial<CandidateV1> = {}): CandidateV1 {
  return {
    canonicalId,
    score,
    evidence: { semantic: score },
    revisions,
    ...patch
  };
}

function input(maxCandidates = 4): ResolveTaskInputV1 {
  return {
    requestId: 'req-1',
    query: 'find owner',
    revisions,
    budget: {
      maxVramBytes: 1_000_000,
      maxContextTokens: 8_000,
      maxCandidates,
      maxGraphHops: 8,
      maxHyperedges: 32,
      maxToolCalls: 32,
      maxWallMs: 10_000
    },
    requirements: {
      canonicalIdentity: true,
      revisionQualified: true,
      evidenceLinked: true,
      exactPromotion: true
    },
    stabilization: {
      initialCandidateLimit: 2,
      growthFactor: 2,
      deltaThreshold: 0,
      stableRoundsRequired: 1
    }
  };
}

test('canonical candidate expansion uses Jaccard delta', () => {
  expect(canonicalSetDelta(['a', 'b'], ['a', 'b'])).toBe(0);
  expect(canonicalSetDelta(['a', 'b'], ['a', 'b', 'c', 'd'])).toBeCloseTo(0.5);
  expect(canonicalSetDelta([], [])).toBe(0);
});

test('route masks use Hamming distance only as a control-plane primitive', () => {
  const a = buildRouteMask({ semanticRequired: true, astRequired: true, sourceRequired: true });
  const b = buildRouteMask({ semanticRequired: true, graphRequired: true, sourceRequired: true });
  expect(routeHammingDistance(a, b)).toBe(2);
});

test('k-best lineage favors globally stronger temporal path', () => {
  const paths = decodeKBestLineages(
    [
      { revisions, candidates: [candidate('old-a', 0.9), candidate('old-b', 0.8)] },
      { revisions, candidates: [candidate('new-a', 0.7), candidate('new-b', 0.95)] }
    ],
    ({ from, to }) => (from.canonicalId.endsWith(to.canonicalId.slice(-1)) ? 1 : -1),
    2
  );

  expect(paths[0].candidateIds).toEqual(['old-b', 'new-b']);
});

test('hypergraph projection is disposable and preserves hyperedge evidence', () => {
  const projection = projectHyperedgesToWeightedEdges([
    {
      hyperedgeId: 'mutation-1',
      predicate: 'MUTATION_EVENT',
      participants: [
        { canonicalId: 'agent', role: 'agent' },
        { canonicalId: 'symbol', role: 'target' },
        { canonicalId: 'receipt', role: 'receipt' }
      ],
      evidenceRefs: ['e1'],
      workspaceRevision: 'w1',
      graphRevision: 'g1',
      sourceRevision: 's1',
      producerRevision: 'p1',
      checksum: 'checksum'
    }
  ]);

  expect(projection).toHaveLength(6);
  expect(projection.every((edge) => edge.weight === 0.5)).toBeTruthy();
  expect(projection.every((edge) => edge.evidenceHyperedgeIds.includes('mutation-1'))).toBeTruthy();
});

test('resolver promotes only after observed stabilization and exact verification', async () => {
  const lane: AtlasLane = {
    name: 'semantic',
    async propose(_request, context) {
      const candidates = [candidate('a', 0.9), candidate('b', 0.8)];
      return { lane: 'semantic', candidates: candidates.slice(0, context.candidateLimit) };
    }
  };

  const result = await resolveAtlasTask(input(), {
    lanes: [lane],
    exactPromoter: {
      async verify(_request, candidates) {
        return {
          decision: 'PROVEN',
          canonicalId: candidates[0]?.canonicalId,
          verifiedCandidateIds: candidates.map((item) => item.canonicalId),
          evidenceRefs: ['exact:1'],
          receiptChecksum: 'receipt-1'
        };
      }
    }
  });

  expect(result.fiber.stable).toBeTruthy();
  expect(result.fiber.status).toBe('PROVEN');
  expect(result.fiber.expansions).toHaveLength(2);
  expect(result.fiber.stabilizationDelta).toBe(0);
});

test('resolver reports boundary exhaustion when candidate set still changes at cap', async () => {
  const lane: AtlasLane = {
    name: 'semantic',
    async propose(_request, context) {
      const pool = [candidate('a', 0.9), candidate('b', 0.8), candidate('c', 0.7), candidate('d', 0.6)];
      return { lane: 'semantic', candidates: pool.slice(0, context.candidateLimit) };
    }
  };

  const result = await resolveAtlasTask(input(), { lanes: [lane] });

  expect(result.fiber.stable).toBeFalsy();
  expect(result.fiber.status).toBe('BOUNDARY_EXHAUSTED');
  expect(result.diagnostics.boundaryReasons).toContain('CANDIDATE_BUDGET');
});

test('resolver refuses duplicate logical lanes to prevent executor vote inflation', async () => {
  const lane: AtlasLane = {
    name: 'semantic',
    async propose() {
      return { lane: 'semantic', candidates: [] };
    }
  };

  await expect(resolveAtlasTask(input(), { lanes: [lane, lane] })).rejects.toThrow(
    /Duplicate logical Atlas lane/
  );
});
