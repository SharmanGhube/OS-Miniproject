import { processColors } from '@/lib/palette';
import type { Thread } from '@/lib/os/sync/producerConsumer';

/** Producers take the warm end of the palette, consumers the cool end. */
export function threadColor(t: Thread): string {
  const k = t.kind === 'P' ? t.id : t.id + 4;
  return processColors[k % processColors.length];
}
