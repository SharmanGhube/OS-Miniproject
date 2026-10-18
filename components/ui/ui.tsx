'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

export function Button({
  variant = 'default',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }) {
  return <button {...rest} className={`${styles.btn} ${styles[variant]} ${className ?? ''}`} />;
}

export function Panel({
  title,
  actions,
  children,
  className,
  pad = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`${styles.panel} ${className ?? ''}`}>
      {(title || actions) && (
        <header className={styles.panelHead}>
          {title && <h3>{title}</h3>}
          {actions && <div className={styles.panelActions}>{actions}</div>}
        </header>
      )}
      <div className={pad ? styles.panelBody : undefined}>{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <select className={styles.select} value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 99,
  width = 56,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  width?: number;
  label?: string;
}) {
  return (
    <input
      type="number"
      className={styles.num}
      style={{ width }}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      aria-label={label}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value));
        if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
    />
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className={`${styles.stat} ${tone ? styles[tone] : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className={styles.chip} style={{ background: color }}>
      {children}
    </span>
  );
}

export function Banner({ tone, children }: { tone: 'good' | 'bad' | 'info' | 'warn'; children: ReactNode }) {
  return <div className={`${styles.banner} ${styles[`banner_${tone}`]}`}>{children}</div>;
}

export const fmt = (n: number, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));
