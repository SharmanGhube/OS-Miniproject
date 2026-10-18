'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './ui.module.css';

const LINKS = [
  { href: '/computer', label: 'Computer' },
  { href: '/labs/scheduling', label: 'Scheduling' },
  { href: '/labs/page-replacement', label: 'Page Replacement' },
  { href: '/labs/memory', label: 'Memory' },
  { href: '/labs/sync', label: 'Sync' },
  { href: '/labs/bankers', label: "Banker's" },
  { href: '/labs/deadlock', label: 'Deadlock' },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <header className={styles.nav}>
      <Link href="/" className={styles.brand}>
        <span className={styles.logo} aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </span>
        OS Visualizer <em>3D</em>
      </Link>
      <nav className={styles.navLinks}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? styles.active : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
