export type FitStrategy = 'FIRST' | 'BEST' | 'WORST';
export type PartitionMode = 'FIXED' | 'DYNAMIC';

export const FIT_LABELS: Record<FitStrategy, string> = { FIRST: 'First fit', BEST: 'Best fit', WORST: 'Worst fit' };

/**
 * A contiguous region of memory. In FIXED mode blocks are partitions with fixed boundaries
 * (`used` < `size` is internal fragmentation). In DYNAMIC mode an owned block is exactly as big
 * as its job, and free blocks are holes that split on allocation and coalesce on free.
 */
export interface MemBlock {
  id: number;
  start: number;
  size: number;
  owner: string | null;
  used: number;
  /** Not allocatable / not freeable (the OS, or pre-existing processes in a layout). */
  locked?: boolean;
}

export interface Job {
  name: string;
  size: number;
}

export interface MemState {
  mode: PartitionMode;
  total: number;
  blocks: MemBlock[];
  waiting: Job[];
  nextId: number;
}

export type AllocOutcome =
  | { ok: true; blockId: number; start: number; holeSize: number }
  | { ok: false; reason: 'NO_FIT' | 'EXTERNAL_FRAGMENTATION' | 'TOO_BIG' };

export interface MemOpResult {
  state: MemState;
  outcome: AllocOutcome;
}

const sorted = (blocks: MemBlock[]) => [...blocks].sort((a, b) => a.start - b.start);

/** Build a memory from a list of [size, owner] regions laid out from address 0. */
export function createMemory(mode: PartitionMode, regions: [number, string | null, boolean?][]): MemState {
  let start = 0;
  const blocks = regions.map(([size, owner, locked], i) => {
    const b: MemBlock = { id: i + 1, start, size, owner, used: owner ? size : 0, locked: !!locked };
    start += size;
    return b;
  });
  return { mode, total: start, blocks, waiting: [], nextId: blocks.length + 1 };
}

const isHole = (b: MemBlock) => b.owner === null;

/** Pick the free block for `size` (blocks in address order). */
export function chooseHole(blocks: MemBlock[], size: number, strategy: FitStrategy): MemBlock | null {
  const fits = sorted(blocks).filter((b) => isHole(b) && b.size >= size);
  if (!fits.length) return null;
  if (strategy === 'FIRST') return fits[0];
  if (strategy === 'BEST') return fits.reduce((a, b) => (b.size < a.size ? b : a));
  return fits.reduce((a, b) => (b.size > a.size ? b : a));
}

function place(state: MemState, job: Job, strategy: FitStrategy): MemOpResult {
  const hole = chooseHole(state.blocks, job.size, strategy);
  if (!hole) {
    const free = freeTotal(state);
    const reason = job.size > state.total ? 'TOO_BIG' : state.mode === 'DYNAMIC' && free >= job.size ? 'EXTERNAL_FRAGMENTATION' : 'NO_FIT';
    return { state, outcome: { ok: false, reason } };
  }
  let nextId = state.nextId;
  let blocks: MemBlock[];
  let blockId: number;
  if (state.mode === 'FIXED' || hole.size === job.size) {
    blockId = hole.id;
    blocks = state.blocks.map((b) => (b.id === hole.id ? { ...b, owner: job.name, used: job.size } : b));
  } else {
    // split: the job takes the low part of the hole (keeping the hole's id), the rest stays free
    blockId = hole.id;
    const rest: MemBlock = { id: nextId++, start: hole.start + job.size, size: hole.size - job.size, owner: null, used: 0 };
    blocks = state.blocks.flatMap((b) => (b.id === hole.id ? [{ ...b, size: job.size, owner: job.name, used: job.size }, rest] : [b]));
  }
  return {
    state: { ...state, blocks: sorted(blocks), nextId },
    outcome: { ok: true, blockId, start: hole.start, holeSize: hole.size },
  };
}

/** Allocate a job; if it cannot be placed it joins the waiting queue. */
export function allocate(state: MemState, job: Job, strategy: FitStrategy): MemOpResult {
  const r = place(state, job, strategy);
  if (r.outcome.ok) return r;
  return { state: { ...state, waiting: [...state.waiting, job] }, outcome: r.outcome };
}

