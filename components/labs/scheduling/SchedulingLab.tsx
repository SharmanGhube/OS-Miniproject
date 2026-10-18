'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { colorForPid, palette } from '@/lib/palette';
import { SCHED_ALGOS, SCHED_LABELS, type SchedAlgo } from '@/lib/os/types';
import { simulate, type LabProcess } from '@/lib/os/scheduling';
import { Button, Field, NumberInput, Panel, Select, Stat, fmt } from '@/components/ui/ui';
import GanttChart from '@/components/charts/GanttChart';
import BarChart from '@/components/charts/BarChart';
import threeStyles from '@/components/three/three.module.css';
import styles from '../labs.module.css';

const TimelineScene = dynamic(() => import('./TimelineScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Laying out the timeline…</div>,
});

type Row = Omit<LabProcess, 'name'>;
const EXAMPLES: { label: string; algo: SchedAlgo; quantum: number; rows: [number, number, number][] }[] = [
  { label: 'RR textbook (q = 2)', algo: 'RR', quantum: 2, rows: [[0, 5, 1], [1, 3, 1], [2, 1, 1], [3, 2, 1], [4, 3, 1]] },
  { label: 'SJF / SRTF (Silberschatz)', algo: 'SRTF', quantum: 2, rows: [[0, 7, 1], [2, 4, 1], [4, 1, 1], [5, 4, 1]] },
  { label: 'Priority (Silberschatz)', algo: 'PRIORITY', quantum: 2, rows: [[0, 10, 3], [0, 1, 1], [0, 2, 4], [0, 1, 5], [0, 5, 2]] },
  { label: 'FCFS convoy effect', algo: 'FCFS', quantum: 2, rows: [[0, 24, 1], [0, 3, 1], [0, 3, 1]] },
];
const toRows = (r: [number, number, number][]): Row[] => r.map(([arrival, burst, priority], i) => ({ pid: i + 1, arrival, burst, priority }));
const SPEED = 4; // ticks per second while sweeping

