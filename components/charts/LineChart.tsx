'use client';

import { palette } from '@/lib/palette';
import styles from './charts.module.css';

interface Props {
  xs: number[];
  series: { name: string; color: string; values: number[] }[];
  xLabel: string;
  yLabel: string;
  /** Points to circle (series index, x index), e.g. a Belady bump. */
  marks?: { series: number; index: number; note: string }[];
  ariaLabel: string;
}

/** Multi-series line chart (hand-made SVG). */
export default function LineChart({ xs, series, xLabel, yLabel, marks = [], ariaLabel }: Props) {
  const W = 520;
  const H = 230;
  const pad = { l: 38, r: 12, t: 14, b: 38 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, xs.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = Array.from(new Set([0, Math.round(max / 2), max]));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={ariaLabel}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={palette.line} />
            <text x={pad.l - 6} y={y(v) + 3} fontSize={10} textAnchor="end" fill={palette.inkSoft}>
              {v}
            </text>
          </g>
        ))}
        {xs.map((v, i) => (
          <text key={v} x={x(i)} y={H - pad.b + 14} fontSize={10} textAnchor="middle" fill={palette.inkSoft}>
            {v}
          </text>
        ))}
        <text x={(W + pad.l) / 2} y={H - 6} fontSize={11} textAnchor="middle" fill={palette.inkSoft}>
          {xLabel}
        </text>
        <text x={12} y={H / 2} fontSize={11} textAnchor="middle" fill={palette.inkSoft} transform={`rotate(-90 12 ${H / 2})`}>
          {yLabel}
        </text>
        {series.map((s) => (
          <g key={s.name}>
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={palette.surface} stroke={s.color} strokeWidth={2}>
                <title>{`${s.name}, ${xs[i]} → ${v}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {marks.map((m) => (
          <g key={`${m.series}-${m.index}`}>
            <circle cx={x(m.index)} cy={y(series[m.series].values[m.index])} r={9} fill="none" stroke={palette.fault} strokeWidth={2} />
            <text x={x(m.index)} y={y(series[m.series].values[m.index]) - 13} fontSize={10} fontWeight={700} textAnchor="middle" fill={palette.fault}>
              {m.note}
            </text>
          </g>
        ))}
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
