'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { switchVisible } from '@/lib/os/kernel';
import { PRESETS, type PresetId } from '@/lib/os/workload';
import { palette } from '@/lib/palette';
import { Panel } from '@/components/ui/ui';
import GanttChart from '@/components/charts/GanttChart';
import { usePlayback } from '@/hooks/usePlayback';
import { useCurrent, useSim, type CameraViewId } from '@/store/simStore';
import ControlBar from './ControlBar';
import StateDiagram from './StateDiagram';
import PcbDrawer from './PcbDrawer';
import { EventLog, Metrics, QueuesView } from './InfoPanels';
import styles from './computer.module.css';
import threeStyles from '@/components/three/three.module.css';

const ComputerScene = dynamic(() => import('@/components/computer3d/ComputerScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading}>Booting the 3D board…</div>,
});

const VIEWS: { id: CameraViewId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cpu', label: 'CPU' },
  { id: 'memory', label: 'Memory' },
];

export default function Dashboard() {
  usePlayback();
  // Deep links for demos: /computer?preset=memory&play=1
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get('preset') as PresetId | null;
    if (id && id in PRESETS) useSim.getState().load(id);
    if (q.get('play') === '1') useSim.getState().setPlaying(true);
  }, []);
  const s = useCurrent();
  const presetId = useSim((x) => x.presetId);
  const view = useSim((x) => x.cameraView);
  const setView = useSim((x) => x.setCameraView);
  const sw = switchVisible(s) ? s.lastSwitch : null;

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1>Virtual Computer</h1>
          <p>
            {PRESETS[presetId].description} Click a process token to open its PCB. Drag to orbit, scroll to zoom.
          </p>
        </div>
      </div>

      <ControlBar />

      <div className={styles.layout}>
        <div className={styles.stageWrap}>
          <ComputerScene state={s} view={view} />
          <div className={styles.views} role="group" aria-label="Camera">
            {VIEWS.map((v) => (
              <button key={v.id} className={view === v.id ? styles.viewOn : undefined} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          {sw && (
            <div className={styles.ctxBanner} style={{ borderColor: palette.ctx }}>
              <strong>Context switch</strong>
              {sw.from !== null ? (
                <>
                  saving PCB of <b style={{ color: s.processes[sw.from]?.color }}>P{sw.from}</b> →
                </>
              ) : null}{' '}
              loading PCB of <b style={{ color: s.processes[sw.to]?.color }}>P{sw.to}</b>
            </div>
          )}
          {s.lastFault && (
            <div className={styles.faultBanner}>
              Page fault: P{s.lastFault.pid} page {s.lastFault.page} → frame {s.lastFault.frame}
              {s.lastFault.evicted ? ` (evicted P${s.lastFault.evicted.pid}:${s.lastFault.evicted.page})` : ''}
            </div>
          )}
          <PcbDrawer s={s} />
        </div>

        <div className={styles.side}>
          <Panel title="Process states">
            <StateDiagram state={s} />
          </Panel>
          <Panel title="Queues">
            <QueuesView s={s} />
          </Panel>
        </div>
      </div>

      <div className={styles.lower}>
        <Panel title="Gantt chart (live)" className={styles.gantt}>
          <GanttChart segments={s.gantt} colorOf={(pid) => s.processes[pid]?.color ?? palette.idle} unit={16} follow />
        </Panel>
        <Panel title="Metrics">
          <Metrics s={s} />
        </Panel>
        <Panel title="Event log" className={styles.logPanel}>
          <EventLog s={s} />
        </Panel>
      </div>
    </main>
  );
}
