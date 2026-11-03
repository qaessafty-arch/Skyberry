"use client";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Personality, SpeciesId } from "./catalog";

export type Mood = "idle" | "excited" | "sleep" | "laugh" | "dance" | "welcome" | "shy";

export interface PetProps {
  species: SpeciesId;
  colors: { body: string; accent: string };
  equipped?: string[];
  evolution?: number;
  mood?: Mood;
  personality?: Personality;
  reducedMotion?: boolean;
  /** 0 = low-power geometry, 1 = full */
  quality?: 0 | 1;
  onPoke?: () => void;
}

const PERSONA = {
  chaotic: { speed: 1.5, amp: 1.2, jitter: 0.08 }, sleepy: { speed: 0.55, amp: 0.7, jitter: 0 },
  funny: { speed: 1.1, amp: 1.2, jitter: 0.02 }, shy: { speed: 0.8, amp: 0.7, jitter: 0 },
  energetic: { speed: 1.4, amp: 1.1, jitter: 0.01 }, curious: { speed: 1, amp: 1, jitter: 0.01 },
  dramatic: { speed: 0.9, amp: 1.5, jitter: 0 }, friendly: { speed: 1, amp: 1, jitter: 0 },
} as const;

type Mat = { body: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial };

function useMats(colors: PetProps["colors"], evolution: number): Mat {
  return useMemo(() => {
    const glow = evolution >= 2;
    const mk = (c: string, k: number) =>
      new THREE.MeshStandardMaterial({
        color: c, roughness: 0.45, metalness: 0.05,
        emissive: glow ? new THREE.Color(c) : new THREE.Color("#000"), emissiveIntensity: glow ? 0.35 * k : 0,
      });
    return { body: mk(colors.body, 1), accent: mk(colors.accent, 0.5) };
  }, [colors.body, colors.accent, evolution]);
}

const S = ({ a, p, s = [1, 1, 1], m, seg = 24 }: { a?: THREE.Euler | [number, number, number]; p?: [number, number, number]; s?: [number, number, number]; m: THREE.Material; seg?: number }) => (
  <mesh position={p} scale={s} rotation={a as [number, number, number]} material={m} castShadow>
    <sphereGeometry args={[0.5, seg, Math.max(8, seg / 2)]} />
  </mesh>
);
const Cone = ({ p, r = [0, 0, 0], s = [1, 1, 1], m }: { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number]; m: THREE.Material }) => (
  <mesh position={p} rotation={r} scale={s} material={m}><coneGeometry args={[0.2, 0.5, 12]} /></mesh>
);

/** Expressive eyes with blinking and mood shapes. */
function Eyes({ y = 0, z = 0.4, gap = 0.2, size = 0.11, mood, blink }: { y?: number; z?: number; gap?: number; size?: number; mood: Mood; blink: React.RefObject<number> }) {
  const refs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  useFrame(() => {
    const closed = mood === "sleep" ? 0.08 : mood === "laugh" ? 0.25 : blink.current!;
    refs.forEach((r) => r.current && (r.current.scale.y = THREE.MathUtils.lerp(r.current.scale.y, closed, 0.4)));
  });
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.2 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0b1a33", roughness: 0.1 }), []);
  return (
    <>
      {[-1, 1].map((sx, i) => (
        <group key={i} ref={refs[i]} position={[sx * gap, y, z]}>
          <mesh material={white}><sphereGeometry args={[size, 16, 12]} /></mesh>
          <mesh position={[0, 0, size * 0.7]} material={dark}><sphereGeometry args={[size * 0.6, 12, 10]} /></mesh>
          <mesh position={[size * 0.2, size * 0.25, size * 1.2]}><sphereGeometry args={[size * 0.2, 8, 6]} /><meshBasicMaterial color="#fff" /></mesh>
        </group>
      ))}
      {/* cheeks + mouth */}
      <mesh position={[0, y - size * 1.5, z + 0.02]} rotation={[0, 0, Math.PI]} scale={mood === "sleep" || mood === "shy" ? 0.5 : mood === "laugh" ? 1.5 : 1}>
        <torusGeometry args={[size * 0.9, size * 0.12, 6, 14, Math.PI]} /><meshBasicMaterial color="#5b2a3a" />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (gap + size * 1.4), y - size, z - 0.04]} scale={[1, 0.6, 0.3]}>
          <sphereGeometry args={[size * 0.8, 10, 8]} /><meshBasicMaterial color="#ff8fb1" transparent opacity={0.55} />
        </mesh>
      ))}
    </>
  );
}

