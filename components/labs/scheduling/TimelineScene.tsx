'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { palette, colorForPid } from '@/lib/palette';
import type { ScheduleResult } from '@/lib/os/scheduling';
import IsoStage from '@/components/three/IsoStage';
import { Block, Label } from '@/components/three/primitives';

const LANE = 1.15;

/** A block that grows left→right as the time cursor sweeps over [start, end). */
function Segment({ start, end, unit, z, color, h, timeRef, label }: { start: number; end: number; unit: number; z: number; color: string; h: number; timeRef: React.RefObject<number>; label?: string }) {
  const g = useRef<THREE.Group>(null);
  const tag = useRef<THREE.Group>(null);
  const len = (end - start) * unit;
  useFrame(() => {
    const f = THREE.MathUtils.clamp((timeRef.current - start) / (end - start), 0, 1);
    if (g.current) {
      g.current.scale.x = Math.max(0.0001, f);
      g.current.visible = f > 0;
    }
    if (tag.current) tag.current.visible = f >= 0.999;
  });
  return (
    <group position={[start * unit, 0, z]}>
      <group ref={g}>
        <Block size={[Math.max(0.05, len - 0.06), h, 0.8]} position={[len / 2, h / 2, 0]} color={color} radius={0.06} />
      </group>
      {label && len > 0.5 && (
        <group ref={tag}>
          <Label flat position={[len / 2, h + 0.01, 0]} size={Math.min(0.3, len * 0.4)} bold>
            {label}
          </Label>
        </group>
      )}
    </group>
  );
}

function Cursor({ timeRef, unit, depth }: { timeRef: React.RefObject<number>; unit: number; depth: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.x = timeRef.current * unit;
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0.7, depth / 2 - 0.6]}>
        <boxGeometry args={[0.04, 1.4, depth]} />
        <meshBasicMaterial color={palette.ink} transparent opacity={0.25} />
      </mesh>
      <mesh position={[0, 1.42, depth - 0.6]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.16, 0.3, 4]} />
        <meshBasicMaterial color={palette.ink} />
      </mesh>
    </group>
  );
}

interface Props {
  result: ScheduleResult;
  /** Current sweep time in ticks, read every frame. */
  timeRef: React.RefObject<number>;
  viewKey: string;
}

/**
 * Process lanes run back→front; time runs left→right. Waiting time is the pale strip between
 * arrival and completion, CPU time is the solid block on top, and the front lane is the CPU itself.
 */
export default function TimelineScene({ result, timeRef, viewKey }: Props) {
  const rows = result.rows;
  const span = Math.max(1, result.makespan);
  const unit = Math.min(1, 22 / span);
  const width = span * unit;
  const cpuZ = rows.length * LANE + 0.5;
  const depth = cpuZ + 1.4;
  const every = span <= 24 ? 1 : span <= 60 ? 5 : 10;

  return (
    <IsoStage
      view={{ min: [-2.6, -0.2, -1.2], max: [width + 0.6, 0.9, cpuZ + 1.3] }}
      viewKey={viewKey}
      azimuth={(18 * Math.PI) / 180}
      polar={(46 * Math.PI) / 180}
      shadowY={-0.22}
    >
      <Block size={[width + 3.6, 0.2, depth + 1.2]} position={[width / 2 - 1.0, -0.1, depth / 2 - 1.0]} color={palette.board} radius={0.15} />

      {rows.map((r, i) => {
        const z = i * LANE;
        const color = colorForPid(r.pid);
        return (
          <group key={r.pid}>
            <Block size={[width, 0.03, 0.86]} position={[width / 2, 0.015, z]} color={palette.tileEmpty} radius={0.02} />
            <Label flat anchorX="right" position={[-0.3, 0.02, z]} size={0.34} bold>
              {r.name}
            </Label>
            {/* waiting = in the system but not on the CPU */}
            <Segment start={r.arrival} end={r.completion} unit={unit} z={z} color={new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.62).getStyle()} h={0.08} timeRef={timeRef} />
            {/* arrival flag */}
            <group position={[r.arrival * unit, 0, z - 0.32]}>
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.025, 0.025, 0.6, 4]} />
                <meshStandardMaterial color={palette.inkSoft} />
              </mesh>
              <mesh position={[0.12, 0.5, 0]}>
                <boxGeometry args={[0.24, 0.16, 0.02]} />
                <meshStandardMaterial color={color} />
              </mesh>
            </group>
          </group>
        );
      })}

      {result.segments.map((s, i) =>
        s.pid === null ? null : (
          <group key={i}>
            <Segment start={s.start} end={s.end} unit={unit} z={rows.findIndex((r) => r.pid === s.pid) * LANE} color={colorForPid(s.pid)} h={0.42} timeRef={timeRef} />
            <Segment start={s.start} end={s.end} unit={unit} z={cpuZ} color={colorForPid(s.pid)} h={0.6} timeRef={timeRef} label={`P${s.pid}`} />
          </group>
        ),
      )}

      <Block size={[width, 0.05, 0.96]} position={[width / 2, 0.025, cpuZ]} color={palette.chip} radius={0.03} />
      <Label flat anchorX="right" position={[-0.3, 0.02, cpuZ]} size={0.38} bold>
        CPU
      </Label>
      {Array.from({ length: Math.floor(span / every) + 1 }, (_, i) => i * every).map((t) => (
        <Label key={t} flat position={[t * unit, 0.02, cpuZ + 0.8]} size={0.28} color={palette.inkSoft}>
          {String(t)}
        </Label>
      ))}
      <Cursor timeRef={timeRef} unit={unit} depth={depth} />
    </IsoStage>
  );
}