export default function SchedulingLab() {
  const [rows, setRows] = useState<Row[]>(() => toRows(EXAMPLES[0].rows));
  const [algo, setAlgo] = useState<SchedAlgo>('RR');
  const [quantum, setQuantum] = useState(2);
  const [playing, setPlaying] = useState(false);

  const procs: LabProcess[] = useMemo(() => rows.map((r) => ({ ...r, name: `P${r.pid}` })), [rows]);
  const result = useMemo(() => simulate(procs, algo, quantum), [procs, algo, quantum]);
  const all = useMemo(() => SCHED_ALGOS.map((a) => simulate(procs, a, quantum)), [procs, quantum]);

  // The sweep time lives in a ref (read every frame by the 3D scene); the 2D cursor follows whole ticks.
  const timeRef = useRef(result.makespan);
  const [tick, setTick] = useState(result.makespan);
  useEffect(() => {
    timeRef.current = result.makespan;
    setTick(result.makespan);
    setPlaying(false);
  }, [result]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      timeRef.current = Math.min(result.makespan, timeRef.current + ((now - last) / 1000) * SPEED);
      last = now;
      setTick(Math.floor(timeRef.current));
      if (timeRef.current >= result.makespan) setPlaying(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, result.makespan]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const sweeping = tick < result.makespan;

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>CPU Scheduling Lab</h1>
          <p>
            Each lane is a process and time runs left to right. The pale strip is time spent in the system and the solid blocks are time on
            the CPU. The front lane is the CPU itself, which is the Gantt chart in 3D.
          </p>
        </div>
      </div>

      <div className={styles.lab}>
        <div className={styles.controls}>
          <Panel title="Algorithm">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Field label="Policy">
                  <Select<SchedAlgo> value={algo} options={SCHED_ALGOS.map((a) => ({ value: a, label: SCHED_LABELS[a] }))} onChange={setAlgo} />
                </Field>
                {algo === 'RR' && (
                  <Field label="Quantum">
                    <NumberInput value={quantum} min={1} max={10} onChange={setQuantum} />
                  </Field>
                )}
              </div>
              <div className={styles.row}>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!playing && timeRef.current >= result.makespan) {
                      timeRef.current = 0;
                      setTick(0);
                    }
                    setPlaying(!playing);
                  }}
                >
                  {playing ? '❚❚ Pause' : '▶ Animate'}
                </Button>
                <Button onClick={() => ((timeRef.current = result.makespan), setTick(result.makespan), setPlaying(false))}>Show all</Button>
              </div>
              <input
                type="range"
                min={0}
                max={result.makespan}
                step={1}
                value={tick}
                aria-label="Time"
                style={{ accentColor: palette.ink }}
                onChange={(e) => {
                  setPlaying(false);
                  timeRef.current = Number(e.target.value);
                  setTick(Number(e.target.value));
                }}
              />
              <p className={styles.note}>
                t = {tick} / {result.makespan}
              </p>
            </div>
          </Panel>

          <Panel
            title="Processes"
            actions={
              <Button
                variant="ghost"
                disabled={rows.length >= 8}
                onClick={() => setRows((rs) => [...rs, { pid: Math.max(0, ...rs.map((r) => r.pid)) + 1, arrival: 0, burst: 3, priority: 1 }])}
              >
                + Add
              </Button>
            }
          >
            <table className={`${styles.table} ${styles.matrix}`}>
              <thead>
                <tr>
                  <th>PID</th>
                  <th>AT</th>
                  <th>BT</th>
                  <th>Pri</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.pid}>
                    <td>
                      <span className={styles.swatch} style={{ background: colorForPid(r.pid) }} />
                      <b>P{r.pid}</b>
                    </td>
                    <td>
                      <input type="number" min={0} max={50} value={r.arrival} aria-label={`Arrival P${r.pid}`} onChange={(e) => update(i, { arrival: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
                    </td>
                    <td>
                      <input type="number" min={1} max={30} value={r.burst} aria-label={`Burst P${r.pid}`} onChange={(e) => update(i, { burst: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} />
                    </td>
                    <td>
                      <input type="number" min={1} max={9} value={r.priority} aria-label={`Priority P${r.pid}`} onChange={(e) => update(i, { priority: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} />
                    </td>
                    <td>
                      <button className={styles.iconBtn} disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`Remove P${r.pid}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.note} style={{ marginTop: 8 }}>
              Lower priority number = higher priority.
            </p>
          </Panel>

          <Panel title="Examples">
            <div className={styles.stack}>
              {EXAMPLES.map((ex) => (
                <Button
                  key={ex.label}
                  variant="ghost"
                  onClick={() => {
                    setRows(toRows(ex.rows));
                    setAlgo(ex.algo);
                    setQuantum(ex.quantum);
                  }}
                >
                  {ex.label}
                </Button>
              ))}
            </div>
          </Panel>
        </div>

        <div className={styles.main}>
          <div className={styles.stage}>
            <TimelineScene result={result} timeRef={timeRef} viewKey={`${rows.length}-${result.makespan}`} />
          </div>

          <Panel title={`Gantt chart · ${SCHED_LABELS[algo]}${algo === 'RR' ? ` (q = ${quantum})` : ''}`}>
            <GanttChart segments={result.segments} colorOf={colorForPid} unit={Math.max(14, Math.min(34, 900 / Math.max(1, result.makespan)))} cursor={sweeping ? tick : undefined} />
          </Panel>

          <div className={styles.two}>
            <Panel title="Per-process results">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>PID</th>
                    <th>AT</th>
                    <th>BT</th>
                    <th>CT</th>
                    <th>TAT</th>
                    <th>WT</th>
                    <th>RT</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.pid}>
                      <td>
                        <span className={styles.swatch} style={{ background: colorForPid(r.pid) }} />P{r.pid}
                      </td>
                      <td>{r.arrival}</td>
                      <td>{r.burst}</td>
                      <td>{r.completion}</td>
                      <td>{r.turnaround}</td>
                      <td>{r.waiting}</td>
                      <td>{r.response}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Average</td>
                    <td>{fmt(result.avg.turnaround)}</td>
                    <td>{fmt(result.avg.waiting)}</td>
                    <td>{fmt(result.avg.response)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className={styles.stats} style={{ marginTop: 12 }}>
                <Stat label="CPU util" value={`${fmt(result.cpuUtilization * 100, 0)}%`} />
                <Stat label="Throughput" value={`${fmt(result.throughput, 3)}/t`} />
                <Stat label="Makespan" value={result.makespan} />
              </div>
            </Panel>

            <Panel title="Compare all algorithms">
              <BarChart
                groups={SCHED_ALGOS.map((a) => (a === 'PRIORITY_P' ? 'Prio-P' : a === 'PRIORITY' ? 'Prio' : a))}
                highlight={SCHED_ALGOS.indexOf(algo)}
                series={[
                  { name: 'Avg waiting', color: palette.READY, values: all.map((r) => r.avg.waiting) },
                  { name: 'Avg turnaround', color: palette.NEW, values: all.map((r) => r.avg.turnaround) },
                  { name: 'Avg response', color: palette.RUNNING, values: all.map((r) => r.avg.response) },
                ]}
                ariaLabel="Average waiting, turnaround and response time for each scheduling algorithm"
              />
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}
