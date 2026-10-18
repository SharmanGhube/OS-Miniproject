import type { Metadata } from 'next';
import DeadlockLab from '@/components/labs/deadlock/DeadlockLab';

export const metadata: Metadata = { title: 'Deadlock Detection Lab · OS Visualizer 3D' };

export default function Page() {
  return <DeadlockLab />;
}
