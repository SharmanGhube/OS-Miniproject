import { describe, expect, it } from 'vitest';
import {
  allocate,
  compact,
  free,
  memStats,
  textbookMemory,
  TEXTBOOK_JOBS,
  type FitStrategy,
  type MemState,
  type PartitionMode,
} from '@/lib/os/memory/partitioning';

/** Run the textbook jobs and report where each one landed (start address, or 'wait'). */
function run(mode: PartitionMode, strategy: FitStrategy) {
  let s: MemState = textbookMemory(mode);
  const where: (number | 'wait')[] = [];
  for (const job of TEXTBOOK_JOBS) {
    const r = allocate(s, job, strategy);
    s = r.state;
    where.push(r.outcome.ok ? r.outcome.start : 'wait');
  }
  return { s, where };
}

// Textbook layout addresses: holes of 100@100, 500@250, 200@800, 300@1050, 600@1400 (dynamic)
// and partitions of 100@100, 500@200, 200@700, 300@900, 600@1200 (fixed).
describe('fixed partitioning (Silberschatz 212/417/112/426)', () => {
  it('first fit: 500, 600, 200, 426 waits', () => {
    expect(run('FIXED', 'FIRST').where).toEqual([200, 1200, 700, 'wait']);
  });
  it('best fit: 300, 500, 200, 600 (all placed)', () => {
    const { s, where } = run('FIXED', 'BEST');
    expect(where).toEqual([900, 200, 700, 1200]);
    // internal fragmentation: 88 + 83 + 88 + 174
    expect(memStats(s).internalFragmentation).toBe(433);
  });
  it('worst fit: 600, 500, 300, 426 waits', () => {
    expect(run('FIXED', 'WORST').where).toEqual([1200, 200, 900, 'wait']);
  });
});

describe('dynamic partitioning', () => {
  it('first fit: 212 → 500-hole, 417 → 600-hole, 112 → leftover 288, 426 waits', () => {
    const { s, where } = run('DYNAMIC', 'FIRST');
    expect(where).toEqual([250, 1400, 462, 'wait']);
    expect(s.waiting.map((j) => j.name)).toEqual(['J4']);
  });
  it('best fit places all four', () => {
    expect(run('DYNAMIC', 'BEST').where).toEqual([1050, 250, 800, 1400]);
  });
  it('worst fit: 212 → 600, 417 → 500, 112 → leftover 388, 426 waits', () => {
    expect(run('DYNAMIC', 'WORST').where).toEqual([1400, 250, 1612, 'wait']);
  });
  it('blocked by external fragmentation, then compaction lets the job in', () => {
    const { s } = run('DYNAMIC', 'FIRST');
    const st = memStats(s);
    expect(st.free).toBeGreaterThanOrEqual(426);
    expect(st.largestHole).toBeLessThan(426);
    expect(allocate(s, { name: 'X', size: 426 }, 'FIRST').outcome).toEqual({ ok: false, reason: 'EXTERNAL_FRAGMENTATION' });

    const c = compact(s, 'FIRST');
    expect(c.placed).toEqual(['J4']);
    const holes = c.state.blocks.filter((b) => b.owner === null);
    expect(holes).toHaveLength(1);
    expect(holes[0].start + holes[0].size).toBe(c.state.total);
    // allocated blocks are contiguous from address 0
    let addr = 0;
    for (const b of c.state.blocks.filter((x) => x.owner !== null)) {
      expect(b.start).toBe(addr);
      addr += b.size;
    }
  });
  it('free coalesces neighbouring holes', () => {
    const s = textbookMemory('DYNAMIC');
    const r = free(s, 'A', 'FIRST');
    const hole = r.state.blocks.find((b) => b.start === 100)!;
    expect(hole.owner).toBeNull();
    expect(hole.size).toBe(100 + 50 + 500);
    expect(r.state.blocks.reduce((a, b) => a + b.size, 0)).toBe(s.total);
  });
  it('the OS block cannot be freed', () => {
    const s = textbookMemory('DYNAMIC');
    expect(free(s, 'OS', 'FIRST').state.blocks[0].owner).toBe('OS');
  });
});
