import type { ReplAlgo } from '../types';

export interface VictimCandidate {
  loadedAt: number;
  lastUsed: number;
}

/**
 * Picks the frame to evict. Shared by the kernel and the Page Replacement Lab.
 * FIFO: oldest load. LRU: oldest use. OPT: next use farthest in the future
 * (`nextUse(i)` returns Infinity if never used again); OPT ties fall back to FIFO.
 */
export function chooseVictim(frames: VictimCandidate[], algo: ReplAlgo, nextUse?: (i: number) => number): number {
  let best = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i];
    const b = frames[best];
    if (algo === 'FIFO') {
      if (a.loadedAt < b.loadedAt) best = i;
    } else if (algo === 'LRU') {
      if (a.lastUsed < b.lastUsed) best = i;
    } else {
      const na = nextUse ? nextUse(i) : Infinity;
      const nb = nextUse ? nextUse(best) : Infinity;
      if (na > nb || (na === nb && a.loadedAt < b.loadedAt)) best = i;
    }
  }
  return best;
}

export interface ReplacementStep {
  index: number;
  ref: number;
  /** Frame contents after this reference. */
  frames: (number | null)[];
  hit: boolean;
  /** Slot that received the page on a fault. */
  insertedAt: number | null;
  evicted: number | null;
}

export interface ReplacementResult {
  steps: ReplacementStep[];
  faults: number;
  hits: number;
}

export function runReplacement(refs: number[], numFrames: number, algo: ReplAlgo): ReplacementResult {
  const slots: ({ page: number } & VictimCandidate)[] = [];
  const steps: ReplacementStep[] = [];
  let faults = 0;

  refs.forEach((ref, i) => {
    const at = slots.findIndex((s) => s.page === ref);
    let insertedAt: number | null = null;
    let evicted: number | null = null;
    if (at >= 0) {
      slots[at].lastUsed = i;
    } else {
      faults++;
      if (slots.length < numFrames) {
        slots.push({ page: ref, loadedAt: i, lastUsed: i });
        insertedAt = slots.length - 1;
      } else {
        const v = chooseVictim(slots, algo, (k) => {
          const n = refs.indexOf(slots[k].page, i + 1);
          return n === -1 ? Infinity : n;
        });
        evicted = slots[v].page;
        slots[v] = { page: ref, loadedAt: i, lastUsed: i };
        insertedAt = v;
      }
    }
    const frames: (number | null)[] = Array.from({ length: numFrames }, (_, k) => slots[k]?.page ?? null);
    steps.push({ index: i, ref, frames, hit: at >= 0, insertedAt, evicted });
  });

  return { steps, faults, hits: refs.length - faults };
}

export function parseRefString(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 100);
}
