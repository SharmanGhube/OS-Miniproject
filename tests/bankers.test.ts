import { describe, expect, it } from 'vitest';
import { isSafe, needMatrix, request, SILBERSCHATZ, type BankersInput } from '@/lib/os/deadlock/bankers';

/** A sequence is valid if each process's need fits the work available at its turn. */
function validSequence(input: BankersInput, seq: number[]): boolean {
  const need = needMatrix(input);
  let work = [...input.available];
  for (const i of seq) {
    if (!need[i].every((x, j) => x <= work[j])) return false;
    work = work.map((w, j) => w + input.allocation[i][j]);
  }
  return seq.length === input.allocation.length;
}

describe("Banker's algorithm (Silberschatz)", () => {
  it('need = max − allocation', () => {
    expect(needMatrix(SILBERSCHATZ)).toEqual([
      [7, 4, 3],
      [1, 2, 2],
      [6, 0, 0],
      [0, 1, 1],
      [4, 3, 1],
    ]);
  });

  it('initial state is safe with sequence P1, P3, P4, P0, P2', () => {
    const r = isSafe(SILBERSCHATZ);
    expect(r.safe).toBe(true);
    expect(r.sequence).toEqual([1, 3, 4, 0, 2]);
    expect(validSequence(SILBERSCHATZ, r.sequence)).toBe(true);
    expect(r.workTrail[r.workTrail.length - 1]).toEqual([10, 5, 7]);
  });

  it('P1 requests (1,0,2) → granted', () => {
    const r = request(SILBERSCHATZ, 1, [1, 0, 2]);
    expect(r.status).toBe('GRANTED');
    expect(r.tentative!.available).toEqual([2, 3, 0]);
    expect(validSequence(r.tentative!, r.safety!.sequence)).toBe(true);
  });

  it('P4 requests (3,3,0) → must wait (not available)', () => {
    const granted = request(SILBERSCHATZ, 1, [1, 0, 2]).tentative!;
    expect(request(granted, 4, [3, 3, 0]).status).toBe('WAIT_UNAVAILABLE');
  });

  it('P0 requests (0,2,0) after P1 → denied, unsafe', () => {
    const granted = request(SILBERSCHATZ, 1, [1, 0, 2]).tentative!;
    const r = request(granted, 0, [0, 2, 0]);
    expect(r.status).toBe('DENIED_UNSAFE');
    expect(r.safety!.safe).toBe(false);
  });

  it('request above the declared need is an error', () => {
    expect(request(SILBERSCHATZ, 3, [1, 0, 0]).status).toBe('ERROR_EXCEEDS_NEED');
  });
});
