'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { palette } from '@/lib/palette';
import { filledSlots, inCriticalSection, programOf, type PCState, type SemName } from '@/lib/os/sync/producerConsumer';
import IsoStage from '@/components/three/IsoStage';
import { Block, Flyer, Label, Pawn, useDampedPosition, type Vec3 } from '@/components/three/primitives';
import { threadColor } from './colors';

const DISC_H = 0.16;
const discGeo = new THREE.CylinderGeometry(0.3, 0.3, DISC_H * 0.9, 8);

const ringRadius = (n: number) => Math.max(1.8, n * 0.48);
const slotAngle = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
const onRing = (i: number, n: number, r: number, y = 0, dA = 0): Vec3 => {
  const a = slotAngle(i, n) + dA;
  return [r * Math.cos(a), y, r * Math.sin(a)];
};

export function threadPos(s: PCState, tid: number): Vec3 {
  const t = s.threads[tid];
  const same = s.threads.filter((x) => x.kind === t.kind);
  const k = same.findIndex((x) => x.id === tid);
  const r = ringRadius(s.size);
  return [(t.kind === 'P' ? -1 : 1) * (r + 2.9), 0.12, (k - (same.length - 1) / 2) * 2.4];
}

const threadsDepth = (s: PCState, kind: 'P' | 'C') => ((s.threads.filter((t) => t.kind === kind).length - 1) / 2) * 2.4;

function Pointer({ s, which }: { s: PCState; which: 'in' | 'out' }) {
  const r = ringRadius(s.size);
  const idx = which === 'in' ? s.in : s.out;
  const dA = s.in === s.out ? (which === 'in' ? -0.16 : 0.16) : 0;
  const pos = onRing(idx, s.size, r + 1.0, 0.25, dA);
  const ref = useDampedPosition(pos, { smooth: 0.25, hop: 0 });
  const angle = slotAngle(idx, s.size) + dA;
  const color = which === 'in' ? palette.hit : palette.fault;
  return (
    <group ref={ref}>
      <mesh rotation={[0, -angle, Math.PI / 2]}>
        <coneGeometry args={[0.2, 0.45, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <Label billboard position={[0, 0.5, 0]} size={0.28} bold color={color}>
        {which}
      </Label>
    </group>
  );
}

function LockRing({ s }: { s: PCState }) {
  const r = ringRadius(s.size);
  const ref = useRef<THREE.Mesh>(null);
  const held = s.useSemaphores && s.sem.mutex.value <= 0;
  useFrame((_, d) => {
    if (ref.current && held) ref.current.rotation.z += d * 0.8;
  });
  return (
    <mesh ref={ref} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[r + 0.55, 0.07, 6, 48, held ? Math.PI * 1.75 : Math.PI * 2]} />
      <meshStandardMaterial color={!s.useSemaphores ? palette.idle : held ? palette.ctx : palette.hit} flatShading />
    </mesh>
  );
}

function SemGauge({ s, name, x, z }: { s: PCState; name: SemName; x: number; z: number }) {
  const sem = s.sem[name];
  const on = s.useSemaphores;
  const color = name === 'mutex' ? palette.ctx : name === 'empty' ? palette.READY : palette.RUNNING;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: on ? color : palette.idle, flatShading: true, roughness: 0.8 }), [on, color]);
  const discs = Math.min(8, Math.max(0, sem.value));
  return (
    <group position={[x, 0, z]}>
      <Block size={[1.2, 0.12, 1.2]} position={[0, 0.06, 0]} color={palette.surface} radius={0.05} />
      {Array.from({ length: discs }, (_, d) => (
        <mesh key={d} geometry={discGeo} material={mat} position={[0, 0.12 + DISC_H / 2 + d * DISC_H, 0]} />
      ))}
      {on &&
        sem.queue.map((tid, i) => (
          <mesh key={tid} position={[0.85 + i * 0.32, 0.25, 0]}>
            <icosahedronGeometry args={[0.13, 0]} />
            <meshStandardMaterial color={threadColor(s.threads[tid])} flatShading />
          </mesh>
        ))}
      <Label billboard position={[0, 0.55 + discs * DISC_H, 0]} size={0.3} bold color={on ? palette.ink : palette.inkSoft}>
        {on ? `${name} = ${sem.value}` : `${name} (off)`}
      </Label>
    </group>
  );
}

