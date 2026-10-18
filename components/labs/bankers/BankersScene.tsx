'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { palette, resourceColors } from '@/lib/palette';
import { needMatrix, type BankersInput, type SafetyResult } from '@/lib/os/deadlock/bankers';
import IsoStage from '@/components/three/IsoStage';
import { Block, Flyer, Label, type Vec3 } from '@/components/three/primitives';

export interface Flight {
  id: number;
  from: number | 'pool';
  to: number | 'pool';
  vec: number[];
}

const DISC_H = 0.17;
const R = 4.5;
const discGeo = new THREE.CylinderGeometry(0.3, 0.3, DISC_H * 0.9, 6);

function useMaterials() {
  return useMemo(
    () => ({
      solid: resourceColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true })),
      ghost: resourceColors.map((c) => new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 0.32, depthWrite: false, flatShading: true })),
    }),
    [],
  );
}

export function padPosition(i: number, n: number): Vec3 {
  const t = -Math.PI * 0.72 + (i * 2 * Math.PI) / n;
  return [R * Math.cos(t), 0, R * Math.sin(t)];
}

function colOffset(j: number, m: number, spread: number) {
  return (j - (m - 1) / 2) * spread;
}

function Stack({ count, ghost = 0, x, z, j, mats }: { count: number; ghost?: number; x: number; z: number; j: number; mats: ReturnType<typeof useMaterials> }) {
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: Math.max(0, count) }, (_, d) => (
        <mesh key={`s${d}`} geometry={discGeo} material={mats.solid[j]} position={[0, DISC_H / 2 + d * DISC_H, 0]} />
      ))}
      {Array.from({ length: Math.max(0, ghost) }, (_, d) => (
        <mesh key={`g${d}`} geometry={discGeo} material={mats.ghost[j]} position={[0, DISC_H / 2 + (Math.max(0, count) + d) * DISC_H, 0]} />
      ))}
    </group>
  );
}

interface Props {
  input: BankersInput;
  safety: SafetyResult;
  step: number;
  flights: Flight[];
}

export default function BankersScene({ input, safety, step, flights }: Props) {
  const mats = useMaterials();
  const n = input.allocation.length;
  const m = input.available.length;
  const need = needMatrix(input);
  const checks = safety.checks;
  const k = Math.min(step, checks.length - 1);
  const order = new Map<number, number>();
  checks.slice(0, k + 1).forEach((c) => c.canRun && order.set(c.pid, order.size + 1));
  const work = k < 0 ? input.available : checks[k].workAfter ?? checks[k].work;
  const checking = k >= 0 ? checks[k] : null;
  const ended = k >= checks.length - 1 && k >= 0;

  const poolTop = (j: number) => 0.2 + work[j] * DISC_H;
  const placeOf = (who: number | 'pool', j: number, top: boolean): Vec3 => {
    if (who === 'pool') return [colOffset(j, m, 0.8), top ? poolTop(j) + 0.1 : 0.4, 0];
    const p = padPosition(who, n);
    return [p[0] + colOffset(j, m, 0.78), 0.25 + (input.allocation[who][j] + Math.max(0, need[who][j])) * DISC_H, p[2]];
  };

  return (
    <IsoStage view={{ min: [-6.4, -0.3, -6.0], max: [6.4, 1.8, 6.0] }} viewKey={`${n}-${m}`} polar={(48 * Math.PI) / 180} shadowY={-0.3}>
      <Block size={[13.4, 0.3, 12.8]} position={[0, -0.15, 0]} color={palette.board} radius={0.2} />

      {/* the bank: Available / Work */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[1.75, 1.85, 0.2, 10]} />
        <meshStandardMaterial color={palette.surface} flatShading roughness={0.85} />
      </mesh>
      {work.map((w, j) => (
        <group key={j} position={[0, 0.2, 0]}>
          <Stack count={w} x={colOffset(j, m, 0.8)} z={0} j={j} mats={mats} />
        </group>
      ))}
      <Label billboard position={[0, Math.max(...work, 1) * DISC_H + 0.7, 0]} size={0.4} bold>
        {k < 0 ? `Available (${work.join(', ')})` : `Work (${work.join(', ')})`}
      </Label>

      {input.allocation.map((alloc, i) => {
        const [x, , z] = padPosition(i, n);
        const done = order.has(i);
        const isChecking = checking?.pid === i;
        const stuck = ended && !safety.finish[i];
        const padColor = isChecking ? (checking!.canRun ? palette.RUNNING : palette.fault) : done ? '#CFEBDA' : stuck ? '#F6C9C2' : palette.surface;
        const tallest = done ? 0 : Math.max(...alloc.map((a, j) => a + Math.max(0, need[i][j])));
        return (
          <group key={i}>
            <Block size={[2.9, 0.18, 2.0]} position={[x, 0.09, z]} color={padColor} radius={0.08} />
            {!done &&
              alloc.map((a, j) => (
                <group key={j} position={[0, 0.18, 0]}>
                  <Stack count={a} ghost={Math.max(0, need[i][j])} x={x + colOffset(j, m, 0.78)} z={z} j={j} mats={mats} />
                </group>
              ))}
            <Label billboard position={[x, 0.7 + tallest * DISC_H, z]} size={0.46} bold>
              {done ? `P${i}  ✓ #${order.get(i)}` : `P${i}`}
            </Label>
          </group>
        );
      })}

      {flights.flatMap((f) =>
        f.vec.flatMap((count, j) =>
          Array.from({ length: Math.min(count, 8) }, (_, d) => {
            const a = placeOf(f.from, j, true);
            const b = placeOf(f.to, j, false);
            return (
              <Flyer
                key={`${f.id}-${j}-${d}`}
                from={[a[0], a[1] + d * DISC_H, a[2]]}
                to={[b[0], b[1] + d * DISC_H, b[2]]}
                color={resourceColors[j]}
                size={[0.56, DISC_H, 0.56]}
                vanish
              />
            );
          }),
        ),
      )}
    </IsoStage>
  );
}
