'use client';

import { create } from 'zustand';
import { addProcess, createSim, isFinished, setAlgorithm, tick } from '@/lib/os/kernel';
import { PRESETS, type PresetId } from '@/lib/os/workload';
import type { SimConfig, SimState } from '@/lib/os/types';

export type CameraViewId = 'overview' | 'cpu' | 'memory';

const MAX_HISTORY = 1000;

interface SimStore {
  presetId: PresetId;
  overrides: Partial<SimConfig>;
  history: SimState[];
  cursor: number;
  playing: boolean;
  speed: number;
  selectedPid: number | null;
  cameraView: CameraViewId;

  load: (id: PresetId, overrides?: Partial<SimConfig>) => void;
  reset: () => void;
  stepForward: () => void;
  stepBack: () => void;
  seek: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  /** Live-tunable settings apply to the current snapshot and drop any "future" history. */
  setLive: (patch: Partial<Pick<SimConfig, 'algo' | 'quantum' | 'replacement' | 'ctxSwitchCost'>>) => void;
  addProcess: () => void;
  select: (pid: number | null) => void;
  setCameraView: (v: CameraViewId) => void;
}

function fresh(id: PresetId, overrides: Partial<SimConfig>): SimState {
  const p = PRESETS[id];
  return createSim(p.specs, { ...p.config, ...overrides });
}

export const useSim = create<SimStore>((set, get) => {
  const replaceCurrent = (next: SimState) => {
    const { history, cursor } = get();
    set({ history: [...history.slice(0, cursor), next], cursor });
  };

  return {
    presetId: 'io',
    overrides: {},
    history: [fresh('io', {})],
    cursor: 0,
    playing: false,
    speed: 1.5,
    selectedPid: null,
    cameraView: 'overview',

    load: (id, overrides = {}) =>
      set({ presetId: id, overrides, history: [fresh(id, overrides)], cursor: 0, playing: false, selectedPid: null }),

    reset: () => {
      const { presetId, overrides } = get();
      get().load(presetId, overrides);
    },

    stepForward: () => {
      const { history, cursor } = get();
      if (cursor < history.length - 1) {
        set({ cursor: cursor + 1 });
        return;
      }
      const cur = history[cursor];
      if (isFinished(cur)) {
        set({ playing: false });
        return;
      }
      let next = [...history, tick(cur)];
      if (next.length > MAX_HISTORY) next = next.slice(next.length - MAX_HISTORY);
      set({ history: next, cursor: next.length - 1 });
    },

    stepBack: () => set((s) => ({ cursor: Math.max(0, s.cursor - 1), playing: false })),
    seek: (i) => set((s) => ({ cursor: Math.max(0, Math.min(s.history.length - 1, i)) })),
    setPlaying: (playing) => set({ playing }),
    setSpeed: (speed) => set({ speed }),

    setLive: (patch) => {
      const { history, cursor, overrides } = get();
      set({ overrides: { ...overrides, ...patch } });
      replaceCurrent(setAlgorithm(history[cursor], patch));
    },

    addProcess: () => {
      const { history, cursor } = get();
      replaceCurrent(addProcess(history[cursor]));
    },

    select: (selectedPid) => set({ selectedPid }),
    setCameraView: (cameraView) => set({ cameraView }),
  };
});

export const useCurrent = () => useSim((s) => s.history[s.cursor]);