/** Merge neighbouring holes (dynamic partitioning only). */
function coalesce(blocks: MemBlock[]): MemBlock[] {
  const out: MemBlock[] = [];
  for (const b of sorted(blocks)) {
    const prev = out[out.length - 1];
    if (prev && isHole(prev) && isHole(b)) out[out.length - 1] = { ...prev, size: prev.size + b.size };
    else out.push({ ...b });
  }
  return out;
}

/** Retry waiting jobs in FIFO order (each one that fits is placed). */
function retryWaiting(state: MemState, strategy: FitStrategy): { state: MemState; placed: string[] } {
  let s: MemState = { ...state, waiting: [] };
  const still: Job[] = [];
  const placed: string[] = [];
  for (const job of state.waiting) {
    const r = place(s, job, strategy);
    if (r.outcome.ok) {
      s = r.state;
      placed.push(job.name);
    } else still.push(job);
  }
  return { state: { ...s, waiting: still }, placed };
}

export function free(state: MemState, owner: string, strategy: FitStrategy): { state: MemState; placed: string[] } {
  let blocks = state.blocks.map((b) => (b.owner === owner && !b.locked ? { ...b, owner: null, used: 0 } : b));
  if (state.mode === 'DYNAMIC') blocks = coalesce(blocks);
  return retryWaiting({ ...state, blocks, waiting: state.waiting.filter((j) => j.name !== owner) }, strategy);
}

/** Slide every allocated block toward address 0, leaving one hole at the end. */
export function compact(state: MemState, strategy: FitStrategy): { state: MemState; placed: string[]; moved: number } {
  if (state.mode !== 'DYNAMIC') return { state, placed: [], moved: 0 };
  let addr = 0;
  let moved = 0;
  const owned = sorted(state.blocks)
    .filter((b) => !isHole(b))
    .map((b) => {
      const nb = { ...b, start: addr };
      if (nb.start !== b.start) moved += b.size;
      addr += b.size;
      return nb;
    });
  const holes = state.blocks.filter(isHole);
  const blocks = addr < state.total ? [...owned, { id: holes[0]?.id ?? state.nextId, start: addr, size: state.total - addr, owner: null, used: 0 }] : owned;
  const r = retryWaiting({ ...state, blocks, nextId: holes.length ? state.nextId : state.nextId + 1 }, strategy);
  return { ...r, moved };
}

export function freeTotal(state: MemState): number {
  return state.blocks.filter(isHole).reduce((a, b) => a + b.size, 0);
}

export function memStats(state: MemState) {
  const holes = state.blocks.filter(isHole);
  const free = freeTotal(state);
  const largest = holes.reduce((a, b) => Math.max(a, b.size), 0);
  const internal = state.blocks.filter((b) => !isHole(b)).reduce((a, b) => a + (b.size - b.used), 0);
  return {
    used: state.total - free,
    free,
    holes: holes.length,
    largestHole: largest,
    internalFragmentation: internal,
    /** Free memory outside the largest hole: usable only after compaction. */
    externalFragmentation: state.mode === 'DYNAMIC' ? free - largest : 0,
  };
}

// ---------------------------------------------------------------- presets

/** Silberschatz exercise: partitions 100, 500, 200, 300, 600 (K); jobs 212, 417, 112, 426. */
export const TEXTBOOK_JOBS: Job[] = [
  { name: 'J1', size: 212 },
  { name: 'J2', size: 417 },
  { name: 'J3', size: 112 },
  { name: 'J4', size: 426 },
];

export function textbookMemory(mode: PartitionMode): MemState {
  if (mode === 'FIXED')
    return createMemory('FIXED', [
      [100, 'OS', true],
      [100, null],
      [500, null],
      [200, null],
      [300, null],
      [600, null],
    ]);
  // holes of the same sizes, separated by small resident processes
  return createMemory('DYNAMIC', [
    [100, 'OS', true],
    [100, null],
    [50, 'A'],
    [500, null],
    [50, 'B'],
    [200, null],
    [50, 'C'],
    [300, null],
    [50, 'D'],
    [600, null],
  ]);
}
