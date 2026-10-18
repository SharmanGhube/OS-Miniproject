import type { Burst, Device, ProcSpec, SimConfig } from './types';
import type { Rng } from './rng';

export type PresetId = 'cpu' | 'io' | 'memory';

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  config: Partial<SimConfig>;
  specs: ProcSpec[];
}

const cpu = (duration: number): Burst => ({ type: 'CPU', duration });
const io = (device: Device, duration: number): Burst => ({ type: 'IO', duration, device });

export const PRESETS: Record<PresetId, Preset> = {
  cpu: {
    id: 'cpu',
    label: 'CPU-bound mix',
    description: 'Long CPU bursts, little I/O. The ready queue stays busy and the scheduling policy dominates.',
    config: { algo: 'RR', quantum: 3, numFrames: 12 },
    specs: [
      { name: 'compiler', ppid: 0, arrivalTime: 0, priority: 2, numPages: 4, bursts: [cpu(8), io('DISK', 2), cpu(6)] },
      { name: 'render', ppid: 1, arrivalTime: 1, priority: 1, numPages: 3, bursts: [cpu(10)] },
      { name: 'zip', ppid: 1, arrivalTime: 2, priority: 3, numPages: 4, bursts: [cpu(5), io('PRINTER', 3), cpu(4)] },
      { name: 'solver', ppid: 2, arrivalTime: 4, priority: 2, numPages: 3, bursts: [cpu(7)] },
    ],
  },
  io: {
    id: 'io',
    label: 'I/O-bound mix',
    description: 'Short CPU bursts between disk and printer I/O. Watch processes cycle READY → RUNNING → WAITING.',
    config: { algo: 'RR', quantum: 2, numFrames: 12 },
    specs: [
      { name: 'shell', ppid: 0, arrivalTime: 0, priority: 2, numPages: 3, bursts: [cpu(2), io('DISK', 4), cpu(2), io('DISK', 3), cpu(1)] },
      { name: 'spooler', ppid: 1, arrivalTime: 1, priority: 1, numPages: 3, bursts: [cpu(1), io('PRINTER', 5), cpu(2), io('DISK', 2), cpu(1)] },
      { name: 'editor', ppid: 1, arrivalTime: 2, priority: 3, numPages: 4, bursts: [cpu(3), io('DISK', 3), cpu(2)] },
      { name: 'backup', ppid: 1, arrivalTime: 3, priority: 2, numPages: 3, bursts: [cpu(2), io('PRINTER', 3), cpu(3), io('DISK', 2), cpu(1)] },
      { name: 'indexer', ppid: 3, arrivalTime: 5, priority: 4, numPages: 3, bursts: [cpu(6), io('DISK', 2), cpu(2)] },
    ],
  },
  memory: {
    id: 'memory',
    label: 'Memory pressure',
    description: 'Six processes with poor locality share six frames. Page faults pile up: this is thrashing.',
    config: { algo: 'RR', quantum: 2, numFrames: 6, replacement: 'LRU' },
    specs: [1, 2, 3, 4, 5, 6].map((i) => ({
      name: `worker-${i}`,
      ppid: i === 1 ? 0 : 1,
      arrivalTime: i - 1,
      priority: 1 + (i % 3),
      numPages: 6,
      locality: 0.4,
      bursts: [cpu(8 + (i % 3) * 2), io('DISK', 2), cpu(4)],
    })),
  },
};

/** Random process for the "+ Process" button (uses the simulation's seeded RNG). */
export function randomSpec(rng: Rng, arrivalTime: number): ProcSpec {
  const n = rng.int(1, 3);
  const bursts: Burst[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) bursts.push(io(rng.next() < 0.6 ? 'DISK' : 'PRINTER', rng.int(2, 4)));
    bursts.push(cpu(rng.int(2, 7)));
  }
  return {
    name: rng.pick(['browser', 'daemon', 'game', 'player', 'cron', 'mailer']),
    ppid: 1,
    arrivalTime,
    priority: rng.int(1, 5),
    numPages: rng.int(2, 5),
    bursts,
  };
}
