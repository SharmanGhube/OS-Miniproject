import type { SchedAlgo } from '../types';

/**
 * Scheduling policy shared by the kernel and the Scheduling Lab.
 *
 * Conventions (so Lab answers match textbook solutions):
 * - FCFS and RR take the head of the ready queue (queue order = order of becoming ready).
 * - SJF/SRTF pick the smallest remaining CPU burst; PRIORITY picks the smallest priority
 *   number (1 = highest). Ties go to the earliest arrival, then the lowest PID.
 * - SRTF / PRIORITY_P preempt only on a strictly better candidate.
 * - RR preempts when the quantum is used up and someone is waiting.
 */
export interface SchedCandidate {
  pid: number;
  arrivalTime: number;
  remaining: number;
  priority: number;
}

export const isPreemptive = (algo: SchedAlgo) => algo === 'SRTF' || algo === 'RR' || algo === 'PRIORITY_P';

function tieBreak(a: SchedCandidate, b: SchedCandidate): number {
  return a.arrivalTime - b.arrivalTime || a.pid - b.pid;
}

/** Returns the index (into `ready`) of the process to dispatch next. */
export function pickNext(ready: SchedCandidate[], algo: SchedAlgo): number {
  if (ready.length === 0) return -1;
  if (algo === 'FCFS' || algo === 'RR') return 0;
  const key = algo === 'SJF' || algo === 'SRTF' ? (c: SchedCandidate) => c.remaining : (c: SchedCandidate) => c.priority;
  let best = 0;
  for (let i = 1; i < ready.length; i++) {
    const d = key(ready[i]) - key(ready[best]);
    if (d < 0 || (d === 0 && tieBreak(ready[i], ready[best]) < 0)) best = i;
  }
  return best;
}

export function shouldPreempt(
  running: SchedCandidate,
  ready: SchedCandidate[],
  algo: SchedAlgo,
  quantumUsed: number,
  quantum: number,
): boolean {
  if (ready.length === 0) return false;
  switch (algo) {
    case 'RR':
      return quantumUsed >= quantum;
    case 'SRTF':
      return ready.some((c) => c.remaining < running.remaining);
    case 'PRIORITY_P':
      return ready.some((c) => c.priority < running.priority);
    default:
      return false;
  }
}
