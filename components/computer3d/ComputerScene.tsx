'use client';

import { useMemo } from 'react';
import { palette } from '@/lib/palette';
import { SCHED_LABELS, type SimState } from '@/lib/os/types';
import { switchVisible } from '@/lib/os/kernel';
import IsoStage from '@/components/three/IsoStage';
import { Block, Flyer, Label, MotionSpeed, Pad, type Vec3 } from '@/components/three/primitives';
import { useSim, type CameraViewId } from '@/store/simStore';
import { BOARD, ZONES, cameraView, frameCenter, layoutComputer } from './layout';
import { CpuChip, DeviceStation, ProcessToken, RamGrid } from './parts';

function Board() {
  const w = BOARD.max[0] - BOARD.min[0];
  const d = BOARD.max[2] - BOARD.min[2];
  const cx = (BOARD.max[0] + BOARD.min[0]) / 2;
  const cz = (BOARD.max[2] + BOARD.min[2]) / 2;
  const { newPad, ready, exitTray, pcbTable } = ZONES;
  const laneLen = ready.step * (ready.perRow - 1) + 0.9;
  return (
    <group>
      <Block size={[w, 0.4, d]} position={[cx, -0.2, cz]} color={palette.board} radius={0.18} />

      <Pad size={newPad.size} position={[newPad.center[0], 0.03, newPad.center[2]]} color={palette.NEW} />
      <Label flat position={[newPad.center[0], 0.02, newPad.center[2] + newPad.size[1] / 2 + 0.4]} size={0.34} bold>
        NEW · job queue
      </Label>

      <Pad size={[laneLen, 1.95]} position={[ready.head[0] - (laneLen - 0.9) / 2, 0.03, ready.head[2] + 0.475]} color={palette.READY} />
      <Label flat position={[ready.head[0] - (laneLen - 0.9) / 2, 0.02, ready.head[2] + 1.85]} size={0.34} bold>
        READY queue
      </Label>

      {(['DISK', 'PRINTER'] as const).map((dev) => {
        const z = ZONES.devices[dev];
        const len = 4 * 0.92 + 0.9;
        return (
          <Pad
            key={dev}
            size={[len, 1.0]}
            position={[z.center[0] + z.dir * (1.25 + (len - 0.9) / 2), 0.03, z.center[2]]}
            color={palette.WAITING}
            opacity={0.85}
          />
        );
      })}
      <Label flat position={[-6.6, 0.02, -2.95]} size={0.3} color={palette.inkSoft} bold>
        WAITING · disk queue
      </Label>
      <Label flat position={[4.75, 0.02, -2.95]} size={0.3} color={palette.inkSoft} bold>
        WAITING · printer queue
      </Label>

      <Pad
        size={exitTray.size}
        position={[exitTray.origin[0] + ((exitTray.cols - 1) * exitTray.step) / 2, 0.03, exitTray.origin[2] + 0.31]}
        color={palette.TERMINATED}
      />
      <Label flat position={[exitTray.origin[0] + ((exitTray.cols - 1) * exitTray.step) / 2, 0.02, exitTray.origin[2] + 1.65]} size={0.34} bold>
        TERMINATED
      </Label>

      <Block size={[2.2, 0.3, 1.2]} position={[pcbTable.center[0], 0.15, pcbTable.center[2]]} color={palette.surface} radius={0.08} />
      {[0, 1, 2].map((i) => (
        <Block key={i} size={[1.7, 0.04, 0.22]} position={[pcbTable.center[0], 0.32, pcbTable.center[2] - 0.32 + i * 0.32]} color={palette.line} radius={0.02} />
      ))}
      <Label flat position={[pcbTable.center[0], 0.02, pcbTable.center[2] + 1.0]} size={0.3} bold>
        PCB table (kernel memory)
      </Label>
    </group>
  );
}

function SwitchEffects({ s }: { s: SimState }) {
  if (!s.lastSwitch || !switchVisible(s)) return null;
  const { from, to, startedAt } = s.lastSwitch;
  const cpu: Vec3 = [ZONES.cpu.center[0], ZONES.cpu.height + 0.15, ZONES.cpu.center[2]];
  const table: Vec3 = [ZONES.pcbTable.center[0], 0.45, ZONES.pcbTable.center[2]];
  return (
    <group>
      {from !== null && s.processes[from] && (
        <Flyer key={`save-${startedAt}`} from={[cpu[0] - 0.4, cpu[1], cpu[2]]} to={[table[0] - 0.4, table[1], table[2]]} color={s.processes[from].color} />
      )}
      <Flyer key={`load-${startedAt}`} from={[table[0] + 0.4, table[1], table[2]]} to={[cpu[0] + 0.4, cpu[1] + 0.1, cpu[2]]} color={s.processes[to].color} vanish />
    </group>
  );
}

function FaultEffect({ s }: { s: SimState }) {
  if (!s.lastFault) return null;
  const disk = ZONES.devices.DISK;
  const [x, , z] = frameCenter(s.lastFault.frame);
  return (
    <Flyer
      key={`fault-${s.clock}`}
      from={[disk.center[0], disk.height + 0.3, disk.center[2]]}
      to={[x, 0.55, z]}
      color={palette.fault}
      size={[0.4, 0.4, 0.4]}
      vanish
    />
  );
}

export default function ComputerScene({ state, view }: { state: SimState; view: CameraViewId }) {
  const selectedPid = useSim((s) => s.selectedPid);
  const select = useSim((s) => s.select);
  const speed = useSim((s) => s.speed);
  const { tokens, devices } = useMemo(() => layoutComputer(state), [state]);
  const cfg = state.config;
  const cpuLabel = `CPU · ${SCHED_LABELS[cfg.algo]}${cfg.algo === 'RR' ? ` q=${cfg.quantum}` : ''}`;

  return (
    <IsoStage view={cameraView(view, cfg.numFrames)} viewKey={`${view}-${cfg.numFrames}`}>
      <MotionSpeed.Provider value={speed}>
        <group>
          <Board />
          <CpuChip mode={state.cpuMode} label={cpuLabel} />
          <RamGrid frames={state.frames} processes={state.processes} clock={state.clock} faultFrame={state.lastFault?.frame ?? null} />
          {devices.map((d) => (
            <DeviceStation key={d.device} layout={d} color={d.device === 'DISK' ? palette.disk : palette.printer} />
          ))}
          {tokens.map((t) => (
            <ProcessToken key={t.pid} token={t} pcb={state.processes[t.pid]} selected={selectedPid === t.pid} onSelect={select} />
          ))}
          <SwitchEffects s={state} />
          <FaultEffect s={state} />
        </group>
      </MotionSpeed.Provider>
    </IsoStage>
  );
}
