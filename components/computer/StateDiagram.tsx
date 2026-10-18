'use client';

import { palette } from '@/lib/palette';
import type { ProcState, SimState } from '@/lib/os/types';

// Textbook layout: NEW and EXIT on top, READY ⇄ RUNNING in the middle, WAITING below.
const NODES: Record<ProcState, { x: number; y: number; label: string }> = {
  NEW: { x: 46, y: 30, label: 'NEW' },
  TERMINATED: { x: 254, y: 30, label: 'EXIT' },
  READY: { x: 82, y: 112, label: 'READY' },
  RUNNING: { x: 218, y: 112, label: 'RUNNING' },
  WAITING: { x: 150, y: 190, label: 'WAITING' },
};

const EDGES: { from: ProcState; to: ProcState; label: string; curve?: number; dx?: number; dy?: number }[] = [
  { from: 'NEW', to: 'READY', label: 'admit' },
  { from: 'READY', to: 'RUNNING', label: 'dispatch', curve: -22 },
  { from: 'RUNNING', to: 'READY', label: 'preempt', curve: -22, dy: 10 },
  { from: 'RUNNING', to: 'WAITING', label: 'I/O · fault', dx: 26, dy: 8 },
  { from: 'WAITING', to: 'READY', label: 'interrupt', dx: -26, dy: 8 },
  { from: 'RUNNING', to: 'TERMINATED', label: 'exit' },
];

/** Classic 5-state diagram with live counts; edges taken in the last tick light up. */
export default function StateDiagram({ state }: { state: SimState }) {
  const counts: Record<ProcState, number> = { NEW: 0, READY: 0, RUNNING: 0, WAITING: 0, TERMINATED: 0 };
  for (const p of Object.values(state.processes)) counts[p.state]++;
  const hot = new Set(state.lastTransitions.map((t) => `${t.from}>${t.to}`));
  // a CPU burst ending in I/O can also terminate straight from WAITING
  if (hot.has('WAITING>TERMINATED')) hot.add('RUNNING>TERMINATED');

  return (
    <svg viewBox="0 0 300 216" width="100%" role="img" aria-label="Process state diagram">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={palette.inkSoft} />
        </marker>
        <marker id="arrowHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={palette.ink} />
        </marker>
      </defs>
      {EDGES.map((e) => {
        const a = NODES[e.from];
        const b = NODES[e.to];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const r = 30;
        const x1 = a.x + ux * r;
        const y1 = a.y + uy * (r * 0.62);
        const x2 = b.x - ux * r;
        const y2 = b.y - uy * (r * 0.62);
        const c = e.curve ?? 0;
        const mx = (x1 + x2) / 2 - uy * c;
        const my = (y1 + y2) / 2 + ux * c;
        const on = hot.has(`${e.from}>${e.to}`);
        return (
          <g key={`${e.from}${e.to}`}>
            <path
              d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
              fill="none"
              stroke={on ? palette.ink : palette.line}
              strokeWidth={on ? 2.6 : 1.6}
              markerEnd={on ? 'url(#arrowHot)' : 'url(#arrow)'}
            />
            <text x={mx + (e.dx ?? 0)} y={my - 4 + (e.dy ?? 0)} fontSize={9} textAnchor="middle" fill={on ? palette.ink : palette.inkSoft} fontWeight={on ? 700 : 400}>
              {e.label}
            </text>
          </g>
        );
      })}
      {(Object.keys(NODES) as ProcState[]).map((k) => {
        const n = NODES[k];
        return (
          <g key={k}>
            <ellipse cx={n.x} cy={n.y} rx={36} ry={20} fill={palette[k]} stroke={palette.ink} strokeOpacity={0.25} />
            <text x={n.x} y={n.y - 2} fontSize={10} fontWeight={700} textAnchor="middle" fill={palette.ink}>
              {n.label}
            </text>
            <text x={n.x} y={n.y + 11} fontSize={10} textAnchor="middle" fill={palette.ink}>
              {counts[k]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
