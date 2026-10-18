'use client';

import { palette } from '@/lib/palette';
import type { SimState } from '@/lib/os/types';
import { Stat, fmt } from '@/components/ui/ui';
import { useSim } from '@/store/simStore';
import styles from './computer.module.css';

function PidChips({ pids, s }: { pids: number[]; s: SimState }) {
  const select = useSim((x) => x.select);
  if (!pids.length) return <span className={styles.empty}>empty</span>;
  return (
    <>
      {pids.map((pid) => (
        <button key={pid} className={styles.pid} style={{ background: s.processes[pid].color }} onClick={() => select(pid)}>
          P{pid}
        </button>
      ))}
    </>
  );
}

/** Exact text view of every queue (the 3D board shows the same thing spatially). */
export function QueuesView({ s }: { s: SimState }) {
  const cpu = s.ctxSwitch ? `switching → P${s.ctxSwitch.to}` : s.running !== null ? null : 'idle';
  return (
    <dl className={styles.queues}>
      <dt>Job queue</dt>
      <dd>
        <PidChips pids={s.jobQueue} s={s} />
      </dd>
      <dt>Ready queue</dt>
      <dd>
        <PidChips pids={s.readyQueue} s={s} />
      </dd>
      <dt>CPU</dt>
      <dd>{cpu ? <span className={styles.empty}>{cpu}</span> : <PidChips pids={[s.running!]} s={s} />}</dd>
      <dt>Disk queue</dt>
      <dd>
        <PidChips pids={s.deviceQueues.DISK.map((j) => j.pid)} s={s} />
      </dd>
      <dt>Printer queue</dt>
      <dd>
        <PidChips pids={s.deviceQueues.PRINTER.map((j) => j.pid)} s={s} />
      </dd>
    </dl>
  );
}

export function Metrics({ s }: { s: SimState }) {
  const procs = Object.values(s.processes);
  const done = procs.filter((p) => p.state === 'TERMINATED');
  const avg = (f: (p: (typeof done)[number]) => number) => (done.length ? done.reduce((a, p) => a + f(p), 0) / done.length : 0);
  const faults = procs.reduce((a, p) => a + p.pageFaults, 0);
  const switches = procs.reduce((a, p) => a + p.contextSwitches, 0);
  const t = Math.max(1, s.clock);
  return (
    <div className={styles.metrics}>
      <Stat label="CPU util" value={`${Math.round((s.stats.busy / t) * 100)}%`} />
      <Stat label="Throughput" value={`${fmt(done.length / t, 3)}/t`} />
      <Stat label="Avg TAT" value={fmt(avg((p) => (p.finishTime ?? 0) - p.arrivalTime))} />
      <Stat label="Avg WT" value={fmt(avg((p) => p.waitingTime))} />
      <Stat label="Avg RT" value={fmt(avg((p) => p.responseTime ?? 0))} />
      <Stat label="Page faults" value={faults} tone={faults > s.clock / 3 && s.clock > 10 ? 'bad' : undefined} />
      <Stat label="Ctx switches" value={switches} />
      <Stat label="Busy / idle / ctx" value={`${s.stats.busy}/${s.stats.idle}/${s.stats.ctx}`} />
    </div>
  );
}

const KIND_COLOR: Record<string, string> = {
  create: palette.NEW,
  admit: palette.NEW,
  sched: palette.RUNNING,
  ctx: palette.ctx,
  preempt: palette.READY,
  fault: palette.fault,
  io: palette.WAITING,
  exit: palette.TERMINATED,
};

export function EventLog({ s }: { s: SimState }) {
  const select = useSim((x) => x.select);
  const events = s.events.slice(-120).reverse();
  return (
    <ol className={styles.log} aria-live="polite">
      {events.length === 0 && <li className={styles.empty}>Press ▶ Play or Step to start the clock.</li>}
      {events.map((e, i) => (
        <li key={`${e.t}-${i}-${e.msg}`} onClick={() => e.pid && select(e.pid)}>
          <span className={styles.t}>t{e.t}</span>
          <i style={{ background: KIND_COLOR[e.kind] }} />
          <span>{e.msg}</span>
        </li>
      ))}
    </ol>
  );
}
