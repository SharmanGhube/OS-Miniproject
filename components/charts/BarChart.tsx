'use client';

import { palette } from '@/lib/palette';
import styles from './charts.module.css';

interface Props {
  groups: string[];
  series: { name: string; color: string; values: number[] }[];
  highlight?: number;
  ariaLabel: string;
}

/** Grouped bar chart (hand-made SVG). */
export default function BarChart({ groups, series, highlight, ariaLabel }: Props) {
  const W = 640;
  const H = 230;
  const pad = { l: 34, r: 8, t: 12, b: 40 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const gw = (W - pad.l - pad.r) / groups.length;
  const bw = Math.min(22, (gw - 14) / series.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={ariaLabel}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(nice * f)} y2={y(nice * f)} stroke={palette.line} />
            <text x={pad.l - 6} y={y(nice * f) + 3} fontSize={10} textAnchor="end" fill={palette.inkSoft}>
              {+(nice * f).toFixed(1)}
            </text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const x0 = pad.l + gi * gw + (gw - bw * series.length) / 2;
          return (
            <g key={g}>
              {highlight === gi && <rect x={pad.l + gi * gw + 2} y={pad.t - 6} width={gw - 4} height={H - pad.t - pad.b + 6} fill={palette.bg} rx={6} />}
              {series.map((s, si) => (
                <g key={s.name}>
                  <rect x={x0 + si * bw} y={y(s.values[gi])} width={bw - 3} height={Math.max(0, y(0) - y(s.values[gi]))} fill={s.color} rx={3}>
                    <title>{`${g} · ${s.name}: ${+s.values[gi].toFixed(2)}`}</title>
                  </rect>
                  {bw >= 16 && (
                    <text x={x0 + si * bw + (bw - 3) / 2} y={y(s.values[gi]) - 3} fontSize={9} textAnchor="middle" fill={palette.ink}>
                      {+s.values[gi].toFixed(1)}
                    </text>
                  )}
                </g>
              ))}
              <text x={pad.l + gi * gw + gw / 2} y={H - pad.b + 16} fontSize={11} fontWeight={highlight === gi ? 700 : 500} textAnchor="middle" fill={palette.ink}>
                {g}
              </text>
            </g>
          );
        })}
      </svg>
      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
