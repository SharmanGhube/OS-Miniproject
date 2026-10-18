'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { palette } from '@/lib/palette';
import { REPL_ALGOS, type ReplAlgo } from '@/lib/os/types';
import { parseRefString, runReplacement, type ReplacementResult } from '@/lib/os/memory/replacement';
import { Banner, Button, Field, NumberInput, Panel, Select, Stat, fmt } from '@/components/ui/ui';
import LineChart from '@/components/charts/LineChart';
import threeStyles from '@/components/three/three.module.css';
import styles from '../labs.module.css';
import type { GridSpec } from './FrameGridScene';

const FrameGridScene = dynamic(() => import('./FrameGridScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Stacking frames…</div>,
});

const TEXTBOOK = '7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1';
const BELADY = '1 2 3 4 1 2 5 1 2 3 4 5';
type Mode = 'explore' | 'compare' | 'belady';

const ALGO_COLOR: Record<ReplAlgo, string> = { FIFO: '#8DB6E0', LRU: '#F4A6A6', OPT: '#8FCFAE' };
const WHY: Record<ReplAlgo, string> = {
  FIFO: 'oldest loaded page',
  LRU: 'least recently used page',
  OPT: 'page used farthest in the future',
};

function TextbookTable({ result, numFrames, step }: { result: ReplacementResult; numFrames: number; step: number }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Ref</th>
            {result.steps.map((s, i) => (
              <th key={i} className={i === step ? styles.colNow : undefined}>
                {s.ref}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: numFrames }, (_, k) => (
            <tr key={k}>
              <td>Frame {k}</td>
              {result.steps.map((s, i) => (
                <td key={i} className={`${i === step ? styles.colNow : ''} ${s.insertedAt === k ? styles.cellNew : ''}`}>
                  {i <= step ? s.frames[k] ?? '' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Fault?</td>
            {result.steps.map((s, i) => (
              <td key={i} className={`${i === step ? styles.colNow : ''} ${s.hit ? styles.cellHit : styles.cellFault}`}>
                {i <= step ? (s.hit ? '✓' : 'F') : ''}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function PageReplacementLab() {
  const [mode, setMode] = useState<Mode>('explore');
  const [refText, setRefText] = useState(TEXTBOOK);
  const [frames, setFrames] = useState(3);
  const [algo, setAlgo] = useState<ReplAlgo>('FIFO');
  const [step, setStep] = useState(Infinity);
  const [playing, setPlaying] = useState(false);

  const refs = useMemo(() => parseRefString(mode === 'belady' ? BELADY : refText), [mode, refText]);
  const grids: GridSpec[] = useMemo(() => {
    if (mode === 'belady')
      return [3, 4].map((f) => ({ label: `FIFO · ${f} frames`, numFrames: f, result: runReplacement(refs, f, 'FIFO') }));
    if (mode === 'compare') return REPL_ALGOS.map((a) => ({ label: `${a} · ${frames} frames`, numFrames: frames, result: runReplacement(refs, frames, a) }));
    return [{ label: `${algo} · ${frames} frames`, numFrames: frames, result: runReplacement(refs, frames, algo) }];
  }, [mode, refs, frames, algo]);

  const n = refs.length;
  const cur = Math.min(step, n - 1);
  const primary = grids[0];

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((s) => {
        const next = Math.min(s, n - 1) + 1;
        if (next >= n - 1) setPlaying(false);
        return Math.min(next, n - 1);
      });
    }, 750);
    return () => clearInterval(id);
  }, [playing, n]);

  const sweep = useMemo(() => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    const series = REPL_ALGOS.map((a) => ({ name: a, color: ALGO_COLOR[a], values: xs.map((f) => runReplacement(refs, f, a).faults) }));
    const marks = series[0].values.flatMap((v, i) => (i > 0 && v > series[0].values[i - 1] ? [{ series: 0, index: i, note: 'Belady!' }] : []));
    return { xs, series, marks };
  }, [refs]);

  const s = cur >= 0 ? primary.result.steps[cur] : null;
  const explain = !s
    ? 'Press Play or Next to feed the reference string one page at a time.'
    : s.hit
      ? `Reference ${s.ref}: already in a frame → hit.`
      : s.evicted === null
        ? `Reference ${s.ref}: page fault, loaded into a free frame (f${s.insertedAt}).`
        : `Reference ${s.ref}: page fault. ${mode === 'explore' ? algo : 'FIFO'} evicts ${s.evicted} (the ${WHY[mode === 'explore' ? algo : 'FIFO']}) from f${s.insertedAt}.`;

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>Page Replacement Lab</h1>
          <p>
            Each column is one memory reference and each row is a physical frame. New pages drop into their frame on a fault (F). A page already
            resident lights up as a hit (H).
          </p>
        </div>
      </div>

      <div className={styles.lab}>
        <div className={styles.controls}>
          <Panel title="Mode">
            <div className={styles.tabs}>
              {(
                [
                  ['explore', 'Explore'],
                  ['compare', 'Compare all'],
                  ['belady', "Belady's anomaly"],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  className={mode === m ? styles.on : undefined}
                  onClick={() => {
                    setMode(m);
                    setStep(Infinity);
                    setPlaying(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Input">
            <div className={styles.stack}>
              {mode === 'belady' ? (
                <p className={styles.note}>
                  Reference string <code>{BELADY}</code> with FIFO. Adding a fourth frame <b>increases</b> the faults from 9 to 10.
                </p>
              ) : (
                <>
                  <Field label="Reference string">
                    <input className={styles.textInput} value={refText} onChange={(e) => (setRefText(e.target.value), setStep(Infinity))} />
                  </Field>
                  <div className={styles.row}>
                    <Field label="Frames">
                      <NumberInput value={frames} min={1} max={7} onChange={(f) => (setFrames(f), setStep(Infinity))} />
                    </Field>
                    {mode === 'explore' && (
                      <Field label="Algorithm">
                        <Select<ReplAlgo> value={algo} options={REPL_ALGOS.map((a) => ({ value: a, label: a }))} onChange={(a) => (setAlgo(a), setStep(Infinity))} />
                      </Field>
                    )}
                  </div>
                  <div className={styles.row}>
                    <Button variant="ghost" onClick={() => (setRefText(TEXTBOOK), setStep(Infinity))}>
                      Textbook string
                    </Button>
                    <Button variant="ghost" onClick={() => (setRefText(BELADY), setStep(Infinity))}>
                      Belady string
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Panel>

          <Panel title="Step through">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button onClick={() => (setPlaying(false), setStep(-1))} title="Reset" aria-label="Reset">
                  ⏮
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(Math.max(-1, cur - 1)))} disabled={cur < 0} title="Previous reference" aria-label="Previous reference">
                  ‹
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!playing && cur >= n - 1) setStep(-1);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? '❚❚ Pause' : '▶ Play'}
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(Math.min(n - 1, cur + 1)))} disabled={cur >= n - 1} title="Next reference" aria-label="Next reference">
                  ›
                </Button>
                <Button onClick={() => (setPlaying(false), setStep(Infinity))} title="Show all" aria-label="Show all">
                  ⏭
                </Button>
              </div>
              <p className={styles.note}>
                Step {cur + 1} / {n}. {explain}
              </p>
            </div>
          </Panel>

          <Panel title="Result">
            <div className={styles.stats}>
              {grids.map((g) => (
                <Stat key={g.label} label={g.label.replace(' · ', ' @ ')} value={`${g.result.faults} F`} tone={grids.length > 1 && g.result.faults === Math.min(...grids.map((x) => x.result.faults)) ? 'good' : undefined} />
              ))}
              {grids.length === 1 && (
                <>
                  <Stat label="Hits" value={primary.result.hits} />
                  <Stat label="Hit ratio" value={`${fmt((primary.result.hits / Math.max(1, n)) * 100, 0)}%`} />
                </>
              )}
            </div>
          </Panel>
        </div>

        <div className={styles.main}>
          <div className={styles.stage}>
            <FrameGridScene grids={grids} step={cur} viewKey={`${mode}-${n}-${grids.map((g) => g.numFrames).join(',')}`} />
            {mode === 'belady' && cur >= n - 1 && (
              <div className={styles.stageOverlay}>
                <Banner tone="bad">More frames, more faults: FIFO 3 frames = {grids[0].result.faults}, 4 frames = {grids[1].result.faults}.</Banner>
              </div>
            )}
          </div>

          <Panel title={`Textbook table · ${primary.label}`}>
            <TextbookTable result={primary.result} numFrames={primary.numFrames} step={cur} />
          </Panel>

          <div className={styles.two}>
            <Panel title="Faults vs. number of frames">
              <LineChart xs={sweep.xs} series={sweep.series} marks={sweep.marks} xLabel="frames" yLabel="page faults" ariaLabel="Page faults by frame count for FIFO, LRU and OPT" />
            </Panel>
            <Panel title="How each policy picks a victim">
              <ul className={styles.note} style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 8 }}>
                <li>
                  <b style={{ color: palette.ink }}>FIFO</b>: evict the page that was loaded first. Simple, but it suffers from Belady&apos;s anomaly.
                </li>
                <li>
                  <b style={{ color: palette.ink }}>LRU</b>: evict the page unused for the longest time. A stack algorithm, so it never shows the anomaly.
                </li>
                <li>
                  <b style={{ color: palette.ink }}>OPT</b>: evict the page whose next use is farthest away. It needs the future, so it is the lower bound
                  the others are measured against.
                </li>
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </main>
  );
}
