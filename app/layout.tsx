import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';
import { cssVars } from '@/lib/palette';
import NavBar from '@/components/ui/NavBar';

export const metadata: Metadata = {
  title: 'OS Visualizer 3D',
  description: 'Watch a tiny computer schedule, page and run processes, in 3D.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={cssVars() as React.CSSProperties}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
