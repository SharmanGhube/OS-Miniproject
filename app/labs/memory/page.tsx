import type { Metadata } from 'next';
import MemoryLab from '@/components/labs/memory/MemoryLab';

export const metadata: Metadata = { title: 'Memory Partitioning Lab · OS Visualizer 3D' };

export default function Page() {
  return <MemoryLab />;
}
