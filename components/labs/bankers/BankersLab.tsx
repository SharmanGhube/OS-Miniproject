'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resourceColors } from '@/lib/palette';
import { isSafe, needMatrix, request, SILBERSCHATZ, type BankersInput, type RequestResult } from '@/lib/os/deadlock/bankers';
import { Banner, Button, Field, NumberInput, Panel, Select } from '@/components/ui/ui';
import threeStyles from '@/components/three/three.module.css';
import styles from '../labs.module.css';
import type { Flight } from './BankersScene';

const BankersScene = dynamic(() => import('./BankersScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Opening the bank vault…</div>,
});

const RES = ['A', 'B', 'C', 'D'];
const clone = (x: BankersInput): BankersInput => ({
  available: [...x.available],
  max: x.max.map((r) => [...r]),
  allocation: x.allocation.map((r) => [...r]),
});
const vec = (v: number[]) => `(${v.join(', ')})`;

function resize(input: BankersInput, n: number, m: number): BankersInput {
  const fit = (row: number[] = []) => Array.from({ length: m }, (_, j) => row[j] ?? 0);
  return {
    available: fit(input.available),
    max: Array.from({ length: n }, (_, i) => fit(input.max[i])),
    allocation: Array.from({ length: n }, (_, i) => fit(input.allocation[i])),
  };
}

