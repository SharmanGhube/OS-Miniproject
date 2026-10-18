import type { Device, ProcState, SimState } from '@/lib/os/types';

export type Vec3 = [number, number, number];

/** Board geometry (world units). Board top is y = 0; flow reads left → right. */
export const BOARD = { min: [-9.4, -0.4, -5.3] as Vec3, max: [9.2, 1.2, 5.1] as Vec3 };

export const ZONES = {
  newPad: { center: [-7.45, 0, 0.2] as Vec3, size: [2.4, 3.8] as [number, number] },
  ready: { head: [-2.35, 0, 0.2] as Vec3, step: 0.92, perRow: 4 },
  dock: [-1.25, 0, 0.2] as Vec3,
  cpu: { center: [0.6, 0, 0.2] as Vec3, size: 2.6, height: 0.5 },
  ram: { origin: [3.75, 0, -1.25] as Vec3, cols: 4, cell: 1.1 },
  devices: {
    DISK: { center: [-3.6, 0, -3.9] as Vec3, dir: -1, height: 0.8 },
    PRINTER: { center: [1.6, 0, -3.9] as Vec3, dir: 1, height: 0.8 },
  } satisfies Record<Device, { center: Vec3; dir: number; height: number }>,
  pcbTable: { center: [0.6, 0, 3.65] as Vec3 },
  exitTray: { origin: [3.5, 0, 3.75] as Vec3, cols: 7, step: 0.66, size: [5.0, 1.9] as [number, number] },
};

const PAD_Y = 0.06;

export function cameraView(view: 'overview' | 'cpu' | 'memory', numFrames: number): { min: Vec3; max: Vec3 } {
  if (view === 'cpu') return { min: [-4.4, -0.4, -2.1], max: [3.2, 1.6, 2.6] };
  if (view === 'memory') {
    const { origin, cols, cell } = ZONES.ram;
    const rows = Math.ceil(numFrames / cols);
    return {
      min: [origin[0] - 0.8, -0.2, origin[2] - 1.4],
      max: [origin[0] + (cols - 1) * cell + 0.8, 0.6, origin[2] + (rows - 1) * cell + 0.8],
    };
  }
  return { min: BOARD.min, max: BOARD.max };
}

export interface TokenLayout {
  pid: number;
  pos: Vec3;
  scale: number;
  state: ProcState;
}

export interface DeviceLayout {
  device: Device;
  servingPid: number | null;
  progress: number;
  reason: 'IO' | 'PAGE_FAULT' | null;
  queued: number;
}

export function frameCenter(i: number): Vec3 {
  const { origin, cols, cell } = ZONES.ram;
  return [origin[0] + (i % cols) * cell, 0, origin[2] + Math.floor(i / cols) * cell];
}

function newSlot(i: number): Vec3 {
  const { center } = ZONES.newPad;
  const k = i % 8;
  const c = k % 2;
  const r = Math.floor(k / 2);
  return [center[0] + (c - 0.5) * 0.95, PAD_Y + Math.floor(i / 8) * 0.95, center[2] + (r - 1.5) * 0.9];
}

function readySlot(i: number): Vec3 {
  const { head, step, perRow } = ZONES.ready;
  return [head[0] - (i % perRow) * step, PAD_Y, head[2] + Math.floor(i / perRow) * 0.95];
}

function deviceSlot(dev: Device, i: number): Vec3 {
  const d = ZONES.devices[dev];
  if (i === 0) return [d.center[0], d.height, d.center[2]];
  const k = i - 1;
  return [d.center[0] + d.dir * (1.25 + (k % 5) * 0.92), PAD_Y, d.center[2] + Math.floor(k / 5) * 0.9];
}

function exitSlot(i: number): Vec3 {
  const { origin, cols, step } = ZONES.exitTray;
  return [origin[0] + (i % cols) * step, PAD_Y + Math.floor(i / (cols * 2)) * 0.6, origin[2] + (Math.floor(i / cols) % 2) * 0.62];
}

/**
 * Pure mapping from a kernel snapshot to world positions. Tokens damp toward these targets,
 * so moving between queues (and stepping back in time) animates automatically.
 */
export function layoutComputer(s: SimState): { tokens: TokenLayout[]; devices: DeviceLayout[] } {
  const tokens: TokenLayout[] = [];
  const put = (pid: number, pos: Vec3, scale = 1) => tokens.push({ pid, pos, scale, state: s.processes[pid].state });

  s.jobQueue.forEach((pid, i) => put(pid, newSlot(i)));
  s.readyQueue.forEach((pid, i) => put(pid, readySlot(i)));
  if (s.ctxSwitch) put(s.ctxSwitch.to, [ZONES.dock[0], PAD_Y, ZONES.dock[2]]);
  if (s.running !== null) put(s.running, [ZONES.cpu.center[0], ZONES.cpu.height + 0.06, ZONES.cpu.center[2]]);

  const devices: DeviceLayout[] = (['DISK', 'PRINTER'] as Device[]).map((dev) => {
    const q = s.deviceQueues[dev];
    q.forEach((job, i) => put(job.pid, deviceSlot(dev, i)));
    const head = q[0];
    let progress = 0;
    if (head) {
      const p = s.processes[head.pid];
      const total = head.reason === 'PAGE_FAULT' ? s.config.pageFaultCost : p.bursts[p.burstIndex]?.duration ?? 1;
      progress = total > 0 ? 1 - head.remaining / total : 1;
    }
    return { device: dev, servingPid: head?.pid ?? null, progress, reason: head?.reason ?? null, queued: q.length };
  });

  Object.values(s.processes)
    .filter((p) => p.state === 'TERMINATED')
    .sort((a, b) => (a.finishTime ?? 0) - (b.finishTime ?? 0) || a.pid - b.pid)
    .forEach((p, i) => put(p.pid, exitSlot(i), 0.7));

  return { tokens, devices };
}
