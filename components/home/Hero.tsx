'use client';

import dynamic from 'next/dynamic';
import threeStyles from '@/components/three/three.module.css';

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <div className={threeStyles.loading} />,
});

export default function Hero() {
  return <HeroScene />;
}
