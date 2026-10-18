'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { palette } from '@/lib/palette';
import type { Frame, PCB } from '@/lib/os/types';
import { Block, Label, Pawn, useDampedPosition, useDampedValue } from '@/components/three/primitives';
import { ZONES, frameCenter, type DeviceLayout, type TokenLayout } from './layout';

// ---------------------------------------------------------------- CPU

export function CpuChip({ mode, label }: { mode: 'IDLE' | 'USER' | 'CONTEXT_SWITCH'; label: string }) {
  const { center, size, height } = ZONES.cpu;
  const ring = useRef<THREE.Mesh>(null);
  const top = mode === 'USER' ? palette.RUNNING : mode === 'CONTEXT_SWITCH' ? palette.ctx : palette.idle;
  useFrame((_, d) => {
    if (ring.current) ring.current.rotation.z += d * (mode === 'CONTEXT_SWITCH' ? 3 : 0);
  });
  const pins = [];
  for (let i = 0; i < 7; i++) {
    const o = -size / 2 + 0.35 + i * ((size - 0.7) / 6);
    pins.push([o, -size / 2 - 0.12], [o, size / 2 + 0.12], [-size / 2 - 0.12, o], [size / 2 + 0.12, o]);
  }
  return (
    <group position={center}>
      {pins.map(([x, z], i) => (
        <Block key={i} size={[0.14, 0.08, 0.14]} position={[x, 0.04, z]} color={palette.boardEdge} radius={0.02} />
      ))}
      <Block size={[size, height, size]} position={[0, height / 2, 0]} color={palette.chip} radius={0.12} />
      <Block size={[size - 0.5, 0.06, size - 0.5]} position={[0, height + 0.01, 0]} color={top} radius={0.05} />
      {mode === 'CONTEXT_SWITCH' && (
        <mesh ref={ring} position={[0, height + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.05, 0.05, 6, 32, Math.PI * 1.4]} />
          <meshStandardMaterial color={palette.ctx} flatShading />
        </mesh>
      )}
      <Label flat position={[0, 0.02, size / 2 + 0.6]} size={0.36} bold>
        {label}
      </Label>
    </group>
  );
}

// ---------------------------------------------------------------- RAM

function FrameTile({ index, frame, color, recent, faulted, clock }: { index: number; frame: Frame | null; color: string; recent: boolean; faulted: boolean; clock: number }) {
  const [x, , z] = frameCenter(index);
  const lift = useDampedValue(recent ? 0.34 : 0.16, 0.2);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const flash = useRef(0);
  const lastFlashKey = useRef('');
  const key = faulted ? `${clock}` : '';
  if (key && key !== lastFlashKey.current) {
    lastFlashKey.current = key;
    flash.current = 1;
  }
  useFrame((_, d) => {
    if (group.current) group.current.scale.y = lift.current / 0.16;
    flash.current = Math.max(0, flash.current - d * 1.2);
    if (mat.current) mat.current.emissiveIntensity = flash.current * 0.9;
  });
  return (
    <group position={[x, 0, z]}>
      <group ref={group}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.96, 0.16, 0.96]} />
          <meshStandardMaterial ref={mat} color={color} roughness={0.85} flatShading emissive={palette.fault} emissiveIntensity={0} />
        </mesh>
      </group>
      <FrameLabel lift={lift} text={frame ? `P${frame.pid}·${frame.page}` : `f${index}`} dim={!frame} />
    </group>
  );
}

function FrameLabel({ lift, text, dim }: { lift: React.RefObject<number>; text: string; dim: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = lift.current + 0.01;
  });
  return (
    <group ref={ref}>
      <Label flat size={0.22} color={dim ? palette.inkSoft : palette.ink} bold={!dim}>
        {text}
      </Label>
    </group>
  );
}

export function RamGrid({ frames, processes, clock, faultFrame }: { frames: (Frame | null)[]; processes: Record<number, PCB>; clock: number; faultFrame: number | null }) {
  const { origin, cols, cell } = ZONES.ram;
  const rows = Math.ceil(frames.length / cols);
  const w = cols * cell + 0.3;
  const d = rows * cell + 0.3;
  return (
    <group>
      <Block
        size={[w, 0.08, d]}
        position={[origin[0] + ((cols - 1) * cell) / 2, 0.04, origin[2] + ((rows - 1) * cell) / 2]}
        color={palette.boardEdge}
        radius={0.04}
      />
      {frames.map((f, i) => (
        <FrameTile
          key={i}
          index={i}
          frame={f}
          color={f ? processes[f.pid]?.color ?? palette.tileEmpty : palette.tileEmpty}
          recent={!!f && f.lastUsed >= clock - 1}
          faulted={faultFrame === i}
          clock={clock}
        />
      ))}
      <Label flat position={[origin[0] + ((cols - 1) * cell) / 2, 0.02, origin[2] - 1.0]} size={0.36} bold>
        {`RAM · ${frames.length} frames`}
      </Label>
    </group>
  );
}

// ---------------------------------------------------------------- devices

export function DeviceStation({ layout, color }: { layout: DeviceLayout; color: string }) {
  const d = ZONES.devices[layout.device];
  const spin = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (spin.current && layout.servingPid !== null) spin.current.rotation.y += dt * 4;
  });
  const busyColor = layout.reason === 'PAGE_FAULT' ? palette.fault : palette.WAITING;
  return (
    <group position={d.center}>
      <Block size={[1.7, d.height, 1.5]} position={[0, d.height / 2, 0]} color={color} radius={0.12} />
      {layout.device === 'DISK' ? (
        <mesh ref={spin} position={[0, d.height + 0.03, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 10]} />
          <meshStandardMaterial color={layout.servingPid !== null ? busyColor : palette.tileEmpty} flatShading />
        </mesh>
      ) : (
        <Block size={[1.1, 0.05, 0.7]} position={[0, d.height + 0.03, 0.2]} color={layout.servingPid !== null ? busyColor : palette.tileEmpty} radius={0.02} />
      )}
      {layout.servingPid !== null && (
        <mesh position={[0, d.height + 0.07, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <ringGeometry args={[0.66, 0.76, 32, 1, 0, Math.max(0.01, layout.progress) * Math.PI * 2]} />
          <meshBasicMaterial color={palette.ink} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Label flat position={[0, 0.02, 1.12]} size={0.34} bold>
        {layout.device}
      </Label>
      <Label flat position={[0, 0.02, 1.5]} size={0.24} color={palette.inkSoft}>
        {layout.reason === 'PAGE_FAULT' ? 'servicing page fault' : layout.servingPid !== null ? `serving P${layout.servingPid}` : 'idle'}
      </Label>
    </group>
  );
}

// ---------------------------------------------------------------- tokens

export function ProcessToken({ token, pcb, selected, onSelect }: { token: TokenLayout; pcb: PCB; selected: boolean; onSelect: (pid: number) => void }) {
  const ref = useDampedPosition(token.pos);
  const [hover, setHover] = useState(false);
  const scale = useDampedValue(token.scale * (hover ? 1.15 : 1), 0.15);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    if (inner.current) inner.current.scale.setScalar(scale.current);
  });
  const terminated = token.state === 'TERMINATED';
  return (
    <group ref={ref}>
      <group
        ref={inner}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          onSelect(token.pid);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <Pawn color={pcb.color} selected={selected} dim={terminated} />
        <Label billboard position={[0, 1.12, 0]} size={0.3} bold color={terminated ? palette.inkSoft : palette.ink}>
          {`P${token.pid}`}
        </Label>
      </group>
    </group>
  );
}
