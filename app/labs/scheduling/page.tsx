import type { Metadata } from 'next';
import SchedulingLab from '@/components/labs/scheduling/SchedulingLab';

export const metadata: Metadata = { title: 'CPU Scheduling Lab · OS Visualizer 3D' };

export default function Page() {
  return <SchedulingLab />;
}