export default function SyncScene({ s }: { s: PCState }) {
  const n = s.size;
  const r = ringRadius(n);
  const filled = filledSlots(s);
  const counterBad = s.count !== filled && s.threads.every((t) => !inCriticalSection(t));
  const last = s.last;

  return (
    <IsoStage view={{ min: [-r - 4.0, -0.3, -r - 3.0], max: [r + 4.0, 1.4, r + 2.9] }} viewKey={`${n}-${s.threads.length}`} polar={(50 * Math.PI) / 180}>
      <Block size={[2 * r + 8.6, 0.3, 2 * r + 6.4]} position={[0, -0.15, -0.05]} color={palette.board} radius={0.2} />

      {/* bounded buffer */}
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[r + 0.45, r + 0.5, 0.06, 24]} />
        <meshStandardMaterial color={palette.surface} flatShading />
      </mesh>
      <LockRing s={s} />
      <Label flat position={[0, 0.07, 0]} size={0.34} bold>
        {`buffer · N = ${n}`}
      </Label>
      {s.buffer.map((slot, i) => {
        const [x, , z] = onRing(i, n, r);
        return (
          <group key={i} position={[x, 0, z]}>
            <Block size={[0.9, 0.1, 0.9]} position={[0, 0.05, 0]} color={palette.tileEmpty} radius={0.04} />
            <Label flat position={[0, 0.11, 0.62]} size={0.18} color={palette.inkSoft}>
              {String(i)}
            </Label>
            {slot && (
              <group>
                <Block size={[0.6, 0.6, 0.6]} position={[0, 0.4, 0]} color={threadColor(s.threads[slot.by])} radius={0.08} />
                <Label flat position={[0, 0.71, 0]} size={0.28} bold>
                  {String(slot.item)}
                </Label>
              </group>
            )}
          </group>
        );
      })}
      <Pointer s={s} which="in" />
      <Pointer s={s} which="out" />

      {/* threads */}
      {s.threads.map((t) => {
        const pos = threadPos(s, t.id);
        const waitingOn = (['empty', 'full', 'mutex'] as SemName[]).find((k) => s.sem[k].queue.includes(t.id));
        const cs = inCriticalSection(t) && s.useSemaphores;
        const pad = t.blocked ? '#F6C9C2' : cs ? '#CFEBDA' : palette.surface;
        const line = programOf(t)[t.pc];
        const next = line.short ?? line.text;
        return (
          <group key={t.id} position={pos}>
            <Block size={[1.6, 0.12, 1.4]} position={[0, -0.06, 0]} color={pad} radius={0.06} />
            <Pawn color={threadColor(t)} selected={last?.tid === t.id} dim={t.blocked} />
            {t.item !== null && (
              <Block size={[0.4, 0.4, 0.4]} position={[0, 1.15, 0]} color={t.item === -1 ? palette.chip : t.kind === 'P' ? threadColor(t) : palette.surface} radius={0.06} />
            )}
            <Label billboard position={[0, t.item !== null ? 1.75 : 1.3, 0]} size={0.3} bold>
              {t.name.replace('Producer ', 'P').replace('Consumer ', 'C')}
            </Label>
            <Label flat position={[0, 0.01, 0.98]} size={0.24} color={t.blocked ? palette.fault : palette.inkSoft} maxWidth={2.6}>
              {t.blocked ? `blocked on ${waitingOn ?? '?'}` : `next: ${next}`}
            </Label>
          </group>
        );
      })}
      <Label flat position={[-r - 2.9, 0.01, threadsDepth(s, 'P') + 1.75]} size={0.3} bold color={palette.inkSoft}>
        PRODUCERS
      </Label>
      <Label flat position={[r + 2.9, 0.01, threadsDepth(s, 'C') + 1.75]} size={0.3} bold color={palette.inkSoft}>
        CONSUMERS
      </Label>

      {/* semaphores */}
      <SemGauge s={s} name="empty" x={-2.4} z={-r - 2.1} />
      <SemGauge s={s} name="full" x={0} z={-r - 2.1} />
      <SemGauge s={s} name="mutex" x={2.4} z={-r - 2.1} />

      {/* shared counter vs reality */}
      <group position={[0, 0, r + 1.9]}>
        <Block size={[2.6, 0.3, 0.9]} position={[-1.5, 0.15, 0]} color={counterBad ? palette.fault : palette.surface} radius={0.06} />
        <Label flat position={[-1.5, 0.31, 0]} size={0.3} bold>
          {`count = ${s.count}`}
        </Label>
        <Block size={[2.6, 0.3, 0.9]} position={[1.5, 0.15, 0]} color={palette.surface} radius={0.06} />
        <Label flat position={[1.5, 0.31, 0]} size={0.3} bold>
          {`items = ${filled}`}
        </Label>
      </group>

      {/* item movement for the last statement */}
      {last && last.op === 'put' && last.slot !== undefined && (
        <Flyer key={`put-${last.step}`} from={[threadPos(s, last.tid)[0], 1.2, threadPos(s, last.tid)[2]]} to={onRing(last.slot, n, r, 0.4)} color={threadColor(s.threads[last.tid])} size={[0.6, 0.6, 0.6]} vanish />
      )}
      {last && last.op === 'take' && last.slot !== undefined && (
        <Flyer key={`take-${last.step}`} from={onRing(last.slot, n, r, 0.4)} to={[threadPos(s, last.tid)[0], 1.15, threadPos(s, last.tid)[2]]} color={last.kind === 'error' ? palette.chip : palette.surface} size={[0.5, 0.5, 0.5]} vanish />
      )}
    </IsoStage>
  );
}
