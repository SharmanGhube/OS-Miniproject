import type { Metadata } from 'next';
import BankersLab from '@/components/labs/bankers/BankersLab';

export const metadata: Metadata = { title: "Banker's Algorithm Lab · OS Visualizer 3D" };

export default function Page() {
  return <BankersLab />;
}
