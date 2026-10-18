import type { Metadata } from 'next';
import PageReplacementLab from '@/components/labs/page-replacement/PageReplacementLab';

export const metadata: Metadata = { title: 'Page Replacement Lab · OS Visualizer 3D' };

export default function Page() {
  return <PageReplacementLab />;
}
