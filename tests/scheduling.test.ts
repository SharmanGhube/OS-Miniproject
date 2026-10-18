import { describe, expect, it } from 'vitest';
import { simulate, type LabProcess } from '@/lib/os/scheduling';

const mk = (rows: [number, number, number?][]): LabProcess[] =>
  rows.map(([arrival, burst, priority = 1], i) => ({ pid: i + 1, name: `P${i + 1}`, arrival, burst, priority }));

const seq = (r: ReturnType<typeof simulate>) => r.segments.map((s) => `${s.pid ?? '-'}:${s.start}-${s.end}`).join(' ');

describe('scheduling (textbook answers)', () => {
  it('FCFS convoy: 24,3,3 → avg WT 17, TAT 27', () => {
    const r = simulate(mk([[0, 24], [0, 3], [0, 3]]), 'FCFS');
    expect(r.rows.map((x) => x.waiting)).toEqual([0, 24, 27]);
    expect(r.avg.waiting).toBe(17);
    expect(r.avg.turnaround).toBe(27);
  });

  it('SJF non-preemptive (Silberschatz) → avg WT 4', () => {
    const r = simulate(mk([[0, 7], [2, 4], [4, 1], [5, 4]]), 'SJF');
    expect(seq(r)).toBe('1:0-7 3:7-8 2:8-12 4:12-16');
    expect(r.avg.waiting).toBe(4);
    expect(r.avg.turnaround).toBe(8);
  });

  it('SRTF → avg WT 3', () => {
    const r = simulate(mk([[0, 7], [2, 4], [4, 1], [5, 4]]), 'SRTF');
    expect(seq(r)).toBe('1:0-2 2:2-4 3:4-5 2:5-7 4:7-11 1:11-16');
    expect(r.rows.map((x) => x.waiting)).toEqual([9, 1, 0, 2]);
    expect(r.avg.waiting).toBe(3);
  });

  it('Round Robin q=2 (arrivals queue before the preempted process)', () => {
    const r = simulate(mk([[0, 5], [1, 3], [2, 1], [3, 2], [4, 3]]), 'RR', 2);
    expect(seq(r)).toBe('1:0-2 2:2-4 3:4-5 1:5-7 4:7-9 5:9-11 2:11-12 1:12-13 5:13-14');
    expect(r.rows.map((x) => x.completion)).toEqual([13, 12, 5, 9, 14]);
    expect(r.avg.turnaround).toBeCloseTo(8.6);
    expect(r.avg.waiting).toBeCloseTo(5.8);
  });

  it('Priority non-preemptive (Silberschatz) → avg WT 8.2', () => {
    const r = simulate(mk([[0, 10, 3], [0, 1, 1], [0, 2, 4], [0, 1, 5], [0, 5, 2]]), 'PRIORITY');
    expect(seq(r)).toBe('2:0-1 5:1-6 1:6-16 3:16-18 4:18-19');
    expect(r.avg.waiting).toBeCloseTo(8.2);
  });

  it('Priority preemptive', () => {
    const r = simulate(mk([[0, 4, 2], [1, 3, 1], [2, 2, 3]]), 'PRIORITY_P');
    expect(seq(r)).toBe('1:0-1 2:1-4 1:4-7 3:7-9');
    expect(r.rows.map((x) => x.waiting)).toEqual([3, 0, 5]);
  });

  it('idle gap before a late arrival is shown and not counted as busy', () => {
    const r = simulate(mk([[2, 3]]), 'FCFS');
    expect(seq(r)).toBe('-:0-2 1:2-5');
    expect(r.cpuUtilization).toBeCloseTo(3 / 5);
    expect(r.rows[0].response).toBe(0);
  });
});
