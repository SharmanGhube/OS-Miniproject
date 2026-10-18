/**
 * Deadlock detection on a Resource Allocation Graph.
 * Request edge P→R: `request[p][r]` instances wanted. Assignment edge R→P: `allocation[p][r]` held.
 */

export interface RagResource {
  name: string;
  instances: number;
}

export interface RAG {
  processes: string[];
  resources: RagResource[];
  allocation: number[][];
  request: number[][];
  /** false once a process has been aborted during recovery. */
  alive: boolean[];
}

export interface DetectCheck {
  pid: number;
  work: number[];
  request: number[];
  canFinish: boolean;
  workAfter: number[] | null;
}

export interface DetectResult {
  deadlocked: number[];
  sequence: number[];
  finish: boolean[];
  /** Processes holding nothing start with Finish = true (they cannot be part of a deadlock). */
  initiallyFinished: number[];
  checks: DetectCheck[];
}

const leq = (a: number[], b: number[]) => a.every((x, j) => x <= b[j]);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function availableOf(g: RAG): number[] {
  return g.resources.map((r, j) => r.instances - g.allocation.reduce((a, row) => a + row[j], 0));
}

export function validate(g: RAG): string[] {
  return availableOf(g).flatMap((a, j) => (a < 0 ? [`${g.resources[j].name} is over-allocated by ${-a}`] : []));
}

/** Silberschatz detection algorithm (several instances per resource type). */
export function detect(g: RAG): DetectResult {
  const n = g.processes.length;
  let work = availableOf(g);
  const finish = g.allocation.map((row, i) => !g.alive[i] || sum(row) === 0);
  const initiallyFinished = finish.flatMap((f, i) => (f && g.alive[i] ? [i] : []));
  const sequence: number[] = [];
  const checks: DetectCheck[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      const before = [...work];
      const canFinish = leq(g.request[i], work);
      if (canFinish) {
        work = work.map((w, j) => w + g.allocation[i][j]);
        finish[i] = true;
        sequence.push(i);
        progressed = true;
      }
      checks.push({ pid: i, work: before, request: [...g.request[i]], canFinish, workAfter: canFinish ? [...work] : null });
    }
  }
  return { deadlocked: finish.flatMap((f, i) => (f ? [] : [i])), sequence, finish, initiallyFinished, checks };
}

// ---------------------------------------------------------------- graph view

export type NodeId = `P${number}` | `R${number}`;
export const edgeKey = (from: NodeId, to: NodeId) => `${from}->${to}`;

function adjacency(g: RAG): Map<NodeId, NodeId[]> {
  const adj = new Map<NodeId, NodeId[]>();
  g.processes.forEach((_, i) => adj.set(`P${i}`, []));
  g.resources.forEach((_, j) => adj.set(`R${j}`, []));
  g.processes.forEach((_, i) => {
    if (!g.alive[i]) return;
    g.resources.forEach((_, j) => {
      if (g.request[i][j] > 0) adj.get(`P${i}`)!.push(`R${j}`);
      if (g.allocation[i][j] > 0) adj.get(`R${j}`)!.push(`P${i}`);
    });
  });
  return adj;
}

/** Tarjan's strongly connected components. */
function sccs(adj: Map<NodeId, NodeId[]>): NodeId[][] {
  let index = 0;
  const idx = new Map<NodeId, number>();
  const low = new Map<NodeId, number>();
  const stack: NodeId[] = [];
  const on = new Set<NodeId>();
  const out: NodeId[][] = [];
  const visit = (v: NodeId) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v)!) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: NodeId[] = [];
      let w: NodeId;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of adj.keys()) if (!idx.has(v)) visit(v);
  return out;
}

/** Every edge that lies on some cycle (both ends in the same non-trivial SCC). */
export function cycleEdges(g: RAG): Set<string> {
  const adj = adjacency(g);
  const comp = new Map<NodeId, number>();
  sccs(adj).forEach((c, k) => c.length > 1 && c.forEach((v) => comp.set(v, k)));
  const edges = new Set<string>();
  for (const [v, ws] of adj) for (const w of ws) if (comp.has(v) && comp.get(v) === comp.get(w)) edges.add(edgeKey(v, w));
  return edges;
}

/** One concrete cycle for display, e.g. ['P1','R2','P2','R1'], or null. */
export function findCycle(g: RAG): NodeId[] | null {
  const adj = adjacency(g);
  const color = new Map<NodeId, 0 | 1 | 2>();
  const parent = new Map<NodeId, NodeId>();
  let found: NodeId[] | null = null;
  const dfs = (v: NodeId) => {
    color.set(v, 1);
    for (const w of adj.get(v)!) {
      if (found) return;
      if (color.get(w) === 1) {
        const cyc: NodeId[] = [w];
        for (let x = v; x !== w; x = parent.get(x)!) cyc.push(x);
        found = cyc.reverse();
        // rotate so a process comes first
        const k = found.findIndex((id) => id.startsWith('P'));
        found = [...found.slice(k), ...found.slice(0, k)];
        return;
      }
      if (!color.get(w)) {
        parent.set(w, v);
        dfs(w);
      }
    }
    color.set(v, 2);
  };
  for (const v of adj.keys()) if (!color.get(v) && !found) dfs(v);
  return found;
}

/** Coffman's four necessary conditions, as they apply to this graph. */
export function conditions(g: RAG) {
  const holdAndWait = g.processes.some((_, i) => g.alive[i] && sum(g.allocation[i]) > 0 && sum(g.request[i]) > 0);
  return { mutualExclusion: true, holdAndWait, noPreemption: true, circularWait: cycleEdges(g).size > 0 };
}

