'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { palette, processColors } from '@/lib/palette';
import { edgeKey, type DetectResult, type RAG } from '@/lib/os/deadlock/detection';
import IsoStage from '@/components/three/IsoStage';
import { Block, BlobShadow, Label, type Vec3 } from '@/components/three/primitives';

const PROC_Z = -2.4;
const RES_Z = 2.4;
const SPHERE_R = 0.5;
const SPHERE_Y = 0.75;

export const procX = (i: number, n: number) => (i - (n - 1) / 2) * 3.0;
export const resX = (j: number, m: number) => (j - (m - 1) / 2) * 3.3;
const resWidth = (instances: number) => Math.max(1.3, 0.38 * instances + 0.5);
const dotX = (k: number, instances: number) => (k - (instances - 1) / 2) * 0.38;

/** A curved edge with an arrowhead whose tip lands on `to`. */
function Arc({ from, to, lift, side, color, thick, faded }: { from: Vec3; to: Vec3; lift: number; side: number; color: string; thick: boolean; faded: boolean }) {
  const sig = `${from.join(',')}|${to.join(',')}`;
  const { geo, tip, quat } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += lift;
    mid.x += side;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const tangent = curve.getTangent(1).normalize();
    const g = new THREE.TubeGeometry(curve, 28, thick ? 0.05 : 0.03, 5, false);
    return { geo: g, tip: b.clone().addScaledVector(tangent, -0.16), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, lift, side, thick]);
  useEffect(() => () => geo.dispose(), [geo]);
  const mat = <meshStandardMaterial key={faded ? 'faded' : 'solid'} color={color} flatShading transparent={faded} opacity={faded ? 0.18 : 1} depthWrite={!faded} />;
  return (
    <group>
      <mesh geometry={geo}>{mat}</mesh>
      <mesh position={tip} quaternion={quat}>
        <coneGeometry args={[thick ? 0.15 : 0.12, 0.32, 6]} />
        {mat}
      </mesh>
    </group>
  );
}

interface Props {
  g: RAG;
  result: DetectResult;
  step: number;
  showCycle: boolean;
  cycle: Set<string>;
}

