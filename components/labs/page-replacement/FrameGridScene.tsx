'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { palette, processColors } from '@/lib/palette';
import type { ReplacementResult } from '@/lib/os/memory/replacement';
import IsoStage from '@/components/three/IsoStage';
import { Block, Label, useDampedPosition, type Vec3 } from '@/components/three/primitives';

export interface GridSpec {
  label: string;
  result: ReplacementResult;
  numFrames: number;
}

const CELL = 1.0;
const GAP = 4.6;

const pageColor = (page: number) => processColors[page % processColors.length];
const muted = (hex: string) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.5).getHexString();

function PageCube({ page, pos, drop, pulse, fresh }: { page: number; pos: Vec3; drop: boolean; pulse: boolean; fresh: boolean }) {
  const [target, setTarget] = useState<Vec3>(drop ? [pos[0], pos[1] + 2.6, pos[2]] : pos);
  const ref = useDampedPosition(target, { smooth: 0.22, hop: 0 });
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const glow = useRef(pulse ? 1 : 0);
  useFrame((_, d) => {
    if (target[1] !== pos[1]) setTarget(pos);
    glow.current = Math.max(0, glow.current - d * 0.9);
    if (mat.current) mat.current.emissiveIntensity = glow.current * 0.7;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.78, 0.5, 0.78]} />
        <meshStandardMaterial ref={mat} color={fresh ? pageColor(page) : muted(pageColor(page))} roughness={0.85} flatShading emissive={palette.hit} emissiveIntensity={0} />
      </mesh>
      <Label flat position={[0, 0.51, 0]} size={0.38} bold color={fresh ? palette.ink : palette.inkSoft}>
        {String(page)}
      </Label>
    </group>
  );
}

function Grid({ spec, oz, x0, step }: { spec: GridSpec; oz: number; x0: number; step: number }) {
  const { result, numFrames } = spec;
  const n = result.steps.length;
  const width = n * CELL + 2.8;
  const depth = numFrames * CELL + 3.4;
  const faultsSoFar = result.steps.slice(0, step + 1).filter((s) => !s.hit).length;
  return (
    <group>
      <Block size={[width, 0.2, depth]} position={[x0 + ((n - 1) * CELL) / 2 + 0.3, -0.1, oz + (numFrames * CELL) / 2 - 0.85]} color={palette.board} radius={0.12} />
      <Label flat anchorX="left" position={[x0 - 1.6, 0.01, oz - 2.05]} size={0.42} bold>
        {`${spec.label}  ·  ${faultsSoFar} fault${faultsSoFar === 1 ? '' : 's'}${step >= n - 1 ? '' : ` so far (of ${result.faults})`}`}
      </Label>
      <Label flat position={[x0 - 1.15, 0.01, oz - 1.2]} size={0.24} color={palette.inkSoft}>
        ref
      </Label>
      {Array.from({ length: numFrames }, (_, k) => (
        <Label key={k} flat position={[x0 - 1.15, 0.01, oz + k * CELL]} size={0.24} color={palette.inkSoft}>
          {`f${k}`}
        </Label>
      ))}

      {result.steps.map((s, i) => {
        const x = x0 + i * CELL;
        const done = i <= step;
        const now = i === step;
        return (
          <group key={i}>
            {/* reference string header */}
            <Block size={[0.8, now ? 0.34 : 0.14, 0.8]} position={[x, now ? 0.17 : 0.07, oz - 1.2]} color={now ? palette.ink : palette.surface} radius={0.06} />
            <Label flat position={[x, now ? 0.35 : 0.15, oz - 1.2]} size={0.36} bold color={now ? palette.bg : done ? palette.ink : palette.inkSoft}>
              {String(s.ref)}
            </Label>
            {/* frame contents after this reference */}
            {done &&
              s.frames.map((page, k) =>
                page === null ? null : (
                  <PageCube
                    key={`${k}-${page}`}
                    page={page}
                    pos={[x, 0, oz + k * CELL]}
                    drop={now && s.insertedAt === k}
                    pulse={now && s.hit && page === s.ref}
                    fresh={s.insertedAt === k || (s.hit && page === s.ref)}
                  />
                ),
              )}
            {/* hit / fault marker */}
            {done && (
              <group position={[x, 0, oz + numFrames * CELL + 0.1]}>
                <Block size={[0.8, 0.1, 0.5]} position={[0, 0.05, 0]} color={s.hit ? palette.hit : palette.fault} radius={0.04} />
                <Label flat position={[0, 0.11, 0]} size={0.28} bold>
                  {s.hit ? 'H' : 'F'}
                </Label>
              </group>
            )}
          </group>
        );
      })}
      {step >= 0 && step < n && (
        <Block
          size={[0.98, 0.03, numFrames * CELL + 2.3]}
          position={[x0 + step * CELL, 0.015, oz + (numFrames * CELL) / 2 - 0.85]}
          color={palette.accent}
          opacity={0.18}
          radius={0.01}
        />
      )}
    </group>
  );
}

export default function FrameGridScene({ grids, step, viewKey }: { grids: GridSpec[]; step: number; viewKey: string }) {
  const n = Math.max(1, ...grids.map((g) => g.result.steps.length));
  const x0 = -((n - 1) * CELL) / 2;
  let oz = 0;
  const placed = grids.map((g) => {
    const at = oz;
    oz += g.numFrames * CELL + GAP;
    return at;
  });
  const depthEnd = oz - GAP + 0.6;
  return (
    <IsoStage
      azimuth={(14 * Math.PI) / 180}
      polar={(40 * Math.PI) / 180}
      shadowY={-0.22}
      view={{ min: [x0 - 1.8, -0.2, -2.4], max: [x0 + (n - 1) * CELL + 0.8, 0.6, depthEnd] }}
      viewKey={viewKey}
    >
      {grids.map((g, i) => (
        <Grid key={`${g.label}-${i}`} spec={g} oz={placed[i]} x0={x0} step={step} />
      ))}
    </IsoStage>
  );
}