function Species({ species, m, mood, blink, q }: { species: SpeciesId; m: Mat; mood: Mood; blink: React.RefObject<number>; q: number }) {
  const seg = q ? 24 : 10;
  const tent = useRef<THREE.Group>(null);
  useFrame(({ clock }) => tent.current?.children.forEach((c, i) => { c.rotation.z = Math.sin(clock.elapsedTime * 2 + i) * 0.3; c.rotation.x = Math.cos(clock.elapsedTime * 1.5 + i) * 0.15; }));
  const b = m.body, a = m.accent;
  const eyes = (y: number, z: number, gap = 0.2, size = 0.11) => <Eyes y={y} z={z} gap={gap} size={size} mood={mood} blink={blink} />;
  switch (species) {
    case "axolotl":
      return (<>
        <S m={b} s={[1.1, 0.8, 1.5]} seg={seg} /><S m={b} p={[0, 0.15, 0.7]} s={[1, 0.8, 0.8]} seg={seg} />
        {eyes(0.25, 1.05, 0.28, 0.1)}
        {[-1, 1].map((sx) => [0, 1, 2].map((i) => <Cone key={`${sx}${i}`} m={a} p={[sx * 0.55, 0.3 + i * 0.12 - 0.1, 0.65]} r={[0, 0, sx * (-1.2 + i * 0.35)]} s={[0.6, 0.9, 0.6]} />))}
        <S m={b} p={[0, -0.1, -0.95]} s={[0.25, 0.4, 1]} seg={8} />
        {[-1, 1].map((sx) => <S key={sx} m={a} p={[sx * 0.5, -0.4, 0.3]} s={[0.25, 0.2, 0.4]} seg={8} />)}
      </>);
    case "shark":
      return (<>
        <S m={b} s={[0.9, 0.9, 2]} seg={seg} /><S m={a} p={[0, -0.18, 0.15]} s={[0.7, 0.55, 1.7]} seg={seg} />
        <Cone m={b} p={[0, 0.55, -0.1]} r={[-0.2, 0, 0]} s={[0.9, 1.2, 0.5]} />
        <Cone m={b} p={[0, 0.2, -1.1]} r={[Math.PI / 2 + 0.3, 0, 0]} s={[0.4, 1.6, 0.3]} />
        {[-1, 1].map((sx) => <Cone key={sx} m={b} p={[sx * 0.55, -0.2, 0.2]} r={[0, 0, sx * -1.9]} s={[0.7, 1.2, 0.3]} />)}
        {eyes(0.2, 0.9, 0.3, 0.12)}
      </>);
    case "jellyfish":
      return (<>
        <mesh material={b} scale={[1, 0.8, 1]}><sphereGeometry args={[0.7, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 1.7]} /></mesh>
        {eyes(0.1, 0.62, 0.22, 0.1)}
        <group ref={tent} position={[0, -0.1, 0]}>
          {[0, 1, 2, 3, 4, 5].map((i) => { const t = (i / 6) * Math.PI * 2; return <mesh key={i} position={[Math.cos(t) * 0.45, -0.5, Math.sin(t) * 0.45]} material={i % 2 ? a : b}><capsuleGeometry args={[0.05, 0.9, 4, 8]} /></mesh>; })}
        </group>
      </>);
    case "dolphin":
      return (<>
        <S m={b} s={[0.8, 0.85, 2]} seg={seg} /><S m={a} p={[0, -0.2, 0.2]} s={[0.6, 0.45, 1.6]} seg={seg} />
        <S m={b} p={[0, 0.0, 1.1]} s={[0.3, 0.3, 0.7]} seg={12} />
        <Cone m={b} p={[0, 0.55, -0.1]} r={[-0.5, 0, 0]} s={[0.7, 1.1, 0.4]} />
        {[-1, 1].map((sx) => <S key={sx} m={b} p={[sx * 0.4, -0.15, 1.0 - 0.7]} s={[0.1, 0.5, 0.3]} a={[0, 0, sx * 0.9]} seg={8} />)}
        {[-1, 1].map((sx) => <S key={sx} m={b} p={[sx * 0.35, 0.1, -1.15]} s={[0.7, 0.1, 0.35]} a={[0, 0, sx * -0.1]} seg={8} />)}
        {eyes(0.25, 0.75, 0.33, 0.09)}
      </>);
    case "turtle":
      return (<>
        <mesh material={a} position={[0, 0.1, 0]} scale={[1.2, 0.9, 1.4]}><sphereGeometry args={[0.6, seg, seg / 2, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <S m={b} s={[1.1, 0.25, 1.3]} p={[0, 0.05, 0]} seg={seg} /><S m={b} p={[0, 0.2, 0.85]} s={[0.55, 0.5, 0.6]} seg={seg} />
        {eyes(0.28, 1.06, 0.15, 0.08)}
        {[[-1, 0.4], [1, 0.4], [-1, -0.4], [1, -0.4]].map(([sx, z], i) => <S key={i} m={b} p={[sx * 0.65, 0, z]} s={[0.5, 0.15, 0.3]} a={[0, 0, sx * 0.3]} seg={8} />)}
      </>);
    case "whale":
      return (<>
        <S m={b} s={[1.4, 1.2, 2.4]} seg={seg} /><S m={a} p={[0, -0.25, 0.3]} s={[1.1, 0.7, 1.9]} seg={seg} />
        {[-1, 1].map((sx) => <S key={sx} m={b} p={[sx * 0.4, 0.2, -1.5]} s={[0.9, 0.12, 0.45]} a={[0, 0, sx * 0.3]} seg={8} />)}
        <S m={b} p={[0, 0.0, -1.3]} s={[0.4, 0.5, 1]} seg={8} />
        {eyes(0.2, 1.0, 0.45, 0.1)}
      </>);
    case "octopus":
      return (<>
        <S m={b} p={[0, 0.2, 0]} s={[1.1, 1.2, 1.1]} seg={seg} />
        {eyes(0.1, 0.5, 0.25, 0.12)}
        <group ref={tent} position={[0, -0.3, 0]}>
          {Array.from({ length: 8 }, (_, i) => { const t = (i / 8) * Math.PI * 2; return <mesh key={i} position={[Math.cos(t) * 0.5, -0.3, Math.sin(t) * 0.5]} rotation={[Math.sin(t) * 0.4, 0, -Math.cos(t) * 0.4]} material={i % 2 ? a : b}><capsuleGeometry args={[0.08, 0.7, 4, 8]} /></mesh>; })}
        </group>
      </>);
    case "penguin":
      return (<>
        <S m={new THREE.MeshStandardMaterial({ color: "#16233b" })} s={[0.95, 1.3, 0.85]} seg={seg} />
        <S m={a} p={[0, -0.05, 0.12]} s={[0.7, 1.0, 0.7]} seg={seg} />
        <Cone m={new THREE.MeshStandardMaterial({ color: "#ffb347" })} p={[0, 0.2, 0.47]} r={[Math.PI / 2, 0, 0]} s={[0.5, 0.5, 0.5]} />
        {eyes(0.35, 0.36, 0.18, 0.09)}
        {[-1, 1].map((sx) => <S key={sx} m={b} p={[sx * 0.5, -0.05, 0]} s={[0.15, 0.7, 0.35]} a={[0, 0, sx * 0.3]} seg={8} />)}
        {[-1, 1].map((sx) => <S key={sx} m={new THREE.MeshStandardMaterial({ color: "#ffb347" })} p={[sx * 0.25, -0.65, 0.3]} s={[0.35, 0.12, 0.55]} seg={8} />)}
      </>);
    case "spirit":
      return (<>
        <mesh material={b}><icosahedronGeometry args={[0.65, q ? 2 : 1]} /></mesh>
        <mesh scale={1.35}><icosahedronGeometry args={[0.65, 1]} /><meshStandardMaterial color={m.accent.color} transparent opacity={0.25} wireframe /></mesh>
        {eyes(0.05, 0.55, 0.22, 0.1)}
      </>);
    default: // custom
      return (<>
        <S m={b} s={[1.1, 1.2, 1.1]} seg={seg} />
        {[-1, 1].map((sx) => <Cone key={sx} m={a} p={[sx * 0.35, 0.65, 0]} r={[0, 0, sx * -0.35]} />)}
        {eyes(0.1, 0.5, 0.22, 0.11)}
        <S m={a} p={[0, -0.1, 0.45]} s={[0.6, 0.5, 0.3]} seg={12} />
      </>);
  }
}

function Accessories({ items, evolution, m }: { items: string[]; evolution: number; m: Mat }) {
  const wing = useRef<THREE.Group>(null);
  useFrame(({ clock }) => wing.current?.children.forEach((c, i) => (c.rotation.z = (i ? -1 : 1) * (0.5 + Math.sin(clock.elapsedTime * 8) * 0.35))));
  const has = (x: string) => items.includes(x);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffd166", metalness: 0.7, roughness: 0.25, emissive: "#ffb300", emissiveIntensity: 0.3 }), []);
  return (
    <>
      {has("bow") && <mesh position={[0.35, 0.75, 0.3]} material={new THREE.MeshStandardMaterial({ color: "#ff5c8a" })}><torusKnotGeometry args={[0.1, 0.04, 40, 6, 2, 3]} /></mesh>}
      {has("party-hat") && <Cone m={new THREE.MeshStandardMaterial({ color: "#ff7ad9" })} p={[0, 0.95, 0.1]} s={[1.2, 1.4, 1.2]} />}
      {has("sunglasses") && <group position={[0, 0.25, 1.0]}>{[-1, 1].map((s) => <mesh key={s} position={[s * 0.24, 0, 0]} scale={[1, 0.7, 0.25]}><sphereGeometry args={[0.17, 12, 10]} /><meshStandardMaterial color="#0b1a33" metalness={0.8} roughness={0.1} /></mesh>)}<mesh scale={[0.5, 0.05, 0.05]}><boxGeometry args={[0.3, 1, 1]} /><meshStandardMaterial color="#0b1a33" /></mesh></group>}
      {has("wings") && <group ref={wing} position={[0, 0.3, -0.2]}>{[-1, 1].map((s) => <mesh key={s} position={[s * 0.8, 0, 0]} scale={[0.9, 0.08, 0.5]} material={new THREE.MeshStandardMaterial({ color: "#fff", transparent: true, opacity: 0.85 })}><sphereGeometry args={[0.5, 12, 8]} /></mesh>)}</group>}
      {(has("crown") || evolution >= 3) && <mesh position={[0, 0.9, 0]} material={gold}><cylinderGeometry args={[0.28, 0.2, 0.2, 6]} /></mesh>}
      {has("aura") && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.3, 0.02, 8, 64]} /><meshBasicMaterial color={m.body.color} /></mesh>}
      {evolution >= 4 && <Stars color={m.accent.color} />}
    </>
  );
}

