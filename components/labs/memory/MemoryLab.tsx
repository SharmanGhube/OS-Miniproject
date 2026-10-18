'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import {
  FIT_LABELS,
  TEXTBOOK_JOBS,
  allocate,
  compact,
  createMemory,
  free,
  memStats,
  textbookMemory,
  type FitStrategy,
  type MemState,
  type PartitionMode,
} from '@/lib/os/memory/partitioning';
import { Banner, Button, Field, NumberInput, Panel, Select, Stat } from '@/components/ui/ui';
import threeStyles from '@/components/three/three.module.css';
import styles from '../labs.module.css';
import { ownerColor } from './colors';

const MemoryScene = dynamic(() => import('./MemoryScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Seating the RAM stick…</div>,
});

const STRATEGIES: FitStrategy[] = ['FIRST', 'BEST', 'WORST'];

function emptyMemory(mode: PartitionMode): MemState {
  return mode === 'FIXED'
    ? createMemory('FIXED', [[100, 'OS', true], [200, null], [200, null], [300, null], [400, null], [800, null]])
    : createMemory('DYNAMIC', [[100, 'OS', true], [1900, null]]);
}

/** Where each textbook job lands under each strategy (for the comparison table). */
function compareTable(mode: PartitionMode) {
  return STRATEGIES.map((strategy) => {
    let s = textbookMemory(mode);
    return TEXTBOOK_JOBS.map((job) => {
      const r = allocate(s, job, strategy);
      s = r.state;
      return r.outcome.ok ? `${r.outcome.holeSize}K${mode === 'DYNAMIC' ? ' hole' : ''}` : 'waits';
    });
  });
}

