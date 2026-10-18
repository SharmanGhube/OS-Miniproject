'use client';

import { useEffect } from 'react';
import { useSim } from '@/store/simStore';

/** Drives the simulation clock from a DOM interval, so playback works without WebGL. */
export function usePlayback() {
  const playing = useSim((s) => s.playing);
  const speed = useSim((s) => s.speed);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => useSim.getState().stepForward(), 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);
}
