import { describe, expect, it } from 'vitest';
import {
  abortProcess,
  availableOf,
  conditions,
  cycleEdges,
  detect,
  findCycle,
  preemptResource,
  presetGraph,
  validate,
  type RAG,
} from '@/lib/os/deadlock/detection';

/** Each process in the sequence must have its request satisfiable by Work at its turn. */
function validSequence(g: RAG, seq: number[]) {
  let work = availableOf(g);
  for (const i of seq) {
    if (!g.request[i].every((x, j) => x <= work[j])) return false;
    work = work.map((w, j) => w + g.allocation[i][j]);
  }
  return true;
}

describe('resource allocation graph', () => {
  it('Fig 7.2: no cycle, no deadlock', () => {
    const g = presetGraph('fig72');
    expect(validate(g)).toEqual([]);
    expect(findCycle(g)).toBeNull();
    expect(cycleEdges(g).size).toBe(0);
    const r = detect(g);
    expect(r.deadlocked).toEqual([]);
    expect(r.sequence.map((i) => g.processes[i])).toEqual(['P3', 'P2', 'P1']);
  });

  it('Fig 7.3: cycles and deadlock of P1, P2, P3', () => {
    const g = presetGraph('fig73');
    expect(findCycle(g)).not.toBeNull();
    const edges = cycleEdges(g);
    expect(edges.has('P0->R0')).toBe(true); // P1 → R1
    expect(edges.has('P2->R1')).toBe(true); // P3 → R2
    expect(detect(g).deadlocked).toEqual([0, 1, 2]);
    expect(conditions(g)).toEqual({ mutualExclusion: true, holdAndWait: true, noPreemption: true, circularWait: true });
  });

  it('Fig 7.4: a cycle without deadlock (multiple instances)', () => {
    const g = presetGraph('fig74');
    expect(findCycle(g)).not.toBeNull();
    expect(detect(g).deadlocked).toEqual([]);
  });

  it('the cycle found is a real cycle in the graph', () => {
    const g = presetGraph('fig73');
    const c = findCycle(g)!;
    for (let k = 0; k < c.length; k++) {
      const a = c[k];
      const b = c[(k + 1) % c.length];
      const p = Number((a.startsWith('P') ? a : b).slice(1));
      const r = Number((a.startsWith('R') ? a : b).slice(1));
      expect(a.startsWith('P') ? g.request[p][r] : g.allocation[p][r]).toBeGreaterThan(0);
    }
  });
});

describe('detection algorithm (Silberschatz, A = 7, B = 2, C = 6)', () => {
  it('not deadlocked; the sequence found is valid', () => {
    const g = presetGraph('detect');
    expect(availableOf(g)).toEqual([0, 0, 0]);
    const r = detect(g);
    expect(r.deadlocked).toEqual([]);
    expect(r.sequence).toHaveLength(5);
    expect(validSequence(g, r.sequence)).toBe(true);
  });

  it('after P2 requests one more C: P1, P2, P3, P4 are deadlocked', () => {
    const r = detect(presetGraph('detect2'));
    expect(r.sequence).toEqual([0]);
    expect(r.deadlocked).toEqual([1, 2, 3, 4]);
  });
});

describe('recovery', () => {
  it('aborting P3 breaks the Fig 7.3 deadlock', () => {
    const g = abortProcess(presetGraph('fig73'), 2);
    expect(detect(g).deadlocked).toEqual([]);
    expect(cycleEdges(g).size).toBe(0);
  });

  it('preempting R2 from P1 (with rollback) breaks it too', () => {
    const g = preemptResource(presetGraph('fig73'), 0, 1);
    expect(g.allocation[0][1]).toBe(0);
    expect(g.request[0][1]).toBe(1);
    expect(detect(g).deadlocked).toEqual([]);
  });

  it('aborting P1 in the 5-process deadlock releases (2,0,0) and the rest can finish', () => {
    const g = abortProcess(presetGraph('detect2'), 1);
    const r = detect(g);
    expect(r.deadlocked).toEqual([]);
    expect(validSequence(g, r.sequence)).toBe(true);
  });
});
