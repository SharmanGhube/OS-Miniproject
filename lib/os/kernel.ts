import { produce, type Draft } from 'immer';
import { colorForPid } from '../palette';
import { Rng } from './rng';
import { generateRefs, nextUseIn } from './memory/paging';
import { chooseVictim } from './memory/replacement';
import { pickNext, shouldPreempt, type SchedCandidate } from './scheduling/policy';
import type { Device, DeviceJob, EventKind, Frame, PCB, ProcSpec, ProcState, SimConfig, SimState } from './types';
import { randomSpec } from './workload';

export const DEFAULT_CONFIG: SimConfig = {
  algo: 'RR',
  quantum: 2,
  numFrames: 12,
  replacement: 'LRU',
  ctxSwitchCost: 1,
  pageFaultCost: 2,
  seed: 42,
};

const DEVICES: Device[] = ['DISK', 'PRINTER'];
const MAX_EVENTS = 300;

type S = Draft<SimState>;
type P = Draft<PCB>;

const sortSpecs = (specs: ProcSpec[]) => [...specs].sort((a, b) => a.arrivalTime - b.arrivalTime);

export function createSim(specs: ProcSpec[], config: Partial<SimConfig> = {}): SimState {
  const cfg: SimConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    clock: 0,
    nextPid: 1,
    processes: {},
    incoming: sortSpecs(specs),
    jobQueue: [],
    readyQueue: [],
    deviceQueues: { DISK: [], PRINTER: [] },
    running: null,
    lastRan: null,
    ctxSwitch: null,
    lastSwitch: null,
    cpuMode: 'IDLE',
    quantumUsed: 0,
    frames: Array.from({ length: cfg.numFrames }, () => null),
    config: cfg,
    gantt: [],
    events: [],
    stats: { busy: 0, idle: 0, ctx: 0 },
    rng: cfg.seed >>> 0,
    lastTransitions: [],
    lastFault: null,
  };
}

export function isFinished(s: SimState): boolean {
  return s.incoming.length === 0 && Object.values(s.processes).every((p) => p.state === 'TERMINATED');
}

/** True while a context switch is in progress or finished during the last tick. */
export function switchVisible(s: SimState): boolean {
  if (s.ctxSwitch) return true;
  const last = s.gantt[s.gantt.length - 1];
  return !!last && last.kind === 'CS' && last.end === s.clock;
}

/**
 * One clock tick, returning a new immutable snapshot. Order within the tick [t, t+1):
 * arrivals → long-term scheduler → short-term scheduler → waiting accounting →
 * device tick → CPU tick → I/O interrupts → preemption check.
 */
export function tick(state: SimState): SimState {
  return produce(state, (s) => {
    s.lastTransitions = [];
    s.lastFault = null;

    while (s.incoming.length && s.incoming[0].arrivalTime <= s.clock) spawn(s, s.incoming.shift()!);
    admit(s);
    schedule(s);

    for (const pid of s.readyQueue) s.processes[pid].waitingTime++;
    if (s.ctxSwitch) s.processes[s.ctxSwitch.to].waitingTime++;

    const completed = deviceTick(s);
    cpuTick(s);
    for (const [dev, job] of completed) completeIo(s, dev, job);
    preemptCheck(s);

    s.clock++;
  });
}

export function setAlgorithm(state: SimState, patch: Partial<Pick<SimConfig, 'algo' | 'quantum' | 'replacement' | 'ctxSwitchCost'>>): SimState {
  return produce(state, (s) => {
    Object.assign(s.config, patch);
    if (patch.algo) log(s, 'sched', `Scheduler switched to ${patch.algo}`);
    if (patch.replacement) log(s, 'fault', `Page replacement switched to ${patch.replacement}`);
  });
}

export function addProcess(state: SimState, spec?: Omit<ProcSpec, 'arrivalTime'>): SimState {
  return produce(state, (s) => {
    const rng = new Rng(s.rng);
    const full: ProcSpec = spec ? { ...spec, arrivalTime: s.clock } : randomSpec(rng, s.clock);
    s.rng = rng.state;
    s.incoming.push(full);
    s.incoming.sort((a, b) => a.arrivalTime - b.arrivalTime);
  });
}

// ---------------------------------------------------------------- helpers

