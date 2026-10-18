import { describe, expect, it } from 'vitest';
import { runReplacement, parseRefString } from '@/lib/os/memory/replacement';

const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
const TEXTBOOK = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

describe('page replacement (textbook answers)', () => {
  it("Belady's anomaly: FIFO 9 faults @3 frames, 10 @4 frames", () => {
    expect(runReplacement(BELADY, 3, 'FIFO').faults).toBe(9);
    expect(runReplacement(BELADY, 4, 'FIFO').faults).toBe(10);
  });

  it('Silberschatz string @3 frames: FIFO 15, LRU 12, OPT 9', () => {
    expect(runReplacement(TEXTBOOK, 3, 'FIFO').faults).toBe(15);
    expect(runReplacement(TEXTBOOK, 3, 'LRU').faults).toBe(12);
    expect(runReplacement(TEXTBOOK, 3, 'OPT').faults).toBe(9);
  });

  it('steps record frames, hits and the evicted page', () => {
    const r = runReplacement([1, 2, 1, 3], 2, 'LRU');
    expect(r.steps.map((s) => s.hit)).toEqual([false, false, true, false]);
    expect(r.steps[3].evicted).toBe(2);
    expect(r.steps[3].frames).toEqual([1, 3]);
  });

  it('parses comma or space separated reference strings', () => {
    expect(parseRefString('7, 0 1,,2  x 3')).toEqual([7, 0, 1, 2, 3]);
  });
});
