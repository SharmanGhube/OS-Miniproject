'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  RAG_PRESETS,
  abortProcess,
  availableOf,
  conditions,
  cycleEdges,
  detect,
  findCycle,
  preemptResource,
  presetGraph,
  setEdge,
  validate,
  type RAG,
} from '@/lib/os/deadlock/detection';
import { processColors } from '@/lib/palette';
import { Banner, Button, Field, Panel, Select } from '@/components/ui/ui';
import threeStyles from '@/components/three/three.module.css';
import styles from '../labs.module.css';

const RagScene = dynamic(() => import('./RagScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Drawing the graph…</div>,
});

const vec = (v: number[]) => `(${v.join(', ')})`;

export default function DeadlockLab() {
  const [presetId, setPresetId] = useState('fig73');
  const [g, setG] = useState<RAG>(() => presetGraph('fig73'));
  const [undo, setUndo] = useState<RAG[]>([]);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [showCycle, setShowCycle] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const result = useMemo(() => detect(g), [g]);
  const cycle = useMemo(() => cycleEdges(g), [g]);
  const oneCycle = useMemo(() => findCycle(g), [g]);
  const cond = useMemo(() => conditions(g), [g]);
  const errors = validate(g);
  const avail = availableOf(g);
  const checks = result.checks;
  const k = Math.min(step, checks.length - 1);
  const ended = step >= 0 && (checks.length === 0 || k >= checks.length - 1);
  const cur = k >= 0 ? checks[k] : null;
  const name = (i: number) => g.processes[i];
  const nodeName = (id: string) => (id.startsWith('P') ? g.processes[Number(id.slice(1))] : g.resources[Number(id.slice(1))].name);
  const preset = RAG_PRESETS.find((p) => p.id === presetId);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= checks.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, checks.length]);

  const change = (next: RAG, message: string | null = null) => {
    setUndo((u) => [...u, g].slice(-30));
    setG(next);
    setStep(-1);
    setPlaying(false);
    setNote(message);
  };

  const load = (id: string) => {
    setPresetId(id);
    setG(presetGraph(id));
    setUndo([]);
    setStep(-1);
    setPlaying(false);
    setNote(null);
  };

  const deadlocked = result.deadlocked;
  const holdings = deadlocked.flatMap((i) => g.resources.flatMap((r, j) => (g.allocation[i][j] > 0 ? [{ i, j }] : [])));

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>Deadlock Detection Lab</h1>
          <p>
            A resource allocation graph. Blue arcs are <b>requests</b> (process → resource) and dark arcs are <b>assignments</b> (an
            instance dot → process). Edges on a cycle glow coral. The detection algorithm then decides whether the cycle is really a deadlock,
            and you can recover by aborting a process or preempting a resource.
          </p>
        </div>
      </div>

      <div className={styles.lab}>
        <div className={styles.controls}>
          <Panel title="Scenario">
            <div className={styles.stack}>
              <Select value={presetId} options={RAG_PRESETS.map((p) => ({ value: p.id, label: p.label }))} onChange={load} label="Scenario" />
              {preset && <p className={styles.note}>{preset.note}</p>}
              <label className={styles.note} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={showCycle} onChange={(e) => setShowCycle(e.target.checked)} /> Highlight cycle edges
              </label>
            </div>
          </Panel>

          <Panel title="Detection algorithm">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button onClick={() => (setPlaying(false), setStep(-1))} title="Reset" aria-label="Reset">
                  ⏮
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(Math.max(-1, k - 1)))} disabled={k < 0} aria-label="Previous check">
                  ‹
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!playing && ended) setStep(-1);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? '❚❚ Pause' : '▶ Run'}
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(Math.min(checks.length - 1, k + 1)))} disabled={ended} aria-label="Next check">
                  ›
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(Math.max(0, checks.length - 1)))} title="Jump to result" aria-label="Jump to result">
                  ⏭
                </Button>
              </div>
              <p className={styles.note}>
                {cur
                  ? cur.canFinish
                    ? `Request(${name(cur.pid)}) ${vec(cur.request)} ≤ Work ${vec(cur.work)}, so ${name(cur.pid)} can finish and release ${vec(g.allocation[cur.pid])}. Work = ${vec(cur.workAfter!)}.`
                    : `Request(${name(cur.pid)}) ${vec(cur.request)} does not fit in Work ${vec(cur.work)}. Skip for now.`
                  : `Work = Available ${vec(avail)}.${result.initiallyFinished.length ? ` ${result.initiallyFinished.map(name).join(', ')} hold nothing, so they start with Finish = true.` : ''}`}
              </p>
              {ended &&
                (deadlocked.length ? (
                  <Banner tone="bad">Deadlock: {deadlocked.map(name).join(', ')} can never finish.</Banner>
                ) : (
                  <Banner tone="good">No deadlock. Sequence ⟨{result.sequence.map(name).join(', ')}⟩</Banner>
                ))}
            </div>
          </Panel>

          <Panel title="Recovery">
            <div className={styles.stack}>
              {deadlocked.length === 0 && <p className={styles.note}>Nothing to recover: no process is deadlocked.</p>}
              {deadlocked.length > 0 && (
                <>
                  <span className={styles.note}>Abort a process (it releases everything it holds):</span>
                  <div className={styles.row}>
                    {deadlocked.map((i) => (
                      <Button key={i} variant="ghost" onClick={() => change(abortProcess(g, i), `Aborted ${name(i)}: released ${vec(g.allocation[i])}.`)}>
                        <span className={styles.swatch} style={{ background: processColors[i % processColors.length] }} />
                        Abort {name(i)}
                      </Button>
                    ))}
                  </div>
                  <span className={styles.note}>Or preempt one instance (the victim is rolled back and requests it again):</span>
                  <div className={styles.row}>
                    {holdings.map(({ i, j }) => (
                      <Button
                        key={`${i}-${j}`}
                        variant="ghost"
                        onClick={() => change(preemptResource(g, i, j), `Preempted one ${g.resources[j].name} from ${name(i)}, which rolls back and waits for it.`)}
                      >
                        Take {g.resources[j].name} from {name(i)}
                      </Button>
                    ))}
                  </div>
                </>
              )}
              <div className={styles.row}>
                <Button variant="ghost" disabled={!undo.length} onClick={() => (setG(undo[undo.length - 1]), setUndo(undo.slice(0, -1)), setStep(-1), setNote(null))}>
                  ↶ Undo
                </Button>
                <Button variant="ghost" onClick={() => load(presetId)}>
                  Reset scenario
                </Button>
              </div>
              {note && <Banner tone="info">{note}</Banner>}
            </div>
          </Panel>
        </div>

        <div className={styles.main}>
          <div className={styles.stage}>
            <RagScene g={g} result={result} step={step} showCycle={showCycle} cycle={cycle} />
          </div>

          {errors.length > 0 && <Banner tone="warn">{errors.join('; ')}.</Banner>}

          <div className={styles.two}>
            <Panel title="Cycle check">
              <div className={styles.stack}>
                {oneCycle ? (
                  <p style={{ margin: 0 }}>
                    Cycle: <span className="mono">{[...oneCycle, oneCycle[0]].map(nodeName).join(' → ')}</span>
                  </p>
                ) : (
                  <p style={{ margin: 0 }}>No cycle, so no deadlock is possible.</p>
                )}
                <p className={styles.note}>
                  {oneCycle && g.resources.every((r) => r.instances === 1)
                    ? 'Every resource has a single instance, so a cycle means deadlock.'
                    : oneCycle
                      ? 'Some resources have several instances: a cycle is necessary but not sufficient, so run the detection algorithm.'
                      : ''}
                </p>
              </div>
            </Panel>
            <Panel title="Necessary conditions (Coffman)">
              <table className={styles.table}>
                <tbody>
                  {(
                    [
                      ['Mutual exclusion', cond.mutualExclusion, 'resources are non-shareable'],
                      ['Hold and wait', cond.holdAndWait, 'some process holds one resource while requesting another'],
                      ['No preemption', cond.noPreemption, 'resources are released only voluntarily'],
                      ['Circular wait', cond.circularWait, 'there is a cycle in the graph'],
                    ] as [string, boolean, string][]
                  ).map(([label, ok, why]) => (
                    <tr key={label}>
                      <td style={{ whiteSpace: 'normal' }}>
                        <b>{label}</b>
                        <div className={styles.note}>{why}</div>
                      </td>
                      <td className={ok ? styles.cellFault : styles.cellHit}>{ok ? '✓ holds' : '✗ broken'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <Panel title="Allocation and Request (edit to change the graph)">
            <div className={styles.scroll}>
              <table className={`${styles.table} ${styles.matrix}`}>
                <thead>
                  <tr>
                    <th rowSpan={2}>Process</th>
                    <th colSpan={g.resources.length}>Allocation (assignment edges)</th>
                    <th colSpan={g.resources.length}>Request (request edges)</th>
                  </tr>
                  <tr>
                    {[0, 1].flatMap((x) => g.resources.map((r, j) => <th key={`${x}${j}`}>{r.name}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {g.processes.map((p, i) => (
                    <tr key={i} className={cur?.pid === i ? styles.rowNow : undefined}>
                      <td>
                        <span className={styles.swatch} style={{ background: processColors[i % processColors.length] }} />
                        <b>{p}</b>
                        {!g.alive[i] && <span className={styles.note}> (aborted)</span>}
                      </td>
                      {(['allocation', 'request'] as const).flatMap((kind) =>
                        g.resources.map((r, j) => (
                          <td key={`${kind}${j}`}>
                            <input
                              type="number"
                              min={0}
                              max={9}
                              disabled={!g.alive[i]}
                              value={g[kind][i][j]}
                              aria-label={`${kind} ${p} ${r.name}`}
                              onChange={(e) => change(setEdge(g, kind, i, j, Math.min(9, Number(e.target.value) || 0)))}
                            />
                          </td>
                        )),
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Instances / Available</td>
                    {g.resources.map((r, j) => (
                      <td key={j} className="mono">
                        {r.instances} / {avail[j]}
                      </td>
                    ))}
                    <td colSpan={g.resources.length} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <Panel title="Detection trace (Work / Finish)">
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Process</th>
                    <th>Request</th>
                    <th>Work</th>
                    <th>Request ≤ Work?</th>
                    <th>Work after</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.slice(0, k + 1).map((c, i) => (
                    <tr key={i} className={i === k ? styles.rowNow : c.canFinish ? styles.rowOk : undefined}>
                      <td>{i + 1}</td>
                      <td>{name(c.pid)}</td>
                      <td className="mono">{vec(c.request)}</td>
                      <td className="mono">{vec(c.work)}</td>
                      <td className={c.canFinish ? styles.cellHit : styles.cellFault}>{c.canFinish ? 'yes → finish' : 'no'}</td>
                      <td className="mono">{c.workAfter ? vec(c.workAfter) : '—'}</td>
                    </tr>
                  ))}
                  {k < 0 && (
                    <tr>
                      <td colSpan={6} className={styles.note}>
                        Press ▶ Run or › to run the detection algorithm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
