export type ProcState = 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED';
export type Device = 'DISK' | 'PRINTER';
export type Burst = { type: 'CPU' | 'IO'; duration: number; device?: Device };
export type SchedAlgo = 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'PRIORITY' | 'PRIORITY_P';
export type ReplAlgo = 'FIFO' | 'LRU' | 'OPT';
export type WaitReason = 'IO' | 'PAGE_FAULT';

export const SCHED_ALGOS: SchedAlgo[] = ['FCFS', 'SJF', 'SRTF', 'RR', 'PRIORITY', 'PRIORITY_P'];
export const REPL_ALGOS: ReplAlgo[] = ['FIFO', 'LRU', 'OPT'];

export const SCHED_LABELS: Record<SchedAlgo, string> = {
  FCFS: 'FCFS',
  SJF: 'SJF',
  SRTF: 'SRTF',
  RR: 'Round Robin',
  PRIORITY: 'Priority',
  PRIORITY_P: 'Priority (preemptive)',
};

export interface PageEntry {
  page: number;
  frame: number | null;
  valid: boolean;
}

export interface PCB {
  pid: number;
  ppid: number | null;
  name: string;
  color: string;
  state: ProcState;
  priority: number;
  arrivalTime: number;
  bursts: Burst[];
  burstIndex: number;
  remaining: number;
  programCounter: number;
  registers: { AX: number; BX: number; CX: number; DX: number };
  pageTable: PageEntry[];
  numPages: number;
  /** Pre-generated memory reference string, one page per CPU unit (indexed by programCounter). */
  refs: number[];
  waitReason: WaitReason | null;
  // stats
  startTime?: number;
  finishTime?: number;
  waitingTime: number;
  responseTime?: number;
  contextSwitches: number;
  pageFaults: number;
}

/** What a workload asks for; the kernel turns it into a PCB when clock == arrivalTime. */
export interface ProcSpec {
  name?: string;
  ppid?: number | null;
  arrivalTime: number;
  priority: number;
  bursts: Burst[];
  numPages: number;
  /** Probability that the next reference stays near the current page (default 0.8). */
  locality?: number;
}

export interface Frame {
  pid: number;
  page: number;
  loadedAt: number;
  lastUsed: number;
}

export interface DeviceJob {
  pid: number;
  reason: WaitReason;
  remaining: number;
  page?: number;
}

export interface SimConfig {
  algo: SchedAlgo;
  quantum: number;
  numFrames: number;
  replacement: ReplAlgo;
  ctxSwitchCost: number;
  pageFaultCost: number;
  seed: number;
}

export type GanttKind = 'RUN' | 'IDLE' | 'CS';
export interface GanttSeg {
  pid: number | null;
  kind: GanttKind;
  start: number;
  end: number;
}

export type EventKind = 'create' | 'admit' | 'sched' | 'ctx' | 'preempt' | 'fault' | 'io' | 'exit';
export interface SimEvent {
  t: number;
  kind: EventKind;
  msg: string;
  pid?: number;
}

export interface Transition {
  pid: number;
  from: ProcState | null;
  to: ProcState;
}

export interface SimState {
  clock: number;
  nextPid: number;
  processes: Record<number, PCB>;
  /** Specs that have not arrived yet, sorted by arrivalTime. */
  incoming: ProcSpec[];
  jobQueue: number[];
  readyQueue: number[];
  deviceQueues: Record<Device, DeviceJob[]>;
  running: number | null;
  /** Process whose context is currently loaded in the CPU registers. */
  lastRan: number | null;
  ctxSwitch: { from: number | null; to: number; remaining: number } | null;
  /** Most recent context switch (kept after it completes so the UI can show it). */
  lastSwitch: { from: number | null; to: number; startedAt: number } | null;
  cpuMode: 'IDLE' | 'USER' | 'CONTEXT_SWITCH';
  quantumUsed: number;
  frames: (Frame | null)[];
  config: SimConfig;
  gantt: GanttSeg[];
  events: SimEvent[];
  stats: { busy: number; idle: number; ctx: number };
  rng: number;
  /** Effects of the last tick, used by the 3D scene and state diagram. */
  lastTransitions: Transition[];
  lastFault: { pid: number; page: number; frame: number; evicted: { pid: number; page: number } | null } | null;
}
