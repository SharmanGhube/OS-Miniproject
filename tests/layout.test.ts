import { describe, expect, it } from 'vitest';
import { createSim, isFinished, tick } from '@/lib/os/kernel';
import { PRESETS } from '@/lib/os/workload';
import { layoutComputer } from '@/components/computer3d/layout';

describe('layoutComputer', () => {
  it('gives every process exactly one token and no two tokens share a spot', () => {
    for (const preset of Object.values(PRESETS)) {
      let s = createSim(preset.specs, preset.config);
      while (!isFinished(s) && s.clock < 2000) {
        s = tick(s);
        const { tokens } = layoutComputer(s);
        expect(tokens.map((t) => t.pid).sort((a, b) => a - b)).toEqual(Object.keys(s.processes).map(Number).sort((a, b) => a - b));
        const keys = tokens.map((t) => t.pos.map((v) => v.toFixed(2)).join(','));
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });
});
