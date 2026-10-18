import type { SchedAlgo } from '../types';
import { pickNext, shouldPreempt, type SchedCandidate } from './policy';
import { computeMetrics, type ScheduleResult, type LabProcess, type LabSegment } from './metrics';

/**
 * CPU-only discrete-time simulator for the Scheduling Lab (no I/O, no memory, no switch cost).
 * At each instant t: arrivals at t join the ready queue first, then a process whose quantum
 * expired at t rejoins behind them (the usual textbook RR convention).
 */
export function simulate(procs: LabProcess[], algo: SchedAlgo, quantum = 2): ScheduleResult {
  const sorted = [...procs].sort((a, b) => a.arrival - b.arrival || a.pid - b.pid);
  const remaining = new Map(sorted.map((p) => [p.pid, p.burst]));
  const firstStart = new Map<number, number>();
  const completion = new Map<number, number>();
  const byPid = new Map(sorted.map((p) => [p.pid, p]));
  const cand = (pid: number): SchedCandidate => {
    const p = byPid.get(pid)!;
    return { pid, arrivalTime: p.arrival, remaining: remaining.get(pid)!, priority: p.priority };
  };

  const ready: number[] = [];
  const segments: LabSegment[] = [];
  let running: number | null = null;
  let quantumUsed = 0;
  let next = 0;
  let t = 0;
  const q = Math.max(1, quantum);
  const limit = sorted.reduce((s, p) => Math.max(s, p.arrival), 0) + sorted.reduce((s, p) => s + p.burst, 0) + 1;

  while (completion.size < sorted.length && t <= limit) {
    while (next < sorted.length && sorted[next].arrival <= t) ready.push(sorted[next++].pid);

    if (running !== null) {
      const readyC = ready.map(cand);
      if (shouldPreempt(cand(running), readyC, algo, quantumUsed, q)) {
        ready.push(running);
        running = null;
      } else if (algo === 'RR' && quantumUsed >= q) {
        quantumUsed = 0; // nobody waiting: the same process gets a fresh quantum
      }
    }

    if (running === null && ready.length > 0) {
      const idx = pickNext(ready.map(cand), algo);
      running = ready.splice(idx, 1)[0];
      quantumUsed = 0;
      if (!firstStart.has(running)) firstStart.set(running, t);
    }

    const pid = running;
    const last = segments[segments.length - 1];
    if (last && last.pid === pid && last.end === t) last.end = t + 1;
    else segments.push({ pid, start: t, end: t + 1 });

    if (running !== null) {
      remaining.set(running, remaining.get(running)! - 1);
      quantumUsed++;
      if (remaining.get(running) === 0) {
        completion.set(running, t + 1);
        running = null;
      }
    }
    t++;
  }

  return computeMetrics(sorted, segments, firstStart, completion);
}