// ---------------------------------------------------------------- recovery

const cloneRag = (g: RAG): RAG => ({
  processes: [...g.processes],
  resources: g.resources.map((r) => ({ ...r })),
  allocation: g.allocation.map((r) => [...r]),
  request: g.request.map((r) => [...r]),
  alive: [...g.alive],
});

/** Abort a process: it releases everything it holds and stops requesting. */
export function abortProcess(g: RAG, p: number): RAG {
  const h = cloneRag(g);
  h.allocation[p] = h.allocation[p].map(() => 0);
  h.request[p] = h.request[p].map(() => 0);
  h.alive[p] = false;
  return h;
}

/** Preempt one instance of resource r from process p; p is rolled back and must request it again. */
export function preemptResource(g: RAG, p: number, r: number): RAG {
  if (g.allocation[p][r] <= 0) return g;
  const h = cloneRag(g);
  h.allocation[p][r]--;
  h.request[p][r]++;
  return h;
}

export function setEdge(g: RAG, kind: 'request' | 'allocation', p: number, r: number, value: number): RAG {
  const h = cloneRag(g);
  h[kind][p][r] = Math.max(0, value);
  return h;
}

// ---------------------------------------------------------------- presets

function rag(processes: string[], resources: [string, number][], alloc: Record<string, number>, req: Record<string, number>): RAG {
  const ri = new Map(resources.map(([name], j) => [name, j]));
  const pi = new Map(processes.map((name, i) => [name, i]));
  const allocation = processes.map(() => resources.map(() => 0));
  const request = processes.map(() => resources.map(() => 0));
  for (const [k, v] of Object.entries(alloc)) {
    const [p, r] = k.split(':');
    allocation[pi.get(p)!][ri.get(r)!] = v;
  }
  for (const [k, v] of Object.entries(req)) {
    const [p, r] = k.split(':');
    request[pi.get(p)!][ri.get(r)!] = v;
  }
  return { processes, resources: resources.map(([name, instances]) => ({ name, instances })), allocation, request, alive: processes.map(() => true) };
}

function fromMatrices(names: string[], res: [string, number][], allocation: number[][], request: number[][]): RAG {
  return { processes: names, resources: res.map(([name, instances]) => ({ name, instances })), allocation, request, alive: names.map(() => true) };
}

export const RAG_PRESETS: { id: string; label: string; note: string; graph: () => RAG }[] = [
  {
    id: 'fig72',
    label: 'RAG, no deadlock (Fig 7.2)',
    note: 'No cycle, so no deadlock. P3 finishes, then P2, then P1.',
    graph: () => rag(['P1', 'P2', 'P3'], [['R1', 1], ['R2', 2], ['R3', 1], ['R4', 3]], { 'P1:R2': 1, 'P2:R1': 1, 'P2:R2': 1, 'P3:R3': 1 }, { 'P1:R1': 1, 'P2:R3': 1 }),
  },
  {
    id: 'fig73',
    label: 'RAG with deadlock (Fig 7.3)',
    note: 'P3 now also requests R2. Two cycles appear, and P1, P2 and P3 are deadlocked.',
    graph: () => rag(['P1', 'P2', 'P3'], [['R1', 1], ['R2', 2], ['R3', 1], ['R4', 3]], { 'P1:R2': 1, 'P2:R1': 1, 'P2:R2': 1, 'P3:R3': 1 }, { 'P1:R1': 1, 'P2:R3': 1, 'P3:R2': 1 }),
  },
  {
    id: 'fig74',
    label: 'Cycle but no deadlock (Fig 7.4)',
    note: 'There is a cycle P1 → R1 → P3 → R2 → P1, but P2 and P4 can finish and release instances. With several instances, a cycle is necessary but not sufficient.',
    graph: () => rag(['P1', 'P2', 'P3', 'P4'], [['R1', 2], ['R2', 2]], { 'P1:R2': 1, 'P2:R1': 1, 'P3:R1': 1, 'P4:R2': 1 }, { 'P1:R1': 1, 'P3:R2': 1 }),
  },
  {
    id: 'detect',
    label: 'Detection algorithm (5 processes)',
    note: 'Silberschatz detection example: A = 7, B = 2, C = 6 and Available = (0, 0, 0). Every process can finish.',
    graph: () =>
      fromMatrices(
        ['P0', 'P1', 'P2', 'P3', 'P4'],
        [['A', 7], ['B', 2], ['C', 6]],
        [
          [0, 1, 0],
          [2, 0, 0],
          [3, 0, 3],
          [2, 1, 1],
          [0, 0, 2],
        ],
        [
          [0, 0, 0],
          [2, 0, 2],
          [0, 0, 0],
          [1, 0, 0],
          [0, 0, 2],
        ],
      ),
  },
  {
    id: 'detect2',
    label: '…after P2 requests one more C',
    note: 'P2 now requests one more instance of C. Only P0 can finish, and P1 to P4 are deadlocked.',
    graph: () =>
      fromMatrices(
        ['P0', 'P1', 'P2', 'P3', 'P4'],
        [['A', 7], ['B', 2], ['C', 6]],
        [
          [0, 1, 0],
          [2, 0, 0],
          [3, 0, 3],
          [2, 1, 1],
          [0, 0, 2],
        ],
        [
          [0, 0, 0],
          [2, 0, 2],
          [0, 0, 1],
          [1, 0, 0],
          [0, 0, 2],
        ],
      ),
  },
];

export const presetGraph = (id: string) => RAG_PRESETS.find((p) => p.id === id)!.graph();
