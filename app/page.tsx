import Link from 'next/link';
import Hero from '@/components/home/Hero';
import styles from './home.module.css';

const MODULES = [
  {
    href: '/computer',
    title: 'Virtual Computer',
    unit: 'Units I–II, IV',
    color: 'var(--c-RUNNING)',
    text: 'Processes are created, admitted, scheduled, paged and terminated on a 3D motherboard. Includes PCBs, context switches, device queues and page faults.',
  },
  {
    href: '/labs/scheduling',
    title: 'CPU Scheduling',
    unit: 'Unit II',
    color: 'var(--c-READY)',
    text: 'FCFS, SJF, SRTF, Round Robin and Priority as a 3D timeline. Shows CT, TAT, WT and RT per process, and compares all six policies.',
  },
  {
    href: '/labs/page-replacement',
    title: 'Page Replacement',
    unit: 'Unit IV',
    color: 'var(--c-WAITING)',
    text: "FIFO, LRU and OPT step by step as stacks of page cubes, alongside a textbook table and a live demonstration of Belady's anomaly.",
  },
  {
    href: '/labs/memory',
    title: 'Memory Partitioning',
    unit: 'Unit IV',
    color: 'var(--c-TERMINATED)',
    text: 'Fixed and dynamic partitions on a 3D RAM stick, with first, best and worst fit. Internal fragmentation shows as translucent waste, and Compact slides blocks together.',
  },
  {
    href: '/labs/sync',
    title: 'Producer–Consumer',
    unit: 'Unit III',
    color: 'var(--c-ctx)',
    text: 'A bounded ring buffer driven by the semaphores empty, full and mutex, executed one statement at a time. Switch them off to see a race corrupt the counter.',
  },
  {
    href: '/labs/bankers',
    title: "Banker's Algorithm",
    unit: 'Unit III',
    color: 'var(--c-NEW)',
    text: 'Deadlock avoidance with resource discs. Step through the safety algorithm, then make requests that are granted or denied.',
  },
  {
    href: '/labs/deadlock',
    title: 'Deadlock Detection',
    unit: 'Unit III',
    color: 'var(--c-fault)',
    text: 'Resource allocation graphs in 3D with cycle highlighting, the detection algorithm, the four necessary conditions, and recovery by abort or preempt.',
  },
];

const SOON = ['Readers–Writers', 'Thrashing & working-set chart', 'Disk scheduling (FCFS, SSTF, SCAN, C-SCAN)', 'Simulated shell (ps, kill, nice)'];

export default function Home() {
  return (
    <main className="page">
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={styles.kicker}>Operating Systems, made visible</span>
          <h1>A tiny computer you can watch think.</h1>
          <p>
            Follow a process from <b>fork</b> to <b>exit</b>: memory allocation, the ready queue, the CPU, I/O devices and page faults, all on
            one 3D board. Then take each algorithm apart in its own lab.
          </p>
          <div className={styles.ctas}>
            <Link href="/computer" className={styles.primary}>
              Open the Virtual Computer →
            </Link>
            <Link href="/labs/scheduling" className={styles.secondary}>
              Explore the labs
            </Link>
          </div>
        </div>
        <div className={styles.heroStage}>
          <Hero />
        </div>
      </section>

      <section className={styles.cards}>
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className={styles.card}>
            <span className={styles.dot} style={{ background: m.color }} />
            <h2>{m.title}</h2>
            <small>{m.unit}</small>
            <p>{m.text}</p>
            <span className={styles.go}>Open →</span>
          </Link>
        ))}
      </section>

      <section className={styles.soon}>
        <h3>Coming next</h3>
        <ul>
          {SOON.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <footer className={styles.footer}>OS Visualizer 3D · Next.js, three.js (React Three Fiber) and a pure TypeScript OS engine.</footer>
    </main>
  );
}
