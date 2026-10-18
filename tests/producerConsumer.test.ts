import { describe, expect, it } from 'vitest';
import { createPC, filledSlots, inCriticalSection, step, stepThread, type PCConfig, type PCState } from '@/lib/os/sync/producerConsumer';

const cfg = (patch: Partial<PCConfig> = {}): PCConfig => ({
  size: 3,
  producers: 2,
  consumers: 2,
  producerSpeed: 2,
  consumerSpeed: 1,
  useSemaphores: true,
  seed: 1,
  ...patch,
});

const run = (s: PCState, tid: number, n: number) => {
  for (let i = 0; i < n; i++) s = stepThread(s, tid);
  return s;
};

describe('producer–consumer with semaphores', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: mutual exclusion, bounded buffer, consistent counter over 600 steps`, () => {
      let s = createPC(cfg({ seed }));
      for (let i = 0; i < 600; i++) {
        s = step(s);
        const inside = s.threads.filter(inCriticalSection);
        expect(inside.length).toBeLessThanOrEqual(1);
        // mutex accounting: 1 = value + holders + queued
        expect(s.sem.mutex.value + inside.length + s.sem.mutex.queue.length).toBe(1);
        const filled = filledSlots(s);
        expect(filled).toBeGreaterThanOrEqual(0);
        expect(filled).toBeLessThanOrEqual(s.size);
        expect(s.produced - s.consumed).toBe(filled);
        expect(s.overwrites + s.garbageReads).toBe(0);
        if (inside.length === 0) expect(s.count).toBe(filled);
      }
      expect(s.consumed).toBeGreaterThan(20);
    });
  }

  it('a producer blocks on a full buffer and is woken by a consumer', () => {
    let s = createPC(cfg({ size: 1, producers: 1, consumers: 1 }));
    s = run(s, 0, 8); // one full produce/put cycle
    s = run(s, 0, 2); // produce, wait(empty) → blocks
    expect(s.threads[0].blocked).toBe(true);
    expect(s.sem.empty.value).toBe(-1);
    expect(s.sem.empty.queue).toEqual([0]);
    s = run(s, 1, 7); // consumer up to signal(empty)
    expect(s.threads[0].blocked).toBe(false);
    expect(s.last?.kind).toBe('wake');
  });

  it('a consumer blocks on an empty buffer', () => {
    const s = stepThread(createPC(cfg()), 2);
    expect(s.threads[2].blocked).toBe(true);
    expect(s.sem.full.value).toBe(-1);
  });
});

describe('race condition without semaphores', () => {
  it('interleaved count++ loses an update', () => {
    let s = createPC(cfg({ useSemaphores: false }));
    s = run(s, 0, 5); // P1: produce, wait, wait, put, reg = count (0)
    s = run(s, 1, 5); // P2: same, also reads 0
    s = run(s, 0, 1); // P1: count = 1
    s = run(s, 1, 1); // P2: count = 1  (lost update)
    expect(filledSlots(s)).toBe(2);
    expect(s.count).toBe(1);
    expect(s.last?.kind).toBe('error');
  });

  it('a consumer reads an empty slot', () => {
    const s = run(createPC(cfg({ useSemaphores: false })), 2, 3);
    expect(s.garbageReads).toBe(1);
  });

  it('a fast producer overwrites unconsumed items', () => {
    let s = createPC(cfg({ size: 2, producers: 1, consumers: 1, useSemaphores: false }));
    s = run(s, 0, 8 * 3);
    expect(s.overwrites).toBe(1);
  });

  it('random interleaving eventually corrupts the counter', () => {
    let s = createPC(cfg({ useSemaphores: false, consumerSpeed: 2 }));
    let corrupted = false;
    for (let i = 0; i < 2000 && !corrupted; i++) {
      s = step(s);
      corrupted = s.threads.every((t) => !inCriticalSection(t)) && s.count !== filledSlots(s);
    }
    expect(corrupted).toBe(true);
  });
});
