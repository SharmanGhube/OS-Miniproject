'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { AdaptiveDpr, CameraControls, ContactShadows } from '@react-three/drei';
import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { palette } from '@/lib/palette';
import styles from './three.module.css';

/** A world-space box the camera should frame. */
export interface StageView {
  min: [number, number, number];
  max: [number, number, number];
}

interface IsoStageProps {
  children: ReactNode;
  view: StageView;
  /** Change this key to re-fit the camera with a smooth transition. */
  viewKey?: string;
  azimuth?: number;
  polar?: number;
  shadowY?: number;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
  overlay?: ReactNode;
}

const DEG = Math.PI / 180;

/** Orthographic zoom that fits the projected box for a camera at (polar, azimuth). */
function fitZoom(view: StageView, polar: number, azimuth: number, width: number, height: number): number {
  const dir = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth);
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const center = new THREE.Vector3(...view.min).add(new THREE.Vector3(...view.max)).multiplyScalar(0.5);
  let mx = 0.001;
  let my = 0.001;
  for (const x of [view.min[0], view.max[0]])
    for (const y of [view.min[1], view.max[1]])
      for (const z of [view.min[2], view.max[2]]) {
        const c = new THREE.Vector3(x, y, z).sub(center);
        mx = Math.max(mx, Math.abs(c.dot(right)));
        my = Math.max(my, Math.abs(c.dot(up)));
      }
  return Math.min(width / (2 * mx * 1.06), height / (2 * my * 1.1));
}

function CameraRig({ view, viewKey, azimuth, polar, autoRotate, interactive }: Required<Omit<IsoStageProps, 'children' | 'className' | 'overlay' | 'shadowY'>>) {
  const ref = useRef<CameraControls>(null);
  const size = useThree((s) => s.size);
  const first = useRef(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const target = new THREE.Vector3(...view.min).add(new THREE.Vector3(...view.max)).multiplyScalar(0.5);
    const pos = new THREE.Vector3().setFromSphericalCoords(40, polar, azimuth).add(target);
    const smooth = !first.current;
    first.current = false;
    c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, smooth);
    c.zoomTo(fitZoom(view, polar, azimuth, size.width, size.height), smooth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, size.width, size.height]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !autoRotate) return;
    let raf = 0;
    const spin = () => {
      c.rotate(0.003, 0, false);
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  const zoomNow = fitZoom(view, polar, azimuth, size.width, size.height);
  return (
    <CameraControls
      ref={ref}
      makeDefault
      enabled={interactive}
      smoothTime={0.35}
      minPolarAngle={polar - 20 * DEG}
      maxPolarAngle={Math.min(polar + 15 * DEG, 80 * DEG)}
      minAzimuthAngle={autoRotate ? -Infinity : azimuth - 45 * DEG}
      maxAzimuthAngle={autoRotate ? Infinity : azimuth + 45 * DEG}
      minZoom={zoomNow * 0.6}
      maxZoom={zoomNow * 3.5}
    />
  );
}

/**
 * Shared isometric stage: orthographic camera, soft pastel lighting, contact shadows and
 * constrained orbit controls. Every 3D scene in the app renders inside one of these.
 */
export default function IsoStage({
  children,
  view,
  viewKey = 'default',
  azimuth = 20 * DEG,
  polar = 50 * DEG,
  shadowY = -0.45,
  autoRotate = false,
  interactive = true,
  className,
  overlay,
}: IsoStageProps) {
  return (
    <div className={`${styles.stage} ${className ?? ''}`}>
      <Canvas
        orthographic
        flat
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [20, 20, 20], zoom: 40, near: -200, far: 400 }}
        fallback={<div className={styles.fallback}>3D view needs WebGL. The panels below still work.</div>}
      >
        <hemisphereLight args={['#ffffff', palette.boardEdge, 1.6]} />
        <directionalLight position={[8, 14, 10]} intensity={1.6} />
        <directionalLight position={[-10, 6, -4]} intensity={0.35} />
        <ContactShadows position={[0, shadowY, 0]} opacity={0.32} scale={60} blur={2.6} far={8} resolution={512} color={palette.ink} />
        <CameraRig view={view} viewKey={viewKey} azimuth={azimuth} polar={polar} autoRotate={autoRotate} interactive={interactive} />
        <AdaptiveDpr pixelated={false} />
        {children}
      </Canvas>
      {overlay}
    </div>
  );
}
