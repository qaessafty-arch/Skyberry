"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

export interface Node { id: string; name: string; streak: number; evolution: number; color: string; conversationId: string | null }
export type Theme = "galaxy" | "islands" | "underwater" | "neon" | "minimal";
const SKY: Record<Theme, [string, string]> = { galaxy: ["#0b1d51", "#02040f"], islands: ["#7cc8ff", "#d9f1ff"], underwater: ["#0a7bd6", "#041e3d"], neon: ["#10002b", "#00131f"], minimal: ["#eaf6ff", "#cfe6fa"] };

function Friend({ n, i, total, onOpen, still }: { n: Node; i: number; total: number; onOpen: (n: Node) => void; still: boolean }) {
  const g = useRef<THREE.Group>(null); const [hover, setHover] = useState(false);
  const a = (i / Math.max(total, 1)) * Math.PI * 2, r = 2.2 + (i % 3) * 0.6;
  useFrame(({ clock }) => { const t = still ? 0 : clock.elapsedTime; if (g.current) { g.current.position.set(Math.cos(a + t * 0.1) * r, Math.sin(t * 0.8 + i) * 0.15 + ((i % 2) - 0.5) * 0.6, Math.sin(a + t * 0.1) * r); g.current.scale.setScalar(THREE.MathUtils.damp(g.current.scale.x, hover ? 1.25 : 1, 8, 0.016)); } });
  const size = 0.35 + Math.min(n.evolution, 4) * 0.06;
  return (
    <group ref={g} onClick={() => onOpen(n)} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
      <mesh><sphereGeometry args={[size, 24, 18]} /><meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={0.25 + n.evolution * 0.1} roughness={0.35} /></mesh>
      <mesh position={[0, -size * 0.9, 0]} scale={[1, 0.25, 1]}><cylinderGeometry args={[size * 1.1, size * 0.5, size, 16]} /><meshStandardMaterial color="#7cf2d4" /></mesh>
    </group>
  );
}

export function UniverseScene({ nodes, theme, onOpen, lowPower, reducedMotion }: { nodes: Node[]; theme: Theme; onOpen: (n: Node) => void; lowPower?: boolean; reducedMotion?: boolean }) {
  const [top, bottom] = SKY[theme];
  const stars = useMemo(() => new Float32Array(Array.from({ length: (lowPower ? 150 : 600) * 3 }, () => (Math.random() - 0.5) * 30)), [lowPower]);
  return (
    <div style={{ height: 460, borderRadius: 24, overflow: "hidden", background: `linear-gradient(${top},${bottom})` }}>
      <Canvas dpr={lowPower ? 0.75 : [1, 2]} camera={{ position: [0, 3.2, 7], fov: 45 }} gl={{ antialias: !lowPower }}>
        <ambientLight intensity={1} /><directionalLight position={[4, 6, 3]} intensity={1.4} />
        {theme !== "minimal" && <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry><pointsMaterial size={0.05} color={theme === "neon" ? "#19e3ff" : "#fff"} /></points>}
        <mesh><sphereGeometry args={[0.7, 32, 24]} /><meshStandardMaterial color="#19e3ff" emissive="#0a84ff" emissiveIntensity={0.6} /></mesh>
        {nodes.map((n, i) => <Friend key={n.id} n={n} i={i} total={nodes.length} onOpen={onOpen} still={!!reducedMotion} />)}
      </Canvas>
    </div>
  );
}
