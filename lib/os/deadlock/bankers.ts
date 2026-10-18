export interface BankersInput {
  available: number[];
  max: number[][];
  allocation: number[][];
}

export interface SafetyCheck {
  pid: number;
  work: number[];
  need: number[];
  canRun: boolean;
  /** Work after the process finishes and releases its allocation (only when canRun). */
  workAfter: number[] | null;
}

export interface SafetyResult {
  safe: boolean;
  sequence: number[];
  checks: SafetyCheck[];
  finish: boolean[];
  /** Work vector after each process in `sequence` finishes. */
  workTrail: number[][];
}

export type RequestStatus = 'GRANTED' | 'DENIED_UNSAFE' | 'ERROR_EXCEEDS_NEED' | 'WAIT_UNAVAILABLE';

export interface RequestResult {
  status: RequestStatus;
  /** State after granting (GRANTED) or the tentative state that was rolled back (DENIED_UNSAFE). */
  tentative: BankersInput | null;
  safety: SafetyResult | null;
}

export function needMatrix(input: BankersInput): number[][] {
  return input.max.map((row, i) => row.map((m, j) => m - input.allocation[i][j]));
}

const leq = (a: number[], b: number[]) => a.every((x, j) => x <= b[j]);
const add = (a: number[], b: number[]) => a.map((x, j) => x + b[j]);
const sub = (a: number[], b: number[]) => a.map((x, j) => x - b[j]);

/** Safety algorithm: repeated passes over P0..Pn-1, recording every check for step-through. */
export function isSafe(input: BankersInput): SafetyResult {
  const n = input.allocation.length;
  const need = needMatrix(input);
  let work = [...input.available];
  const finish = Array<boolean>(n).fill(false);
  const sequence: number[] = [];
  const checks: SafetyCheck[] = [];
  const workTrail: number[][] = [];

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      const canRun = leq(need[i], work);
      const before = [...work];
      if (canRun) {
        work = add(work, input.allocation[i]);
        finish[i] = true;
        sequence.push(i);
        workTrail.push([...work]);
        progressed = true;
      }
      checks.push({ pid: i, work: before, need: need[i], canRun, workAfter: canRun ? [...work] : null });
    }
  }
  return { safe: finish.every(Boolean), sequence, checks, finish, workTrail };
}

/** Resource-request algorithm: validate, pretend to allocate, keep it only if still safe. */
export function request(input: BankersInput, pid: number, req: number[]): RequestResult {
  const need = needMatrix(input)[pid];
  if (!leq(req, need)) return { status: 'ERROR_EXCEEDS_NEED', tentative: null, safety: null };
  if (!leq(req, input.available)) return { status: 'WAIT_UNAVAILABLE', tentative: null, safety: null };
  const tentative: BankersInput = {
    available: sub(input.available, req),
    max: input.max.map((r) => [...r]),
    allocation: input.allocation.map((r, i) => (i === pid ? add(r, req) : [...r])),
  };
  const safety = isSafe(tentative);
  return { status: safety.safe ? 'GRANTED' : 'DENIED_UNSAFE', tentative, safety };
}

/** Silberschatz example (5 processes, resources A=10, B=5, C=7). */
export const SILBERSCHATZ: BankersInput = {
  available: [3, 3, 2],
  max: [
    [7, 5, 3],
    [3, 2, 2],
    [9, 0, 2],
    [2, 2, 2],
    [4, 3, 3],
  ],
  allocation: [
    [0, 1, 0],
    [2, 0, 0],
    [3, 0, 2],
    [2, 1, 1],
    [0, 0, 2],
  ],
};
