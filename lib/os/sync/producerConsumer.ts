import { nextRandom } from '../rng';

/**
 * Bounded-buffer Producer–Consumer, executed one statement at a time so interleavings are
 * visible. `count++` / `count--` are split into a load and a store, as on real hardware.
 * With semaphores off, wait/signal become no-ops: the race shows up as a corrupted counter,
 * overwritten items and reads of empty slots.
 */

export type SemName = 'empty' | 'full' | 'mutex';
export type Op = 'produce' | 'wait' | 'signal' | 'put' | 'take' | 'load' | 'storeInc' | 'storeDec' | 'consume';

export interface Line {
  text: string;
  /** Compact form for 3D captions. */
  short?: string;
  op: Op;
  sem?: SemName;
}

export const PRODUCER: Line[] = [
  { text: 'item = produce()', op: 'produce' },
  { text: 'wait(empty)', op: 'wait', sem: 'empty' },
  { text: 'wait(mutex)', op: 'wait', sem: 'mutex' },
  { text: 'buffer[in] = item; in = (in + 1) % N', short: 'buffer[in] = item', op: 'put' },
  { text: 'reg = count', op: 'load' },
  { text: 'count = reg + 1', op: 'storeInc' },
  { text: 'signal(mutex)', op: 'signal', sem: 'mutex' },
  { text: 'signal(full)', op: 'signal', sem: 'full' },
];

export const CONSUMER: Line[] = [
  { text: 'wait(full)', op: 'wait', sem: 'full' },
  { text: 'wait(mutex)', op: 'wait', sem: 'mutex' },
  { text: 'item = buffer[out]; out = (out + 1) % N', short: 'item = buffer[out]', op: 'take' },
  { text: 'reg = count', op: 'load' },
  { text: 'count = reg − 1', op: 'storeDec' },
  { text: 'signal(mutex)', op: 'signal', sem: 'mutex' },
  { text: 'signal(empty)', op: 'signal', sem: 'empty' },
  { text: 'consume(item)', op: 'consume' },
];

/** Lines (pc values) inside the critical section, i.e. after wait(mutex) and before signal(mutex). */
const CS = { P: [3, 4, 5, 6], C: [2, 3, 4, 5] };

export interface Sem {
  value: number;
  queue: number[];
}

export interface Thread {
  id: number;
  kind: 'P' | 'C';
  name: string;
  pc: number;
  item: number | null;
  reg: number;
  blocked: boolean;
  speed: number;
  done: number;
}

export interface Slot {
  item: number;
  by: number;
}

export type EventKind = 'ok' | 'block' | 'wake' | 'error' | 'stall';

export interface PCEvent {
  step: number;
  tid: number;
  line: number;
  text: string;
  kind: EventKind;
  op?: Op;
  slot?: number;
  item?: number;
  woke?: number;
}

export interface PCState {
  size: number;
  buffer: (Slot | null)[];
  in: number;
  out: number;
  count: number;
  sem: Record<SemName, Sem>;
  useSemaphores: boolean;
  threads: Thread[];
  rng: number;
  step: number;
  nextItem: number;
  produced: number;
  consumed: number;
  overwrites: number;
  garbageReads: number;
  last: PCEvent | null;
  log: PCEvent[];
}

export interface PCConfig {
  size: number;
  producers: number;
  consumers: number;
  producerSpeed: number;
  consumerSpeed: number;
  useSemaphores: boolean;
  seed: number;
}

export const programOf = (t: Thread) => (t.kind === 'P' ? PRODUCER : CONSUMER);

export function createPC(cfg: PCConfig): PCState {
  const threads: Thread[] = [];
  for (let i = 0; i < cfg.producers; i++)
    threads.push({ id: threads.length, kind: 'P', name: `Producer ${i + 1}`, pc: 0, item: null, reg: 0, blocked: false, speed: cfg.producerSpeed, done: 0 });
  for (let i = 0; i < cfg.consumers; i++)
    threads.push({ id: threads.length, kind: 'C', name: `Consumer ${i + 1}`, pc: 0, item: null, reg: 0, blocked: false, speed: cfg.consumerSpeed, done: 0 });
  return {
    size: cfg.size,
    buffer: Array.from({ length: cfg.size }, () => null),
    in: 0,
    out: 0,
    count: 0,
    sem: { empty: { value: cfg.size, queue: [] }, full: { value: 0, queue: [] }, mutex: { value: 1, queue: [] } },
    useSemaphores: cfg.useSemaphores,
    threads,
    rng: cfg.seed >>> 0,
    step: 0,
    nextItem: 1,
    produced: 0,
    consumed: 0,
    overwrites: 0,
    garbageReads: 0,
    last: null,
    log: [],
  };
}

export const inCriticalSection = (t: Thread) => !t.blocked && CS[t.kind].includes(t.pc);
export const filledSlots = (s: PCState) => s.buffer.filter((x) => x !== null).length;
export const runnable = (s: PCState) => s.threads.filter((t) => !t.blocked);

function clone(s: PCState): PCState {
  return {
    ...s,
    buffer: [...s.buffer],
    sem: { empty: { ...s.sem.empty, queue: [...s.sem.empty.queue] }, full: { ...s.sem.full, queue: [...s.sem.full.queue] }, mutex: { ...s.sem.mutex, queue: [...s.sem.mutex.queue] } },
    threads: s.threads.map((t) => ({ ...t })),
  };
}