function log(s: S, kind: EventKind, msg: string, pid?: number) {
  s.events.push({ t: s.clock, kind, msg, pid });
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

function setState(s: S, p: P, to: ProcState) {
  s.lastTransitions.push({ pid: p.pid, from: p.state, to });
  p.state = to;
}

const cand = (p: P | PCB): SchedCandidate => ({
  pid: p.pid,
  arrivalTime: p.arrivalTime,
  remaining: p.remaining,
  priority: p.priority,
});

function gantt(s: S, pid: number | null, kind: 'RUN' | 'IDLE' | 'CS') {
  const last = s.gantt[s.gantt.length - 1];
  if (last && last.pid === pid && last.kind === kind && last.end === s.clock) last.end++;
  else s.gantt.push({ pid, kind, start: s.clock, end: s.clock + 1 });
}

function spawn(s: S, spec: ProcSpec) {
  const pid = s.nextPid++;
  let bursts = spec.bursts.filter((b) => b.duration > 0).map((b) => ({ ...b }));
  if (bursts.length === 0 || bursts[0].type !== 'CPU') bursts = [{ type: 'CPU', duration: 1 }, ...bursts];
  const totalCpu = bursts.filter((b) => b.type === 'CPU').reduce((a, b) => a + b.duration, 0);
  const numPages = Math.max(1, spec.numPages);
  const rng = new Rng(s.rng);
  const refs = generateRefs(rng, numPages, totalCpu, spec.locality ?? 0.8);
  s.rng = rng.state;

  const ppid = spec.ppid ?? 0;
  s.processes[pid] = {
    pid,
    ppid,
    name: spec.name ?? `P${pid}`,
    color: colorForPid(pid),
    state: 'NEW',
    priority: spec.priority,
    arrivalTime: s.clock,
    bursts,
    burstIndex: 0,
    remaining: bursts[0].duration,
    programCounter: 0,
    registers: { AX: 0, BX: 0, CX: 0, DX: 0 },
    pageTable: Array.from({ length: numPages }, (_, page) => ({ page, frame: null, valid: false })),
    numPages,
    refs,
    waitReason: null,
    waitingTime: 0,
    contextSwitches: 0,
    pageFaults: 0,
  };
  s.lastTransitions.push({ pid, from: null, to: 'NEW' });
  s.jobQueue.push(pid);
  log(s, 'create', `P${pid} created (fork from ${ppid ? `P${ppid}` : 'init'})`, pid);
}

function loadPage(s: S, p: P, page: number, frame: number) {
  s.frames[frame] = { pid: p.pid, page, loadedAt: s.clock, lastUsed: s.clock };
  p.pageTable[page].frame = frame;
  p.pageTable[page].valid = true;
}

function evict(s: S, frame: number) {
  const f = s.frames[frame];
  if (!f) return;
  const entry = s.processes[f.pid].pageTable[f.page];
  entry.frame = null;
  entry.valid = false;
  s.frames[frame] = null;
}

/** Long-term scheduler: admit NEW processes (FIFO) while a free frame exists for their first page. */
function admit(s: S) {
  while (s.jobQueue.length) {
    const free = s.frames.findIndex((f) => f === null);
    if (free === -1) return;
    const p = s.processes[s.jobQueue.shift()!];
    loadPage(s, p, p.refs[0], free);
    setState(s, p, 'READY');
    s.readyQueue.push(p.pid);
    log(s, 'admit', `Long-term scheduler admitted P${p.pid} (page ${p.refs[0]} → frame ${free})`, p.pid);
  }
}

/** Short-term scheduler: pick from the ready queue when the CPU is free. */
function schedule(s: S) {
  if (s.running !== null || s.ctxSwitch) return;
  if (s.readyQueue.length === 0) {
    s.cpuMode = 'IDLE';
    return;
  }
  const idx = pickNext(s.readyQueue.map((pid) => cand(s.processes[pid])), s.config.algo);
  const pid = s.readyQueue.splice(idx, 1)[0];
  log(s, 'sched', `${s.config.algo} scheduler picked P${pid}`, pid);

  const needSwitch = s.lastRan !== pid;
  if (needSwitch && s.config.ctxSwitchCost > 0) {
    const prev = s.lastRan !== null ? s.processes[s.lastRan] : undefined;
    const from = prev && prev.state !== 'TERMINATED' ? prev.pid : null;
    s.ctxSwitch = { from, to: pid, remaining: s.config.ctxSwitchCost };
    s.lastSwitch = { from, to: pid, startedAt: s.clock };
    s.cpuMode = 'CONTEXT_SWITCH';
    log(s, 'ctx', from !== null ? `Context switch: saving PCB of P${from} → loading PCB of P${pid}` : `Dispatcher: loading PCB of P${pid}`, pid);
  } else {
    if (needSwitch) s.processes[pid].contextSwitches++;
    dispatch(s, pid);
  }
}

function dispatch(s: S, pid: number) {
  setState(s, s.processes[pid], 'RUNNING');
  s.running = pid;
  s.lastRan = pid;
  s.quantumUsed = 0;
  s.cpuMode = 'USER';
}

function deviceTick(s: S): [Device, DeviceJob][] {
  const done: [Device, DeviceJob][] = [];
  for (const dev of DEVICES) {
    const q = s.deviceQueues[dev];
    if (!q.length) continue;
    const job = q[0];
    job.remaining--;
    if (job.reason === 'IO') s.processes[job.pid].remaining = Math.max(0, job.remaining);
    if (job.remaining <= 0) {
      q.shift();
      done.push([dev, { ...job }]);
    }
  }
  return done;
}

function cpuTick(s: S) {
  if (s.ctxSwitch) {
    s.stats.ctx++;
    gantt(s, null, 'CS');
    s.ctxSwitch.remaining--;
    if (s.ctxSwitch.remaining <= 0) {
      const to = s.ctxSwitch.to;
      s.ctxSwitch = null;
      s.processes[to].contextSwitches++;
      dispatch(s, to);
    }
    return;
  }
  if (s.running === null) {
    s.stats.idle++;
    s.cpuMode = 'IDLE';
    gantt(s, null, 'IDLE');
    return;
  }

  const p = s.processes[s.running];
  s.cpuMode = 'USER';
  s.stats.busy++;
  gantt(s, p.pid, 'RUN');
  if (p.startTime === undefined) {
    p.startTime = s.clock;
    p.responseTime = s.clock - p.arrivalTime;
  }

  // Execute one unit: advance PC, touch registers, issue the memory reference.
  const page = p.refs[Math.min(p.programCounter, p.refs.length - 1)];
  p.programCounter++;
  p.remaining--;
  s.quantumUsed++;
  p.registers.AX = (p.registers.AX + 3 * page + 1) % 256;
  p.registers.BX = (p.registers.BX + p.registers.AX) % 256;
  p.registers.CX = p.programCounter % 256;
  p.registers.DX = page;

  const entry = p.pageTable[page];
  if (entry.valid && entry.frame !== null) {
    s.frames[entry.frame]!.lastUsed = s.clock;
  } else {
    pageFault(s, p, page);
    return;
  }

  if (p.remaining <= 0) {
    s.running = null;
    s.cpuMode = 'IDLE';
    nextBurst(s, p);
  }
}

function pageFault(s: S, p: P, page: number) {
  p.pageFaults++;
  let frame = s.frames.findIndex((f) => f === null);
  let evicted: { pid: number; page: number } | null = null;
  if (frame === -1) {
    const frames = s.frames as Frame[];
    frame = chooseVictim(frames, s.config.replacement, (i) => {
      const owner = s.processes[frames[i].pid];
      return nextUseIn(owner.refs, frames[i].page, owner.programCounter);
    });
    evicted = { pid: frames[frame].pid, page: frames[frame].page };
    evict(s, frame);
  }
  loadPage(s, p, page, frame);
  s.lastFault = { pid: p.pid, page, frame, evicted };

  s.running = null;
  s.quantumUsed = 0;
  s.cpuMode = 'IDLE';
  p.waitReason = 'PAGE_FAULT';
  setState(s, p, 'WAITING');
  s.deviceQueues.DISK.push({ pid: p.pid, reason: 'PAGE_FAULT', remaining: s.config.pageFaultCost, page });
  log(
    s,
    'fault',
    `Page fault: P${p.pid} page ${page} → frame ${frame}${evicted ? ` (evicted P${evicted.pid}:${evicted.page})` : ''}`,
    p.pid,
  );
}

/** Current burst finished: start the next one, or terminate. */
function nextBurst(s: S, p: P) {
  const idx = p.burstIndex + 1;
  if (idx >= p.bursts.length) {
    terminate(s, p);
    return;
  }
  const b = p.bursts[idx];
  p.burstIndex = idx;
  p.remaining = b.duration;
  if (b.type === 'IO') {
    const dev = b.device ?? 'DISK';
    p.waitReason = 'IO';
    setState(s, p, 'WAITING');
    s.deviceQueues[dev].push({ pid: p.pid, reason: 'IO', remaining: b.duration });
    log(s, 'io', `P${p.pid} requests ${dev} I/O (${b.duration} ticks)`, p.pid);
  } else {
    setState(s, p, 'READY');
    s.readyQueue.push(p.pid);
  }
}

function completeIo(s: S, dev: Device, job: DeviceJob) {
  const p = s.processes[job.pid];
  p.waitReason = null;
  if (job.reason === 'PAGE_FAULT') {
    log(s, 'io', `Disk interrupt: page ${job.page} of P${p.pid} loaded`, p.pid);
    if (p.remaining <= 0) nextBurst(s, p);
    else {
      setState(s, p, 'READY');
      s.readyQueue.push(p.pid);
    }
  } else {
    log(s, 'io', `${dev} interrupt: P${p.pid} I/O complete`, p.pid);
    nextBurst(s, p);
  }
}

function terminate(s: S, p: P) {
  s.frames.forEach((f, i) => {
    if (f && f.pid === p.pid) evict(s, i);
  });
  setState(s, p, 'TERMINATED');
  p.finishTime = s.clock + 1;
  if (s.lastRan === p.pid) s.lastRan = null;
  log(s, 'exit', `P${p.pid} terminated, frames freed`, p.pid);
}

function preemptCheck(s: S) {
  if (s.running === null) return;
  const p = s.processes[s.running];
  const { algo, quantum } = s.config;
  if (shouldPreempt(cand(p), s.readyQueue.map((pid) => cand(s.processes[pid])), algo, s.quantumUsed, quantum)) {
    s.running = null;
    s.cpuMode = 'IDLE';
    setState(s, p, 'READY');
    s.readyQueue.push(p.pid);
    const why = algo === 'RR' ? 'quantum expired' : algo === 'SRTF' ? 'shorter job ready' : 'higher priority ready';
    log(s, 'preempt', `P${p.pid} preempted (${why})`, p.pid);
  } else if (algo === 'RR' && s.quantumUsed >= quantum) {
    s.quantumUsed = 0;
  }
}
