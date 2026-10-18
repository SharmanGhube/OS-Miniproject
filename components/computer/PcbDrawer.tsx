'use client';

import { palette } from '@/lib/palette';
import type { SimState } from '@/lib/os/types';
import { Button } from '@/components/ui/ui';
import { useSim } from '@/store/simStore';
import styles from './computer.module.css';

/** Process Control Block inspector for the clicked token. */
export default function PcbDrawer({ s }: { s: SimState }) {
  const pid = useSim((x) => x.selectedPid);
  const select = useSim((x) => x.select);
  const p = pid !== null ? s.processes[pid] : undefined;
  const open = !!p;

  return (
    <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-hidden={!open}>
      {p && (
        <>
          <header className={styles.drawerHead}>
            <span className={styles.swatch} style={{ background: p.color }} />
            <div>
              <h3>
                PCB · P{p.pid} <small>{p.name}</small>
              </h3>
              <span className={styles.stateTag} style={{ background: palette[p.state] }}>
                {p.state}
                {p.waitReason ? ` (${p.waitReason === 'IO' ? 'I/O' : 'page fault'})` : ''}
              </span>
            </div>
            <Button variant="ghost" onClick={() => select(null)} aria-label="Close PCB">
              ✕
            </Button>
          </header>

          <dl className={styles.kv}>
            <dt>PID / PPID</dt>
            <dd>
              {p.pid} / {p.ppid ? `P${p.ppid}` : 'init (0)'}
            </dd>
            <dt>Priority</dt>
            <dd>{p.priority}</dd>
            <dt>Arrival</dt>
            <dd>t{p.arrivalTime}</dd>
            <dt>Program counter</dt>
            <dd className="mono">
              {p.programCounter} / {p.refs.length}
            </dd>
            <dt>Registers</dt>
            <dd className="mono">
              AX={p.registers.AX} BX={p.registers.BX} CX={p.registers.CX} DX={p.registers.DX}
            </dd>
            <dt>Burst</dt>
            <dd>
              #{p.burstIndex + 1} of {p.bursts.length}, {p.remaining} left
            </dd>
          </dl>

          <h4>Bursts</h4>
          <div className={styles.bursts}>
            {p.bursts.map((b, i) => (
              <span
                key={i}
                className={i === p.burstIndex && p.state !== 'TERMINATED' ? styles.burstNow : i < p.burstIndex || p.state === 'TERMINATED' ? styles.burstDone : ''}
                style={{ background: b.type === 'CPU' ? palette.RUNNING : palette.WAITING }}
              >
                {b.type === 'CPU' ? 'CPU' : b.device === 'PRINTER' ? 'PRN' : 'DSK'} {b.duration}
              </span>
            ))}
          </div>

          <h4>Page table</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Page</th>
                <th>Frame</th>
                <th>Valid</th>
              </tr>
            </thead>
            <tbody>
              {p.pageTable.map((e) => (
                <tr key={e.page} className={p.refs[p.programCounter] === e.page && p.state !== 'TERMINATED' ? styles.rowNow : undefined}>
                  <td>{e.page}</td>
                  <td>{e.frame ?? '—'}</td>
                  <td>{e.valid ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>Stats</h4>
          <dl className={styles.kv}>
            <dt>Start / finish</dt>
            <dd>
              {p.startTime ?? '—'} / {p.finishTime ?? '—'}
            </dd>
            <dt>Waiting time</dt>
            <dd>{p.waitingTime}</dd>
            <dt>Response time</dt>
            <dd>{p.responseTime ?? '—'}</dd>
            <dt>Context switches</dt>
            <dd>{p.contextSwitches}</dd>
            <dt>Page faults</dt>
            <dd>{p.pageFaults}</dd>
          </dl>
        </>
      )}
    </aside>
  );
}