export default function MemoryLab() {
  const [mode, setMode] = useState<PartitionMode>('DYNAMIC');
  const [strategy, setStrategy] = useState<FitStrategy>('FIRST');
  const [mem, setMem] = useState<MemState>(() => textbookMemory('DYNAMIC'));
  const [script, setScript] = useState(0);
  const [size, setSize] = useState(150);
  const [counter, setCounter] = useState(5);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad' | 'info' | 'warn'; text: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const stats = memStats(mem);
  const table = useMemo(() => compareTable(mode), [mode]);
  const say = (tone: 'good' | 'bad' | 'info' | 'warn', text: string) => {
    setMessage({ tone, text });
    setLog((l) => [text, ...l].slice(0, 40));
  };

  const reset = (m: PartitionMode, textbook = true) => {
    setMode(m);
    setMem(textbook ? textbookMemory(m) : emptyMemory(m));
    setScript(textbook ? 0 : TEXTBOOK_JOBS.length);
    setHighlight(null);
    setMessage(null);
    setLog([]);
  };

  const doAllocate = (name: string, sz: number) => {
    const r = allocate(mem, { name, size: sz }, strategy);
    setMem(r.state);
    if (r.outcome.ok) {
      setHighlight(r.outcome.blockId);
      const waste = mode === 'FIXED' ? ` (internal fragmentation ${r.outcome.holeSize - sz}K)` : r.outcome.holeSize > sz ? `, leaving a ${r.outcome.holeSize - sz}K hole` : '';
      say('good', `${FIT_LABELS[strategy]}: ${name} (${sz}K) → ${r.outcome.holeSize}K ${mode === 'FIXED' ? 'partition' : 'hole'} at ${r.outcome.start}${waste}.`);
    } else if (r.outcome.reason === 'EXTERNAL_FRAGMENTATION') {
      say('warn', `${name} (${sz}K) must wait: ${stats.free}K is free in total, but the largest hole is only ${stats.largestHole}K. That is external fragmentation; try Compact.`);
    } else {
      say('bad', `${name} (${sz}K) must wait: no ${mode === 'FIXED' ? 'free partition' : 'hole'} is big enough.`);
    }
  };

  const doFree = (owner: string) => {
    const r = free(mem, owner, strategy);
    setMem(r.state);
    setHighlight(null);
    say('info', `Freed ${owner}.${mode === 'DYNAMIC' ? ' Neighbouring holes merge.' : ''}${r.placed.length ? ` Waiting ${r.placed.join(', ')} now fit.` : ''}`);
  };

  const doCompact = () => {
    const r = compact(mem, strategy);
    setMem(r.state);
    setHighlight(null);
    say('good', `Compaction moved ${r.moved}K of memory and left one ${memStats(r.state).largestHole}K hole.${r.placed.length ? ` Waiting ${r.placed.join(', ')} now fit.` : ''}`);
  };

  const owned = mem.blocks.filter((b) => b.owner && !b.locked);

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>Memory Partitioning Lab</h1>
          <p>
            Physical memory is a strip of addresses. In <b>fixed</b> partitioning each partition holds one job, and the unused rest is internal
            fragmentation (translucent). In <b>dynamic</b> partitioning jobs carve holes to size. The holes left behind are external
            fragmentation, which <b>compaction</b> removes.
          </p>
        </div>
      </div>

      <div className={styles.lab}>
        <div className={styles.controls}>
          <Panel title="Scheme">
            <div className={styles.stack}>
              <div className={styles.tabs}>
                {(['FIXED', 'DYNAMIC'] as PartitionMode[]).map((m) => (
                  <button key={m} className={mode === m ? styles.on : undefined} onClick={() => reset(m)}>
                    {m === 'FIXED' ? 'Fixed partitions' : 'Dynamic partitions'}
                  </button>
                ))}
              </div>
              <Field label="Placement strategy">
                <Select<FitStrategy> value={strategy} options={STRATEGIES.map((s) => ({ value: s, label: FIT_LABELS[s] }))} onChange={setStrategy} />
              </Field>
              <div className={styles.row}>
                <Button variant="ghost" onClick={() => reset(mode)}>
                  Textbook layout
                </Button>
                <Button variant="ghost" onClick={() => reset(mode, false)}>
                  Empty memory
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="Textbook jobs (212K, 417K, 112K, 426K)">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button
                  variant="primary"
                  disabled={script >= TEXTBOOK_JOBS.length}
                  onClick={() => {
                    const j = TEXTBOOK_JOBS[script];
                    doAllocate(j.name, j.size);
                    setScript(script + 1);
                  }}
                >
                  {script < TEXTBOOK_JOBS.length ? `Place ${TEXTBOOK_JOBS[script].name} (${TEXTBOOK_JOBS[script].size}K)` : 'All placed'}
                </Button>
              </div>
              <p className={styles.note}>The holes and partitions are 100K, 500K, 200K, 300K and 600K, as in the Silberschatz exercise.</p>
            </div>
          </Panel>

          <Panel title="Allocate / free">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Field label="Size (K)">
                  <NumberInput value={size} min={10} max={2000} width={80} onChange={setSize} />
                </Field>
                <Button
                  onClick={() => {
                    doAllocate(`J${counter}`, size);
                    setCounter(counter + 1);
                  }}
                >
                  Allocate J{counter}
                </Button>
              </div>
              <div className={styles.row}>
                {owned.length === 0 && <span className={styles.note}>No jobs in memory.</span>}
                {owned.map((b) => (
                  <Button key={b.id} variant="ghost" onClick={() => doFree(b.owner!)} title={`Free ${b.owner}`}>
                    <span className={styles.swatch} style={{ background: ownerColor(b.owner) }} />
                    Free {b.owner}
                  </Button>
                ))}
              </div>
              <Button variant="primary" onClick={doCompact} disabled={mode !== 'DYNAMIC' || stats.holes <= 1}>
                ⇤ Compact
              </Button>
              {mode === 'FIXED' && <p className={styles.note}>Compaction only applies to dynamic partitions.</p>}
            </div>
          </Panel>
        </div>

        <div className={styles.main}>
          <div className={styles.stage}>
            <MemoryScene state={mem} highlightId={highlight} />
            {message && (
              <div className={styles.stageOverlay}>
                <Banner tone={message.tone}>{message.text}</Banner>
              </div>
            )}
          </div>

          <Panel title="Fragmentation">
            <div className={styles.stats}>
              <Stat label="Used" value={`${stats.used}K`} />
              <Stat label="Free" value={`${stats.free}K`} />
              <Stat label="Holes" value={stats.holes} />
              <Stat label="Largest hole" value={`${stats.largestHole}K`} />
              <Stat label="Internal frag." value={`${stats.internalFragmentation}K`} tone={stats.internalFragmentation ? 'warn' : undefined} />
              <Stat label="External frag." value={`${stats.externalFragmentation}K`} tone={stats.externalFragmentation ? 'warn' : undefined} />
              <Stat label="Waiting" value={mem.waiting.map((j) => j.name).join(', ') || '—'} tone={mem.waiting.length ? 'bad' : undefined} />
            </div>
          </Panel>

          <div className={styles.two}>
            <Panel title={`Compare strategies · ${mode === 'FIXED' ? 'fixed' : 'dynamic'}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Job</th>
                    {STRATEGIES.map((s) => (
                      <th key={s} className={s === strategy ? styles.colNow : undefined}>
                        {FIT_LABELS[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEXTBOOK_JOBS.map((j, i) => (
                    <tr key={j.name}>
                      <td>
                        {j.name} · {j.size}K
                      </td>
                      {STRATEGIES.map((s, k) => (
                        <td key={s} className={`${s === strategy ? styles.colNow : ''} ${table[k][i] === 'waits' ? styles.cellFault : ''}`}>
                          {table[k][i]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.note} style={{ marginTop: 8 }}>
                Best fit is the only strategy that places all four jobs here.
              </p>
            </Panel>

            <Panel title="Memory map">
              <div className={styles.scroll} style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Start</th>
                      <th>Size</th>
                      <th>Contents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mem.blocks.map((b) => (
                      <tr key={b.id} className={b.id === highlight ? styles.rowOk : undefined}>
                        <td>{b.start}</td>
                        <td>{b.size}K</td>
                        <td>
                          {b.owner ? (
                            <>
                              <span className={styles.swatch} style={{ background: ownerColor(b.owner) }} />
                              {b.owner}
                              {b.size > b.used ? ` (${b.used}K used, ${b.size - b.used}K wasted)` : ''}
                            </>
                          ) : (
                            <span className={styles.note}>hole</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          {log.length > 0 && (
            <Panel title="Log">
              <ol className={styles.note} style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                {log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
