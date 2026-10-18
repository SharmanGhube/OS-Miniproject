'use client';

import { palette, processColors } from '@/lib/palette';
import type { Frame, PCB } from '@/lib/os/types';
import IsoStage from '@/components/three/IsoStage';
import { Block, Pad, Pawn } from '@/components/three/primitives';
import { CpuChip, RamGrid } from '@/components/computer3d/parts';
import { ZONES } from '@/components/computer3d/layout';

// A static vignette built from the same parts as the Virtual Computer board.
const FRAMES: (Frame | null)[] = [
  { pid: 1, page: 0, loadedAt: 0, lastUsed: 0 },
  { pid: 2, page: 1, loadedAt: 0, lastUsed: 9 },
  { pid: 3, page: 0, loadedAt: 0, lastUsed: 0 },
  null,
  { pid: 1, page: 2, loadedAt: 0, lastUsed: 0 },
  { pid: 4, page: 0, loadedAt: 0, lastUsed: 0 },
  null,
  { pid: 2, page: 3, loadedAt: 0, lastUsed: 0 },
];
const PROCS = Object.fromEntries([1, 2, 3, 4].map((pid) => [pid, { pid, color: processColors[pid - 1] } as PCB]));

export default function HeroScene() {
  const ready = ZONES.ready.head;
  return (
    <IsoStage view={{ min: [-5.6, -0.4, -3.0], max: [9.4, 1.2, 3.4] }} autoRotate interactive={false} shadowY={-0.42}>
      <Block size={[14.2, 0.4, 6.6]} position={[1.9, -0.2, 0.2]} color={palette.board} radius={0.18} />
      <Pad size={[3.7, 1.0]} position={[ready[0] - 1.38, 0.03, ready[2]]} color={palette.READY} />
      {[0, 1, 2].map((i) => (
        <group key={i} position={[ready[0] - i * 0.92, 0.06, ready[2]]}>
          <Pawn color={processColors[i + 1]} />
        </group>
      ))}
      <CpuChip mode="USER" label="CPU" />
      <group position={[ZONES.cpu.center[0], ZONES.cpu.height + 0.06, ZONES.cpu.center[2]]}>
        <Pawn color={processColors[0]} />
      </group>
      <RamGrid frames={FRAMES} processes={PROCS} clock={10} faultFrame={null} />
    </IsoStage>
  );
}
