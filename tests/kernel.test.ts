import { describe, expect, it } from 'vitest';
import { addProcess, createSim, isFinished, tick } from '@/lib/os/kernel';
import { PRESETS, type PresetId } from '@/lib/os/workload';
import { SCHED_ALGOS, REPL_ALGOS, type SimState } from '@/lib/os/types';

function run(preset: PresetId, patch: Partial<SimState['config']>, maxTicks = 2000) {
  const p = PRESETS[preset];
  let s = createSim(p.specs, { ...p.config, ...patch });
  const history = [s];
  while (!isFinished(s) && s.clock < maxTicks) {
    s = tick(s);
    history.push(s);
  }
  return history;
}

function checkInvariants(s: SimState) {
  const procs = Object.values(s.processes);
  const running = procs.filter((p) => p.state === 'RUNNING');
  expect(running.length).toBeLessThanOrEqual(1);
  if (s.running !== null) expect(s.processes[s.running].state).toBe('RUNNING');
  expect(s.ctxSwitch !== null && s.running !== null).toBe(false);

  // time is conserved
  expect(s.stats.busy + s.stats.idle + s.stats.ctx).toBe(s.clock);

  // frames and page tables agree
  expect(s.frames.length).toBe(s.config.numFrames);
  const seen = new Set<string>();
  s.frames.forEach((f, i) => {
    if (!f) return;
    const key = `${f.pid}:${f.page}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
    const owner = s.processes[f.pid];
    expect(owner.state).not.toBe('TERMINATED');
    expect(f.page).toBeLessThan(owner.numPages);
    expect(owner.pageTable[f.page]).toMatchObject({ valid: true, frame: i });
  });
  for (const p of procs) {
    for (const e of p.pageTable) if (e.valid) expect(s.frames[e.frame!]).toMatchObject({ pid: p.pid, page: e.page });
  }

  // every live process is in exactly one place
  const places = [
    ...s.jobQueue,
    ...s.readyQueue,
    ...s.deviceQueues.DISK.map((j) => j.pid),
    ...s.deviceQueues.PRINTER.map((j) => j.pid),
    ...(s.running !== null ? [s.running] : []),
    ...(s.ctxSwitch ? [s.ctxSwitch.to] : []),
  ];
  expect(new Set(places).size).toBe(places.length);
  expect(places.length).toBe(procs.filter((p) => p.state !== 'TERMINATED').length);
}

describe('kernel invariants', () => {
  for (const preset of Object.keys(PRESETS) as PresetId[]) {
    for (const algo of SCHED_ALGOS) {
      it(`${preset} × ${algo}: invariants hold and everything terminates`, () => {
        const h = run(preset, { algo });
        h.forEach(checkInvariants);
        const last = h[h.length - 1];
        expect(isFinished(last)).toBe(true);
        for (const p of Object.values(last.processes)) {
          expect(p.finishTime).toBeGreaterThan(p.arrivalTime);
          expect(p.programCounter).toBe(p.refs.length);
        }
      });
    }
  }

  for (const replacement of REPL_ALGOS) {
    it(`memory pressure with ${replacement} terminates and faults`, () => {
      const h = run('memory', { replacement });
      h.forEach(checkInvariants);
      const last = h[h.length - 1];
      expect(isFinished(last)).toBe(true);
      expect(Object.values(last.processes).reduce((a, p) => a + p.pageFaults, 0)).toBeGreaterThan(10);
    });
  }

  it('zero context-switch cost still conserves time', () => {
    run('io', { ctxSwitchCost: 0 }).forEach(checkInvariants);
  });

  it('is deterministic: same seed → identical history', () => {
    const a = run('io', { seed: 7 });
    const b = run('io', { seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = run('io', { seed: 8 });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('snapshots are immutable (step back is safe)', () => {
    const s0 = createSim(PRESETS.cpu.specs, PRESETS.cpu.config);
    const before = JSON.stringify(s0);
    tick(tick(s0));
    expect(JSON.stringify(s0)).toBe(before);
  });

  it('admission control: NEW waits while memory is full', () => {
    let s = createSim(PRESETS.memory.specs, { ...PRESETS.memory.config, numFrames: 2 });
    for (let i = 0; i < 6; i++) s = tick(s);
    expect(s.jobQueue.length).toBeGreaterThan(0);
    expect(Object.values(s.processes).some((p) => p.state === 'NEW')).toBe(true);
  });

  it('+ Process adds a process that arrives on the next tick', () => {
    let s = createSim([], {});
    s = addProcess(s);
    s = tick(s);
    expect(Object.keys(s.processes)).toHaveLength(1);
    expect(s.events[0].kind).toBe('create');
  });
});
