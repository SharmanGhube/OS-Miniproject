import { palette, processColors } from '@/lib/palette';

/** Stable, distinct colour per memory owner: J1, J2… walk the palette; A–D use its far end. */
export function ownerColor(owner: string | null): string {
  if (owner === null) return palette.tileEmpty;
  if (owner === 'OS') return palette.chip;
  const job = /^J(\d+)$/.exec(owner);
  if (job) return processColors[(Number(job[1]) - 1) % processColors.length];
  if (/^[A-Z]$/.test(owner)) return processColors[(owner.charCodeAt(0) - 65 + 6) % processColors.length];
  let h = 0;
  for (const c of owner) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return processColors[h % processColors.length];
}
