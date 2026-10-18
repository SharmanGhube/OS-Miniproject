'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { palette } from '@/lib/palette';
import { createPC, filledSlots, inCriticalSection, programOf, step, stepThread, type PCConfig, type PCState } from '@/lib/os/sync/producerConsumer';
import { Banner, Button, Field, NumberInput, Panel, Select, Stat } from '@/components/ui/ui';
import threeStyles from '@/components/three/three.module.css';
import styles from '../labs.module.css';
import { threadColor } from './colors';

const SyncScene = dynamic(() => import('./SyncScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Filling the buffer…</div>,
});

const SPEEDS = [1, 2, 4, 8];
const MAX_HISTORY = 400;
const KIND_COLOR = { ok: palette.line, block: palette.WAITING, wake: palette.RUNNING, error: palette.fault, stall: palette.fault };

export default function SyncLab() {
  const [cfg, setCfg] = useState<PCConfig>({ size: 4, producers: 2, consumers: 2, producerSpeed: 2, consumerSpeed: 1, useSemaphores: true, seed: 7 });
  const [history, setHistory] = useState<PCState[]>(() => [createPC(cfg)]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const s = history[cursor];

  const restart = (next: PCConfig) => {
    setCfg(next);
    setHistory([createPC(next)]);
    setCursor(0);
    setPlaying(false);
  };
  const push = (next: PCState) => {
    const h = [...history.slice(0, cursor + 1), next].slice(-MAX_HISTORY);
    setHistory(h);
    setCursor(h.length - 1);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setHistory((h) => {
        const next = [...h, step(h[h.length - 1])].slice(-MAX_HISTORY);
        setCursor(next.length - 1);
        return next;
      });
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  // playback always continues from the newest state
  useEffect(() => {
    if (playing && cursor !== history.length - 1) setHistory((h) => h.slice(0, cursor + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const filled = filledSlots(s);
  const quiet = s.threads.every((t) => !inCriticalSection(t));
  const corrupted = (quiet && s.count !== filled) || s.overwrites > 0 || s.garbageReads > 0;

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>Producer–Consumer Lab</h1>
          <p>
            Producers put items into a circular bounded buffer and consumers take them out, one statement at a time. With semaphores,{' '}
            <code>empty</code> and <code>full</code> count slots and <code>mutex</code> guards the critical section (the ring turns amber while it is
            held). Switch them off to watch a race condition corrupt the shared counter.
          </p>
        </div>
      </div>

      <div className={styles.lab}>
        <div className={styles.controls}>
          <Panel title="Synchronisation">
            <div className={styles.stack}>
              <div className={styles.tabs}>
                <button className={cfg.useSemaphores ? styles.on : undefined} onClick={() => restart({ ...cfg, useSemaphores: true })}>
                  Semaphores on
                </button>
                <button className={!cfg.useSemaphores ? styles.on : undefined} onClick={() => restart({ ...cfg, useSemaphores: false })}>
                  Off (race condition)
                </button>
              </div>
              <div className={styles.row}>
                <Field label="Buffer N">
                  <NumberInput value={cfg.size} min={1} max={8} onChange={(size) => restart({ ...cfg, size })} />
                </Field>
                <Field label="Producers">
                  <NumberInput value={cfg.producers} min={1} max={3} onChange={(producers) => restart({ ...cfg, producers })} />
                </Field>
                <Field label="Consumers">
                  <NumberInput value={cfg.consumers} min={1} max={3} onChange={(consumers) => restart({ ...cfg, consumers })} />
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="Producer speed">
                  <NumberInput value={cfg.producerSpeed} min={1} max={5} onChange={(producerSpeed) => restart({ ...cfg, producerSpeed })} />
                </Field>
                <Field label="Consumer speed">
                  <NumberInput value={cfg.consumerSpeed} min={1} max={5} onChange={(consumerSpeed) => restart({ ...cfg, consumerSpeed })} />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Run">
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button onClick={() => restart(cfg)} title="Restart" aria-label="Restart">
                  ⏮
                </Button>
                <Button onClick={() => (setPlaying(false), setCursor(Math.max(0, cursor - 1)))} disabled={cursor === 0} aria-label="Step back">
                  ‹
                </Button>
                <Button variant="primary" onClick={() => setPlaying(!playing)}>
                  {playing ? '❚❚ Pause' : '▶ Play'}
                </Button>
                <Button onClick={() => (setPlaying(false), cursor < history.length - 1 ? setCursor(cursor + 1) : push(step(s)))} aria-label="Step">
                  ›
                </Button>
                <Select label="Speed" value={String(speed)} options={SPEEDS.map((v) => ({ value: String(v), label: `${v} steps/s` }))} onChange={(v) => setSpeed(Number(v))} />
              </div>
              <Button variant="ghost" onClick={() => restart({ ...cfg, seed: Math.floor(Math.random() * 1e9) })}>
                🎲 New interleaving
              </Button>
              <p className={styles.note}>
                Step {s.step}. {s.last ? s.last.text : 'The scheduler picks a runnable thread at random, weighted by speed.'}
              </p>
            </div>
          </Panel>

          <Panel title="Threads (step one by hand)">
            <div className={styles.stack}>
              {s.threads.map((t) => (
                <div key={t.id}>
                  <div className={styles.row} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>
                      <span className={styles.swatch} style={{ background: threadColor(t) }} />
                      {t.name}
                      {t.blocked ? <span className={styles.cellFault}> · blocked</span> : inCriticalSection(t) && s.useSemaphores ? <span className={styles.cellHit}> · in CS</span> : null}
                    </b>
                    <Button variant="ghost" disabled={t.blocked} onClick={() => (setPlaying(false), push(stepThread(s, t.id)))}>
                      Step
                    </Button>
                  </div>
                  <ol className="mono" style={{ margin: '4px 0 0', paddingLeft: 26, fontSize: 12, lineHeight: 1.6 }}>
                    {programOf(t).map((l, i) => (
                      <li
                        key={i}
                        style={{
                          background: i === t.pc ? (t.blocked ? '#F6C9C2' : '#CFEBDA') : undefined,
                          borderRadius: 4,
                          opacity: !s.useSemaphores && l.op !== 'put' && l.sem ? 0.45 : 1,
                        }}
                      >
                        {i === t.pc ? '▶ ' : ''}
                        {l.text}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className={styles.main}>
          <div className={styles.stage}>
            <SyncScene s={s} />
            {corrupted && (
              <div className={styles.stageOverlay}>
                <Banner tone="bad">
                  Race condition:{' '}
                  {s.count !== filled && quiet ? `count says ${s.count} but the buffer holds ${filled} item${filled === 1 ? '' : 's'}. ` : ''}
                  {s.overwrites ? `${s.overwrites} item${s.overwrites === 1 ? '' : 's'} overwritten. ` : ''}
                  {s.garbageReads ? `${s.garbageReads} read${s.garbageReads === 1 ? '' : 's'} of an empty slot.` : ''}
                </Banner>
              </div>
            )}
          </div>

          <Panel title="State">
            <div className={styles.stats}>
              <Stat label="empty" value={cfg.useSemaphores ? s.sem.empty.value : 'off'} />
              <Stat label="full" value={cfg.useSemaphores ? s.sem.full.value : 'off'} />
              <Stat label="mutex" value={cfg.useSemaphores ? s.sem.mutex.value : 'off'} tone={cfg.useSemaphores && s.sem.mutex.value <= 0 ? 'warn' : undefined} />
              <Stat label="count" value={s.count} tone={quiet && s.count !== filled ? 'bad' : undefined} />
              <Stat label="Items in buffer" value={filled} />
              <Stat label="Produced" value={s.produced} />
              <Stat label="Consumed" value={s.consumed} />
              <Stat label="Lost / garbage" value={`${s.overwrites} / ${s.garbageReads}`} tone={s.overwrites + s.garbageReads ? 'bad' : undefined} />
            </div>
            <p className={styles.note} style={{ marginTop: 10 }}>
              A negative semaphore value means that many threads are queued on it. Blocked threads appear as dots beside the gauge in the 3D view.
            </p>
          </Panel>

          <Panel title="Trace">
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 260, overflowY: 'auto', fontSize: 12.5 }}>
              {s.log.map((e, i) => (
                <li key={`${e.step}-${i}`} style={{ display: 'grid', gridTemplateColumns: '46px 10px 1fr', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                  <span className={styles.note}>#{e.step}</span>
                  <i style={{ width: 8, height: 8, borderRadius: '50%', background: KIND_COLOR[e.kind] }} />
                  <span className={e.kind === 'error' ? styles.cellFault : undefined}>{e.text}</span>
                </li>
              ))}
              {s.log.length === 0 && <li className={styles.note}>Press ▶ Play, or step a thread by hand.</li>}
            </ol>
          </Panel>
        </div>
      </div>
    </main>
  );
}
