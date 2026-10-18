'use client';

import { useSim, useCurrent } from '@/store/simStore';
import { isFinished } from '@/lib/os/kernel';
import { PRESETS, type PresetId } from '@/lib/os/workload';
import { REPL_ALGOS, SCHED_ALGOS, SCHED_LABELS, type ReplAlgo, type SchedAlgo } from '@/lib/os/types';
import { Button, Field, NumberInput, Select } from '@/components/ui/ui';
import styles from './computer.module.css';

const SPEEDS = [0.5, 1, 1.5, 2, 4, 8];

export default function ControlBar() {
  const s = useCurrent();
  const { playing, speed, cursor, history, presetId, overrides } = useSim();
  const { setPlaying, stepForward, stepBack, seek, setSpeed, setLive, addProcess, load, reset } = useSim.getState();
  const done = isFinished(s) && cursor === history.length - 1;
  const cfg = s.config;

  return (
    <div className={styles.controlBar}>
      <div className={styles.group}>
        <Button variant="primary" onClick={() => setPlaying(!playing)} disabled={done && !playing} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </Button>
        <Button onClick={stepBack} disabled={cursor === 0} title="Step back">
          ⏮ Back
        </Button>
        <Button onClick={stepForward} disabled={done} title="Step one tick">
          Step ⏭
        </Button>
        <Button variant="ghost" onClick={reset} title="Restart this preset">
          ↺ Reset
        </Button>
      </div>

      <div className={`${styles.group} ${styles.scrub}`}>
        <span className={styles.clock}>
          t = <strong>{s.clock}</strong>
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, history.length - 1)}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          aria-label="Timeline"
        />
        <Select
          label="Speed"
          value={String(speed)}
          options={SPEEDS.map((v) => ({ value: String(v), label: `${v}× tick/s` }))}
          onChange={(v) => setSpeed(Number(v))}
        />
      </div>

      <div className={styles.group}>
        <Field label="Scheduler">
          <Select<SchedAlgo> value={cfg.algo} options={SCHED_ALGOS.map((a) => ({ value: a, label: SCHED_LABELS[a] }))} onChange={(algo) => setLive({ algo })} />
        </Field>
        {cfg.algo === 'RR' && (
          <Field label="Quantum">
            <NumberInput value={cfg.quantum} min={1} max={10} onChange={(quantum) => setLive({ quantum })} />
          </Field>
        )}
        <Field label="Replacement">
          <Select<ReplAlgo> value={cfg.replacement} options={REPL_ALGOS.map((a) => ({ value: a, label: a }))} onChange={(replacement) => setLive({ replacement })} />
        </Field>
        <Field label="Ctx cost">
          <NumberInput value={cfg.ctxSwitchCost} min={0} max={3} onChange={(ctxSwitchCost) => setLive({ ctxSwitchCost })} />
        </Field>
        <Field label="Frames">
          <NumberInput value={cfg.numFrames} min={2} max={16} onChange={(numFrames) => load(presetId, { ...overrides, numFrames })} />
        </Field>
      </div>

      <div className={styles.group}>
        <Field label="Preset">
          <Select<PresetId>
            value={presetId}
            options={Object.values(PRESETS).map((p) => ({ value: p.id, label: p.label }))}
            onChange={(id) => load(id)}
          />
        </Field>
        <Button onClick={addProcess} title="Fork a random process">
          + Process
        </Button>
        <Button
          variant="ghost"
          onClick={() => load(presetId, { ...overrides, seed: Math.floor(Math.random() * 1e9) })}
          title="Same workload, new random memory references"
        >
          🎲 Reseed
        </Button>
      </div>
    </div>
  );
}
