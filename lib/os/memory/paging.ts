import { Rng } from '../rng';

/**
 * Locality-of-reference model: with probability `locality` the next reference stays on the
 * current page or a neighbour; otherwise it jumps to a random page.
 */
export function generateRefs(rng: Rng, numPages: number, length: number, locality = 0.8): number[] {
  const refs: number[] = [];
  let page = 0;
  for (let i = 0; i < length; i++) {
    if (i > 0) {
      if (rng.next() < locality) {
        page = Math.min(numPages - 1, Math.max(0, page + rng.int(-1, 1)));
      } else {
        page = rng.int(0, numPages - 1);
      }
    }
    refs.push(page);
  }
  return refs;
}

/** Index of the next use of `page` at or after `from`, or Infinity. */
export function nextUseIn(refs: number[], page: number, from: number): number {
  const n = refs.indexOf(page, from);
  return n === -1 ? Infinity : n - from;
}
