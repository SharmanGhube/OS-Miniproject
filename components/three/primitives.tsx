'use client';

import { Billboard, RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import { createContext, forwardRef, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { palette } from '@/lib/palette';

export const FONT = '/fonts/Inter-SemiBold.woff';
export const FONT_BOLD = '/fonts/Inter-Bold.woff';

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- motion

/** Animation speed multiplier for damping (sim playback speed feeds this). */
export const MotionSpeed = createContext(1);

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Moves an object toward `target` every frame with critically-damped easing. While far from
 * the target it lifts up (an arc "hop"), so tokens travel over the board instead of through it.
 * This replaces Framer Motion's layoutId: give the object a new target and it flies there.
 */
export function useDampedPosition(target: Vec3, opts: { smooth?: number; hop?: number } = {}) {
  const ref = useRef<THREE.Group>(null);
  const speed = useContext(MotionSpeed);
  const reduced = useReducedMotion();
  const placed = useRef(false);
  const { smooth = 0.32, hop = 0.45 } = opts;

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    if (!placed.current || reduced) {
      g.position.set(...target);
      placed.current = true;
      return;
    }
    const dist = Math.hypot(g.position.x - target[0], g.position.z - target[2]);
    const lift = Math.min(1.6, dist * hop);
    easing.damp3(g.position, [target[0], target[1] + lift, target[2]], smooth / Math.max(0.25, speed), Math.min(delta, 0.1));
  });
  return ref;
}

/** Damps a scalar (e.g. a scale or opacity) toward `target`. */
export function useDampedValue(target: number, smooth = 0.25) {
  const value = useRef(target);
  const reduced = useReducedMotion();
  const speed = useContext(MotionSpeed);
  useFrame((_, delta) => {
    if (reduced) value.current = target;
    else easing.damp(value, 'current', target, smooth / Math.max(0.25, speed), Math.min(delta, 0.1));
  });
  return value;
}

// ---------------------------------------------------------------- shapes

interface BlockProps {
  size: Vec3;
  position?: Vec3;
  color: string;
  radius?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  onClick?: () => void;
  children?: ReactNode;
}

/** Rounded, flat-shaded pastel block. The basic brick of every scene. */
export const Block = forwardRef<THREE.Mesh, BlockProps>(function Block(
  { size, position = [0, 0, 0], color, radius = 0.07, opacity = 1, emissive = '#000000', emissiveIntensity = 0, onClick, children },
  ref,
) {
  return (
    <RoundedBox
      ref={ref}
      args={size}
      radius={Math.min(radius, Math.min(...size) / 2.01)}
      smoothness={2}
      position={position}
      onClick={
        onClick
          ? (e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      <meshStandardMaterial
        key={opacity < 1 ? 'see-through' : 'solid'}
        color={color}
        roughness={0.85}
        metalness={0}
        flatShading
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
      {children}
    </RoundedBox>
  );
});

interface LabelProps {
  children: string;
  position?: Vec3;
  size?: number;
  color?: string;
  /** Lay the text flat on the board instead of standing up. */
  flat?: boolean;
  billboard?: boolean;
  anchorX?: 'left' | 'center' | 'right';
  bold?: boolean;
  maxWidth?: number;
  rotationY?: number;
}

export function Label({
  children,
  position = [0, 0, 0],
  size = 0.32,
  color = palette.ink,
  flat = false,
  billboard = false,
  anchorX = 'center',
  bold = false,
  maxWidth,
  rotationY = 0,
}: LabelProps) {
  const text = (
    <Text
      font={bold ? FONT_BOLD : FONT}
      fontSize={size}
      color={color}
      anchorX={anchorX}
      anchorY="middle"
      maxWidth={maxWidth}
      textAlign={anchorX === 'right' ? 'right' : anchorX === 'left' ? 'left' : 'center'}
      rotation={flat ? [-Math.PI / 2, 0, rotationY] : [0, rotationY, 0]}
      position={billboard ? undefined : position}
    >
      {children}
    </Text>
  );
  return billboard ? <Billboard position={position}>{text}</Billboard> : text;
}

/** Soft blob shadow for objects resting on a surface. */
export function BlobShadow({ radius = 0.38, opacity = 0.16, y = 0.005 }: { radius?: number; opacity?: number; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <circleGeometry args={[radius, 16]} />
      <meshBasicMaterial color={palette.ink} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

interface PawnProps {
  color: string;
  selected?: boolean;
  dim?: boolean;
  scale?: number;
}

/** Low-poly process token: faceted base, body and head. */
export function Pawn({ color, selected = false, dim = false, scale = 1 }: PawnProps) {
  const mat = (
    <meshStandardMaterial key={dim ? 'dim' : 'solid'} color={color} roughness={0.7} flatShading transparent={dim} opacity={dim ? 0.55 : 1} />
  );
  return (
    <group scale={scale}>
      <BlobShadow />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.42, 0.52, 24]} />
          <meshBasicMaterial color={palette.ink} />
        </mesh>
      )}
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.14, 8]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.13, 0.25, 0.44, 8]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <icosahedronGeometry args={[0.21, 0]} />
        {mat}
      </mesh>
    </group>
  );
}

/** Flat pad / zone marker on the board. */
export function Pad({ size, position, color, opacity = 1 }: { size: [number, number]; position: Vec3; color: string; opacity?: number }) {
  return <Block size={[size[0], 0.06, size[1]]} position={position} color={color} radius={0.03} opacity={opacity} />;
}

// ---------------------------------------------------------------- effects

/** A small slab that flies from `from` to `to` once (PCB save/load, page loads). */
export function Flyer({ from, to, color, size = [0.7, 0.1, 0.5], vanish = false }: { from: Vec3; to: Vec3; color: string; size?: Vec3; vanish?: boolean }) {
  const [target, setTarget] = useState<Vec3>(from);
  const ref = useDampedPosition(target, { smooth: 0.28, hop: 0.35 });
  const body = useRef<THREE.Group>(null);
  const started = useRef(false);
  useFrame((_, d) => {
    const g = ref.current;
    if (!g) return;
    if (!started.current) {
      started.current = true;
      setTarget(to);
      return;
    }
    // once it has landed, shrink away so it doesn't hide what it delivered
    const near = Math.hypot(g.position.x - to[0], g.position.z - to[2]) < 0.08;
    if (vanish && near && body.current) body.current.scale.multiplyScalar(Math.max(0, 1 - d * 6));
  });
  return (
    <group ref={ref}>
      <group ref={body}>
        <Block size={size} color={color} radius={0.03} />
      </group>
    </group>
  );
}