export default function RagScene({ g, result, step, showCycle, cycle }: Props) {
  const n = g.processes.length;
  const m = g.resources.length;
  const checks = result.checks;
  const k = Math.min(step, checks.length - 1);
  const ended = checks.length === 0 || k >= checks.length - 1;
  const order = new Map<number, number>();
  checks.slice(0, k + 1).forEach((c) => c.canFinish && order.set(c.pid, order.size + 1));
  const checking = k >= 0 ? checks[k] : null;
  const released = (i: number) => !g.alive[i] || order.has(i) || (k >= 0 && result.initiallyFinished.includes(i));

  // which process holds each instance dot
  const dots = g.resources.map((r, j) => {
    const owners: (number | null)[] = [];
    g.processes.forEach((_, i) => {
      for (let c = 0; c < g.allocation[i][j]; c++) owners.push(i);
    });
    while (owners.length < r.instances) owners.push(null);
    return owners;
  });

  const width = Math.max(n * 3.0, m * 3.3) + 2.4;
  const procPos = (i: number): Vec3 => [procX(i, n), SPHERE_Y, PROC_Z];

  const edges: React.ReactNode[] = [];
  g.processes.forEach((_, i) => {
    g.resources.forEach((r, j) => {
      // request edges P → R (drawn per instance requested)
      for (let c = 0; c < Math.min(3, g.request[i][j]); c++) {
        const key = edgeKey(`P${i}`, `R${j}`);
        const on = showCycle && cycle.has(key);
        edges.push(
          <Arc
            key={`q${i}-${j}-${c}`}
            from={[procX(i, n) + 0.15, SPHERE_Y + 0.1, PROC_Z + SPHERE_R]}
            to={[resX(j, m) + (c - 1) * 0.2 + 0.25, 0.52, RES_Z - 0.45]}
            lift={1.3 + c * 0.35}
            side={0.4}
            color={on ? palette.fault : palette.accent}
            thick={on}
            faded={released(i)}
          />,
        );
      }
      // assignment edges R → P, starting at the instance dot
      dots[j].forEach((owner, d) => {
        if (owner !== i) return;
        const key = edgeKey(`R${j}`, `P${i}`);
        const on = showCycle && cycle.has(key);
        edges.push(
          <Arc
            key={`a${i}-${j}-${d}`}
            from={[resX(j, m) + dotX(d, r.instances), 0.66, RES_Z]}
            to={[procX(i, n) - 0.2, SPHERE_Y - 0.15, PROC_Z + SPHERE_R - 0.05]}
            lift={0.7 + d * 0.12}
            side={-0.45}
            color={on ? palette.fault : palette.ink}
            thick={on}
            faded={released(i)}
          />,
        );
      });
    });
  });

  return (
    <IsoStage view={{ min: [-width / 2, -0.3, PROC_Z - 1.6], max: [width / 2, 1.6, RES_Z + 1.5] }} viewKey={`${n}-${m}`} polar={(52 * Math.PI) / 180} azimuth={(14 * Math.PI) / 180} shadowY={-0.3}>
      <Block size={[width + 0.6, 0.3, RES_Z - PROC_Z + 4.0]} position={[0, -0.15, 0]} color={palette.board} radius={0.2} />
      <Label flat anchorX="left" position={[-width / 2 + 0.2, 0.01, PROC_Z - 1.25]} size={0.28} bold color={palette.inkSoft}>
        PROCESSES
      </Label>
      <Label flat anchorX="left" position={[-width / 2 + 0.2, 0.01, RES_Z + 1.2]} size={0.28} bold color={palette.inkSoft}>
        RESOURCES (dots = instances)
      </Label>

      {g.processes.map((name, i) => {
        const dead = !g.alive[i];
        const isChecking = checking?.pid === i;
        const deadlocked = ended && result.deadlocked.includes(i) && step >= 0;
        const pad = isChecking ? (checking!.canFinish ? palette.RUNNING : palette.fault) : order.has(i) ? '#CFEBDA' : deadlocked ? '#F6C9C2' : palette.surface;
        const [x, , z] = procPos(i);
        return (
          <group key={i} position={[x, 0, z]}>
            <Block size={[1.7, 0.14, 1.7]} position={[0, 0.07, 0]} color={pad} radius={0.08} />
            <BlobShadow radius={0.5} y={0.15} />
            <mesh position={[0, SPHERE_Y, 0]}>
              <icosahedronGeometry args={[SPHERE_R, 1]} />
              <meshStandardMaterial key={dead ? 'dead' : 'alive'} color={dead ? palette.idle : processColors[i % processColors.length]} flatShading transparent={dead} opacity={dead ? 0.4 : 1} />
            </mesh>
            <Label billboard position={[0, 1.65, 0]} size={0.36} bold color={dead ? palette.inkSoft : palette.ink}>
              {dead ? `${name} ✕` : order.has(i) ? `${name} ✓#${order.get(i)}` : deadlocked ? `${name} ⚠` : name}
            </Label>
          </group>
        );
      })}

      {g.resources.map((r, j) => {
        const w = resWidth(r.instances);
        return (
          <group key={j} position={[resX(j, m), 0, RES_Z]}>
            <Block size={[w, 0.5, 1.0]} position={[0, 0.25, 0]} color={palette.surface} radius={0.08} />
            {dots[j].map((owner, d) => {
              const free = owner === null || released(owner);
              return (
                <mesh key={d} position={[dotX(d, r.instances), 0.62, 0]}>
                  <icosahedronGeometry args={[0.14, 0]} />
                  <meshStandardMaterial color={free ? palette.tileEmpty : processColors[owner! % processColors.length]} flatShading />
                </mesh>
              );
            })}
            <Label flat position={[0, 0.01, 0.85]} size={0.32} bold>
              {r.name}
            </Label>
          </group>
        );
      })}

      {edges}
    </IsoStage>
  );
}
