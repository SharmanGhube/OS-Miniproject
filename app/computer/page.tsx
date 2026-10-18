import type { Metadata } from 'next';
import Dashboard from '@/components/computer/Dashboard';

export const metadata: Metadata = { title: 'Virtual Computer · OS Visualizer 3D' };

export default function ComputerPage() {
  return <Dashboard />;
}
