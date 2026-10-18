'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { palette } from '@/lib/palette';
import type { Job, MemBlock, MemState } from '@/lib/os/memory/partitioning';
import IsoStage from '@/components/three/IsoStage';
import { Block, Label, useDampedPosition, useDampedValue } from '@/components/three/primitives';
import { ownerColor } from './colors';

const LENGTH = 22;
const DEPTH = 1.9;
const OWNED_H = 0.85;
const HOLE_H = 0.06;

function MemBlockMesh({ b, scale, x0, highlight }: { b: MemBlock; scale: number; x0: number; highlight: boolean }) {
  const width = Math.max(0.04, b.size * scale - 0.06);
  const usedW = b.owner ? Math.max(0.04, b.used * scale - 0.06) : 0;
  const ref = useDampedPosition([x0 + (b.start + b.size / 2) * scale, 0, 0], { smooth: 0.35, hop: 0 });
  const w = useDampedValue(width, 0.3);
  const h = useDampedValue(b.owner ? OWNED_H : HOLE_H, 0.22);
  const solid = useRef<THREE.Mesh>(null);
  const waste = useRef<THREE.Mesh>(null);
  const top = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const flash = useRef(highlight ? 1 : 0);
  if (highlight && flash.current < 0.05) flash.current = 1;

  useFrame((_, d) => {
    const ww = w.current;
    const uw = b.owner ? Math.min(ww, usedW * (ww / width)) : ww;
    if (solid.current) {
      solid.current.scale.set(uw, h.current, DEPTH);
      solid.current.position.set(-ww / 2 + uw / 2, h.current / 2, 0);
    }
    if (waste.current) {
      const rest = Math.max(0.0001, ww - uw);
      waste.current.visible = !!b.owner && ww - uw > 0.02;
      waste.current.scale.set(rest, h.current, DEPTH);
      waste.current.position.set(ww / 2 - rest / 2, h.current / 2, 0);
    }
    if (top.current) top.current.position.y = h.current + 0.01;
    flash.current = Math.max(0, flash.current - d * 0.8);
    if (glow.current) glow.current.emissiveIntensity = flash.current * 0.6;
  });

  const color = ownerColor(b.owner);
  const narrow = width < 1.3;
  const fontSize = Math.min(0.3, Math.max(0.16, (narrow ? DEPTH : width) * 0.16));
  const text = b.owner ? `${b.owner}  ${b.used}K` : `${b.size}K free`;
  return (
    <group ref={ref}>
      <mesh ref={solid}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={glow} color={b.owner ? color : palette.tileEmpty} roughness={0.85} flatShading emissive={palette.hit} emissiveIntensity={0} />
      </mesh>
      <mesh ref={waste}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <group ref={top}>
        <Label flat size={fontSize} rotationY={narrow ? Math.PI / 2 : 0} bold={!!b.owner} color={b.owner === 'OS' ? palette.bg : b.owner ? palette.ink : palette.inkSoft}>
          {text}
        </Label>
        {b.owner && b.size > b.used && !narrow && (
          <Label flat position={[width / 2 - ((b.size - b.used) * scale) / 2, 0, 0.62]} size={Math.min(0.22, fontSize)} color={palette.inkSoft}>
            {`+${b.size - b.used}K waste`}
          </Label>
        )}
      </group>
    </group>
  );
}

function WaitingJob({ job, x, scale }: { job: Job; x: number; scale: number }) {
  const w = Math.max(0.6, job.size * scale);
  const ref = useDampedPosition([x + w / 2, 0.9, -2.7], { smooth: 0.3, hop: 0.2 });
  return (
    <group ref={ref}>
      <Block size={[w, 0.5, 1.0]} position={[0, 0.25, 0]} color={ownerColor(job.name)} opacity={0.75} radius={0.06} />
      <Label flat position={[0, 0.52, 0]} size={0.26} bold>
        {`${job.name} ${job.size}K · waiting`}
      </Label>
    </group>
  );
}

export default function MemoryScene({ state, highlightId }: { state: MemState; highlightId: number | null }) {
  const scale = LENGTH / state.total;
  const x0 = -LENGTH / 2;
  const boundaries = Array.from(new Set(state.blocks.flatMap((b) => [b.start, b.start + b.size]))).sort((a, b) => a - b);
  const pins = Array.from({ length: 34 }, (_, i) => x0 + 0.3 + (i * (LENGTH - 0.6)) / 33);

  return (
    <IsoStage view={{ min: [x0 - 0.8, -0.3, -3.4], max: [-x0 + 0.8, 1.2, 1.9] }} viewKey={state.mode} polar={(50 * Math.PI) / 180} azimuth={(16 * Math.PI) / 180} shadowY={-0.35}>
      {/* the RAM stick */}
      <Block size={[LENGTH + 1.0, 0.24, DEPTH + 0.9]} position={[0, -0.12, 0.1]} color={palette.board} radius={0.1} />
      {pins.map((x, i) => (
        <Block key={i} size={[0.36, 0.05, 0.3]} position={[x, -0.18, DEPTH / 2 + 0.55]} color={palette.WAITING} radius={0.02} />
      ))}
      {state.blocks.map((b) => (
        <MemBlockMesh key={b.id} b={b} scale={scale} x0={x0} highlight={b.id === highlightId} />
      ))}
      {boundaries.map((a) => (
        <Label key={a} flat position={[x0 + a * scale, 0.01, DEPTH / 2 + 0.2]} size={0.2} color={palette.inkSoft} rotationY={Math.PI / 2}>
          {String(a)}
        </Label>
      ))}
      {state.waiting.map((j, i) => {
        const x = x0 + state.waiting.slice(0, i).reduce((a, w) => a + Math.max(0.6, w.size * scale) + 0.4, 0);
        return <WaitingJob key={j.name} job={j} x={x} scale={scale} />;
      })}
    </IsoStage>
  );
}