export default function BankersLab() {
  const [input, setInput] = useState<BankersInput>(() => clone(SILBERSCHATZ));
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [reqPid, setReqPid] = useState(1);
  const [reqVec, setReqVec] = useState<number[]>([1, 0, 2]);
  const [outcome, setOutcome] = useState<(RequestResult & { pid: number; req: number[] }) | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightId = useRef(0);

  const n = input.allocation.length;
  const m = input.available.length;
  const need = useMemo(() => needMatrix(input), [input]);
  const safety = useMemo(() => isSafe(input), [input]);
  const checks = safety.checks;
  const k = Math.min(step, checks.length - 1);
  const ended = k === checks.length - 1;
  const badRows = need.flatMap((row, i) => (row.some((x) => x < 0) ? [i] : []));

  const fly = (f: Omit<Flight, 'id'>, delay = 0) => {
    const id = ++flightId.current;
    setTimeout(() => setFlights((fs) => [...fs, { ...f, id }]), delay);
    setTimeout(() => setFlights((fs) => fs.filter((x) => x.id !== id)), delay + 1600);
  };

  const goto = (next: number) => {
    const target = Math.max(-1, Math.min(checks.length - 1, next));
    if (target === k + 1 && target >= 0 && checks[target].canRun) fly({ from: checks[target].pid, to: 'pool', vec: input.allocation[checks[target].pid] });
    setStep(target);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (k >= checks.length - 1) setPlaying(false);
      else goto(k + 1);
    }, 1100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, k, checks.length]);

  const edit = (next: BankersInput) => {
    setInput(next);
    setStep(-1);
    setPlaying(false);
    setOutcome(null);
  };

  const setCell = (which: 'max' | 'allocation', i: number, j: number, v: number) => {
    const next = clone(input);
    next[which][i][j] = v;
    edit(next);
  };

  const doRequest = () => {
    const r = request(input, reqPid, reqVec);
    setOutcome({ ...r, pid: reqPid, req: [...reqVec] });
    setStep(-1);
    setPlaying(false);
    if (r.status === 'GRANTED') {
      fly({ from: 'pool', to: reqPid, vec: reqVec });
      setTimeout(() => setInput(r.tentative!), 700);
    } else if (r.status === 'DENIED_UNSAFE') {
      fly({ from: 'pool', to: reqPid, vec: reqVec });
      fly({ from: reqPid, to: 'pool', vec: reqVec }, 1000);
    }
  };

  const seqSoFar = checks.slice(0, k + 1).filter((c) => c.canRun).map((c) => c.pid);
  const cur = k >= 0 ? checks[k] : null;

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>Banker&apos;s Algorithm Lab</h1>
          <p>
            The centre pool holds the free resources (Available, then Work). Each pad is a process: solid discs are its Allocation and
            ghost discs are its remaining Need. A process can finish when its Need fits in Work, and then it returns everything it holds.
          </p>
        </div>
      </div>

      <div className={styles.lab}>
        <div className={styles.controls}>
          <Panel title="Safety algorithm">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button onClick={() => (setPlaying(false), setStep(-1))} title="Reset" aria-label="Reset">
                  ⏮
                </Button>
                <Button onClick={() => (setPlaying(false), goto(k - 1))} disabled={k < 0} aria-label="Previous check">
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
                <Button onClick={() => (setPlaying(false), goto(k + 1))} disabled={ended} aria-label="Next check">
                  ›
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(checks.length - 1))} title="Jump to result" aria-label="Jump to result">
                  ⏭
                </Button>
              </div>
              <p className={styles.note}>
                {cur
                  ? cur.canRun
                    ? `Check ${k + 1}: Need(P${cur.pid}) ${vec(cur.need)} ≤ Work ${vec(cur.work)} → P${cur.pid} can finish and releases ${vec(input.allocation[cur.pid])}. Work = ${vec(cur.workAfter!)}.`
                    : `Check ${k + 1}: Need(P${cur.pid}) ${vec(cur.need)} does not fit in Work ${vec(cur.work)} → skip for now.`
                  : `Work starts as Available ${vec(input.available)}. Step through to look for a safe sequence.`}
              </p>
              <div className={styles.row}>
                {seqSoFar.length ? seqSoFar.map((p, i) => <span key={p} className="mono">{`${i ? '→ ' : ''}P${p}`}</span>) : <span className={styles.note}>Safe sequence: —</span>}
              </div>
              {ended &&
                (safety.safe ? (
                  <Banner tone="good">Safe. Sequence ⟨{safety.sequence.map((p) => `P${p}`).join(', ')}⟩</Banner>
                ) : (
                  <Banner tone="bad">
                    Unsafe: {safety.finish.flatMap((f, i) => (f ? [] : [`P${i}`])).join(', ')} can never finish. Deadlock is possible.
                  </Banner>
                ))}
            </div>
          </Panel>

          <Panel title="Resource request">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Field label="Process">
                  <Select
                    value={String(reqPid)}
                    options={Array.from({ length: n }, (_, i) => ({ value: String(i), label: `P${i}` }))}
                    onChange={(v) => setReqPid(Number(v))}
                  />
                </Field>
                {Array.from({ length: m }, (_, j) => (
                  <Field key={j} label={RES[j]}>
                    <NumberInput
                      value={reqVec[j] ?? 0}
                      max={20}
                      width={48}
                      label={`Request ${RES[j]}`}
                      onChange={(v) => setReqVec((r) => Array.from({ length: m }, (_, x) => (x === j ? v : r[x] ?? 0)))}
                    />
                  </Field>
                ))}
              </div>
              <Button variant="primary" onClick={doRequest}>
                Request
              </Button>
              {outcome && (
                <Banner tone={outcome.status === 'GRANTED' ? 'good' : outcome.status === 'DENIED_UNSAFE' ? 'bad' : 'warn'}>
                  {outcome.status === 'GRANTED' &&
                    `Granted: P${outcome.pid} gets ${vec(outcome.req)}. The new state is still safe ⟨${outcome.safety!.sequence.map((p) => `P${p}`).join(', ')}⟩.`}
                  {outcome.status === 'DENIED_UNSAFE' && `Denied: granting ${vec(outcome.req)} to P${outcome.pid} would make the state unsafe, so P${outcome.pid} must wait.`}
                  {outcome.status === 'ERROR_EXCEEDS_NEED' && `Error: P${outcome.pid} asked for more than its remaining need ${vec(need[outcome.pid])}.`}
                  {outcome.status === 'WAIT_UNAVAILABLE' && `P${outcome.pid} must wait: only ${vec(input.available)} is available.`}
                </Banner>
              )}
              <p className={styles.note}>
                Try the textbook requests: P1 asks (1,0,2) → granted. Then P4 asks (3,3,0) → must wait. Then P0 asks (0,2,0) → denied (unsafe).
              </p>
            </div>
          </Panel>

          <Panel title="Size">
            <div className={styles.row}>
              <Field label="Processes">
                <NumberInput value={n} min={2} max={6} onChange={(v) => edit(resize(input, v, m))} />
              </Field>
              <Field label="Resources">
                <NumberInput value={m} min={1} max={4} onChange={(v) => (edit(resize(input, n, v)), setReqVec((r) => Array.from({ length: v }, (_, j) => r[j] ?? 0)))} />
              </Field>
              <Button variant="ghost" onClick={() => (edit(clone(SILBERSCHATZ)), setReqVec([1, 0, 2]), setReqPid(1))}>
                Textbook example
              </Button>
            </div>
          </Panel>
        </div>

        <div className={styles.main}>
          <div className={styles.stage}>
            <BankersScene input={input} safety={safety} step={k} flights={flights} />
          </div>

          {badRows.length > 0 && <Banner tone="warn">Allocation exceeds Max for {badRows.map((i) => `P${i}`).join(', ')}. Need cannot be negative.</Banner>}

          <Panel title="State (edit Allocation, Max and Available)">
            <div className={styles.scroll}>
              <table className={`${styles.table} ${styles.matrix}`}>
                <thead>
                  <tr>
                    <th rowSpan={2}>Process</th>
                    <th colSpan={m}>Allocation</th>
                    <th colSpan={m}>Max</th>
                    <th colSpan={m}>Need = Max − Alloc</th>
                  </tr>
                  <tr>
                    {[0, 1, 2].flatMap((g) =>
                      Array.from({ length: m }, (_, j) => (
                        <th key={`${g}${j}`}>
                          <span className={styles.swatch} style={{ background: resourceColors[j] }} />
                          {RES[j]}
                        </th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: n }, (_, i) => (
                    <tr key={i} className={cur?.pid === i ? styles.rowNow : safety.finish[i] && seqSoFar.includes(i) ? styles.rowOk : undefined}>
                      <td>
                        <b>P{i}</b>
                      </td>
                      {Array.from({ length: m }, (_, j) => (
                        <td key={`a${j}`}>
                          <input type="number" min={0} max={20} value={input.allocation[i][j]} aria-label={`Allocation P${i} ${RES[j]}`} onChange={(e) => setCell('allocation', i, j, Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
                        </td>
                      ))}
                      {Array.from({ length: m }, (_, j) => (
                        <td key={`m${j}`}>
                          <input type="number" min={0} max={20} value={input.max[i][j]} aria-label={`Max P${i} ${RES[j]}`} onChange={(e) => setCell('max', i, j, Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
                        </td>
                      ))}
                      {Array.from({ length: m }, (_, j) => (
                        <td key={`n${j}`} className={need[i][j] < 0 ? styles.cellFault : undefined}>
                          {need[i][j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Available</td>
                    {Array.from({ length: m }, (_, j) => (
                      <td key={j}>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={input.available[j]}
                          aria-label={`Available ${RES[j]}`}
                          onChange={(e) => {
                            const next = clone(input);
                            next.available[j] = Math.max(0, Math.min(20, Number(e.target.value) || 0));
                            edit(next);
                          }}
                        />
                      </td>
                    ))}
                    <td colSpan={2 * m} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <Panel title="Safety trace (Work / Finish)">
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Process</th>
                    <th>Need</th>
                    <th>Work</th>
                    <th>Need ≤ Work?</th>
                    <th>Work after</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.slice(0, k + 1).map((c, i) => (
                    <tr key={i} className={i === k ? styles.rowNow : c.canRun ? styles.rowOk : undefined}>
                      <td>{i + 1}</td>
                      <td>P{c.pid}</td>
                      <td className="mono">{vec(c.need)}</td>
                      <td className="mono">{vec(c.work)}</td>
                      <td className={c.canRun ? styles.cellHit : styles.cellFault}>{c.canRun ? 'yes → finish' : 'no'}</td>
                      <td className="mono">{c.workAfter ? vec(c.workAfter) : '—'}</td>
                    </tr>
                  ))}
                  {k < 0 && (
                    <tr>
                      <td colSpan={6} className={styles.note}>
                        Press ▶ Run or › to start the safety check.
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
