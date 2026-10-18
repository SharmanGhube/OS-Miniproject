'use client';

import { useEffect, useRef } from 'react';
import { palette } from '@/lib/palette';
import styles from './charts.module.css';

export interface GanttSegLike {
  pid: number | null;
  kind?: 'RUN' | 'IDLE' | 'CS';
  start: number;
  end: number;
}

interface Props {
  segments: GanttSegLike[];
  colorOf: (pid: number) => string;
  labelOf?: (pid: number) => string;
  unit?: number;
  /** Keep the latest tick in view (live dashboard). */
  follow?: boolean;
  /** Draw a time cursor at this tick. */
  cursor?: number;
  ariaLabel?: string;
}

/** Hand-made SVG Gantt chart, shared by the dashboard and the Scheduling Lab. */
export default function GanttChart({ segments, colorOf, labelOf = (p) => `P${p}`, unit = 22, follow = false, cursor, ariaLabel = 'Gantt chart' }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const end = segments.length ? segments[segments.length - 1].end : 0;
  const width = Math.max(end * unit + 24, 120);
  const barY = 6;
  const barH = 30;
  const every = unit >= 18 ? 1 : unit >= 8 ? 5 : 10;

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [follow, end]);

  return (
    <div ref={scroller} className={styles.ganttScroll}>
      <svg width={width} height={62} role="img" aria-label={ariaLabel}>
        <defs>
          <pattern id="cs-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={palette.ctx} />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2" opacity="0.6" />
          </pattern>
        </defs>
        {segments.map((s, i) => {
          const x = 8 + s.start * unit;
          const w = (s.end - s.start) * unit;
          const kind = s.kind ?? (s.pid === null ? 'IDLE' : 'RUN');
          const fill = kind === 'CS' ? 'url(#cs-hatch)' : kind === 'IDLE' || s.pid === null ? palette.tileEmpty : colorOf(s.pid);
          const text = kind === 'CS' ? 'CS' : kind === 'IDLE' || s.pid === null ? '' : labelOf(s.pid);
          return (
            <g key={i}>
              <rect x={x} y={barY} width={w} height={barH} fill={fill} stroke={palette.ink} strokeOpacity={0.18} rx={3} />
              {text && w >= 18 && (
                <text x={x + w / 2} y={barY + barH / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={palette.ink}>
                  {text}
                </text>
              )}
            </g>
          );
        })}
        {Array.from({ length: end + 1 }, (_, t) =>
          t % every === 0 || t === end ? (
            <text key={t} x={8 + t * unit} y={54} textAnchor="middle" fontSize={10} fill={palette.inkSoft}>
              {t}
            </text>
          ) : null,
        )}
        {cursor !== undefined && (
          <line x1={8 + cursor * unit} x2={8 + cursor * unit} y1={2} y2={barY + barH + 4} stroke={palette.ink} strokeWidth={2} />
        )}
      </svg>
    </div>
  );
}