function Stars({ color }: { color: THREE.Color }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => g.current && (g.current.rotation.y = clock.elapsedTime * 0.8));
  return (
    <group ref={g}>
      {Array.from({ length: 6 }, (_, i) => { const t = (i / 6) * Math.PI * 2; return <mesh key={i} position={[Math.cos(t) * 1.4, Math.sin(t * 2) * 0.3 + 0.2, Math.sin(t) * 1.4]}><octahedronGeometry args={[0.09]} /><meshBasicMaterial color={color} /></mesh>; })}
    </group>
  );
}

/** One pet. Skeletal-style animation: a rig of nested groups driven per mood and personality. */
export function Pet3D({ species, colors, equipped = [], evolution = 0, mood = "idle", personality = "friendly", reducedMotion, quality = 1, onPoke }: PetProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const blink = useRef(1);
  const mats = useMats(colors, evolution);
  const P = PERSONA[personality];
  const scale = 0.8 + evolution * 0.1;

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime * P.speed;
    const A = reducedMotion ? 0.15 : P.amp;
    const r = root.current, bd = body.current;
    if (!r || !bd) return;
    // blink every ~3.5s
    blink.current = reducedMotion || mood === "sleep" ? 1 : (t % 3.5) < 0.12 ? 0.1 : 1;
    let y = Math.sin(t * 2) * 0.06 * A, rz = Math.sin(t) * 0.04 * A, ry = Math.sin(t * 0.6) * 0.15 * A, x = 0, sc = 1;
    switch (mood) {
      case "excited": y = Math.abs(Math.sin(t * 6)) * 0.35 * A; x = Math.sin(t * 1.5) * 0.4 * A; ry = Math.sin(t * 3) * 0.4 * A; break;
      case "dance": y = Math.abs(Math.sin(t * 5)) * 0.25 * A; rz = Math.sin(t * 5) * 0.35 * A; ry += t * 1.2 * (reducedMotion ? 0 : 1); break;
      case "laugh": y = Math.abs(Math.sin(t * 12)) * 0.12 * A; rz = Math.sin(t * 14) * 0.08 * A; break;
      case "welcome": y = Math.abs(Math.sin(t * 4)) * 0.45 * A; rz = Math.sin(t * 8) * 0.15 * A; break;
      case "sleep": y = Math.sin(t * 0.9) * 0.03; sc = 1 + Math.sin(t * 0.9) * 0.025; rz = 0.15; break;
      case "shy": ry = -0.7; sc = 0.9; break;
    }
    if (P.jitter && !reducedMotion) { x += (Math.random() - 0.5) * P.jitter; y += (Math.random() - 0.5) * P.jitter; }
    r.position.x = THREE.MathUtils.damp(r.position.x, x, 6, dt);
    r.position.y = THREE.MathUtils.damp(r.position.y, y, 10, dt);
    bd.rotation.z = THREE.MathUtils.damp(bd.rotation.z, rz, 8, dt);
    bd.rotation.y = mood === "dance" ? ry : THREE.MathUtils.damp(bd.rotation.y, ry, 6, dt);
    bd.scale.setScalar(THREE.MathUtils.damp(bd.scale.x, scale * sc, 8, dt));
  });

  return (
    <group ref={root} onClick={(e) => { e.stopPropagation(); onPoke?.(); }} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      <group ref={body}>
        <Species species={species} m={mats} mood={mood} blink={blink} q={quality} />
        <Accessories items={equipped} evolution={evolution} m={mats} />
        {mood === "sleep" && <Zs />}
      </group>
    </group>
  );
}

function Zs(): ReactNode {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => g.current?.children.forEach((c, i) => { const k = (clock.elapsedTime * 0.5 + i / 3) % 1; c.position.set(0.5 + k * 0.4, 0.8 + k * 0.8, 0); c.scale.setScalar(0.08 + k * 0.1); (c as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 1 - k; }));
  return <group ref={g}>{[0, 1, 2].map((i) => <mesh key={i}><octahedronGeometry args={[1]} /><meshBasicMaterial color="#cfe9ff" transparent /></mesh>)}</group>;
}