function record(s: PCState, e: Omit<PCEvent, 'step'>) {
  const ev = { ...e, step: s.step };
  s.last = ev;
  s.log = [ev, ...s.log].slice(0, 80);
}

/** Execute exactly one statement of thread `tid`. */
export function stepThread(state: PCState, tid: number): PCState {
  const s = clone(state);
  const t = s.threads[tid];
  if (!t || t.blocked) return state;
  const prog = programOf(t);
  const line = t.pc;
  const L = prog[line];
  s.step++;
  const base = { tid, line, op: L.op, text: `${t.name}: ${L.text}` };

  switch (L.op) {
    case 'produce':
      t.item = s.nextItem++;
      record(s, { ...base, kind: 'ok', item: t.item, text: `${t.name} produced item ${t.item}` });
      break;
    case 'wait': {
      if (!s.useSemaphores) {
        record(s, { ...base, kind: 'ok', text: `${t.name}: ${L.text} skipped (no semaphores)` });
        break;
      }
      const sem = s.sem[L.sem!];
      sem.value--;
      if (sem.value < 0) {
        t.blocked = true;
        sem.queue.push(tid);
        record(s, { ...base, kind: 'block', text: `${t.name} blocks on ${L.sem} (${L.sem} = ${sem.value})` });
      } else record(s, { ...base, kind: 'ok', text: `${t.name}: ${L.text} → ${L.sem} = ${sem.value}` });
      break;
    }
    case 'signal': {
      if (!s.useSemaphores) {
        record(s, { ...base, kind: 'ok', text: `${t.name}: ${L.text} skipped (no semaphores)` });
        break;
      }
      const sem = s.sem[L.sem!];
      sem.value++;
      if (sem.value <= 0 && sem.queue.length) {
        const w = sem.queue.shift()!;
        s.threads[w].blocked = false;
        record(s, { ...base, kind: 'wake', woke: w, text: `${t.name}: ${L.text} wakes ${s.threads[w].name}` });
      } else record(s, { ...base, kind: 'ok', text: `${t.name}: ${L.text} → ${L.sem} = ${sem.value}` });
      break;
    }
    case 'put': {
      const slot = s.in;
      const prev = s.buffer[slot];
      s.buffer[slot] = { item: t.item ?? 0, by: tid };
      s.in = (s.in + 1) % s.size;
      s.produced++;
      if (prev) {
        s.overwrites++;
        record(s, { ...base, kind: 'error', slot, item: t.item ?? 0, text: `${t.name} overwrote item ${prev.item} in slot ${slot}: item lost!` });
      } else record(s, { ...base, kind: 'ok', slot, item: t.item ?? 0, text: `${t.name} put item ${t.item} in slot ${slot}` });
      t.item = null;
      break;
    }
    case 'take': {
      const slot = s.out;
      const got = s.buffer[slot];
      s.buffer[slot] = null;
      s.out = (s.out + 1) % s.size;
      if (got) {
        t.item = got.item;
        s.consumed++;
        record(s, { ...base, kind: 'ok', slot, item: got.item, text: `${t.name} took item ${got.item} from slot ${slot}` });
      } else {
        t.item = -1;
        s.garbageReads++;
        record(s, { ...base, kind: 'error', slot, text: `${t.name} read empty slot ${slot}: garbage!` });
      }
      break;
    }
    case 'load':
      t.reg = s.count;
      record(s, { ...base, kind: 'ok', text: `${t.name}: reg = count (${t.reg})` });
      break;
    case 'storeInc':
    case 'storeDec': {
      const before = s.count;
      s.count = t.reg + (L.op === 'storeInc' ? 1 : -1);
      const lost = before !== t.reg;
      record(s, {
        ...base,
        kind: lost ? 'error' : 'ok',
        text: lost ? `${t.name}: count = ${s.count}, overwriting ${before}: an update was lost!` : `${t.name}: count = ${s.count}`,
      });
      break;
    }
    case 'consume':
      t.done++;
      record(s, { ...base, kind: 'ok', text: t.item === -1 ? `${t.name} consumed garbage` : `${t.name} consumed item ${t.item}` });
      t.item = null;
      break;
  }
  t.pc = (t.pc + 1) % prog.length;
  return s;
}

/** Scheduler step: pick a runnable thread at random, weighted by its speed (seeded). */
export function step(state: PCState): PCState {
  const ready = runnable(state);
  if (!ready.length) {
    const s = clone(state);
    s.step++;
    record(s, { tid: -1, line: -1, kind: 'stall', text: 'Every thread is blocked.' });
    return s;
  }
  const [r, rng] = nextRandom(state.rng);
  const total = ready.reduce((a, t) => a + t.speed, 0);
  let pick = r * total;
  let chosen = ready[ready.length - 1];
  for (const t of ready) {
    pick -= t.speed;
    if (pick < 0) {
      chosen = t;
      break;
    }
  }
  return stepThread({ ...state, rng }, chosen.id);
}

/** Is the shared counter consistent with the buffer? (only meaningful outside the critical section) */
export function counterOk(s: PCState): boolean {
  return s.count === filledSlots(s);
}
