import type { Metadata } from 'next';
import SyncLab from '@/components/labs/sync/SyncLab';

export const metadata: Metadata = { title: 'Producer–Consumer Lab · OS Visualizer 3D' };

export default function Page() {
  return <SyncLab />;
}
