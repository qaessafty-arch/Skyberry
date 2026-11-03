"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Pet3D, type PetProps, type Mood } from "./Pet3D";

const HOME_BG: Record<string, [string, string]> = {
  aquarium: ["#0a7bd6", "#052a52"], "coral-reef": ["#14b8c8", "#0a3d6b"], "glass-dome": ["#38bdf8", "#041e3d"], "ocean-palace": ["#6d5bff", "#07204a"],
};

function Bubbles({ n, still }: { n: number; still?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: n }, () => [Math.random() * 6 - 3, Math.random() * 4 - 2, Math.random() * 2 - 3, Math.random() * 0.6 + 0.3] as const), [n]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    seeds.forEach(([x, y, z, sp], i) => {
      dummy.position.set(x + Math.sin(clock.elapsedTime + i) * 0.1, still ? y : ((y + clock.elapsedTime * sp + 2) % 4) - 2, z);
      dummy.scale.setScalar(0.04 + (i % 4) * 0.02);
      dummy.updateMatrix(); ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, n]}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#cdeeff" transparent opacity={0.5} /></instancedMesh>;
}

/** Adaptive resolution: if the average FPS drops, render at a lower pixel ratio. */
function Adaptive() {
  const acc = useRef({ t: 0, n: 0 });
  useFrame(({ setDpr }, dt) => {
    const a = acc.current; a.t += dt; a.n++;
    if (a.t > 2) { const fps = a.n / a.t; setDpr(fps < 30 ? 0.75 : fps < 48 ? 1 : Math.min(2, window.devicePixelRatio)); a.t = 0; a.n = 0; }
  });
  return null;
}

export interface StageProps extends Omit<PetProps, "mood" | "onPoke" | "quality"> {
  home?: string;
  mood?: Mood;
  lowPower?: boolean;
  height?: number | string;
  /** Poke reactions are local and brief; they never block anything. */
  interactive?: boolean;
}

export function PetStage({ home = "aquarium", mood = "idle", lowPower, reducedMotion, height = 320, interactive = true, ...pet }: StageProps) {
  const [poked, setPoked] = useState(false);
  useEffect(() => { if (!poked) return; const t = setTimeout(() => setPoked(false), 1600); return () => clearTimeout(t); }, [poked]);
  const [top, bottom] = HOME_BG[home] ?? HOME_BG.aquarium;
  const still = reducedMotion || false;
  return (
    <div style={{ height, borderRadius: 24, overflow: "hidden", background: `linear-gradient(${top}, ${bottom})`, touchAction: "pan-y" }} aria-label={`3D pet, feeling ${poked ? "giggly" : mood}`} role="img">
      <Canvas dpr={lowPower ? 0.75 : [1, 2]} frameloop={still ? "always" : "always"} camera={{ position: [0, 0.5, 5.6], fov: 38 }} gl={{ antialias: !lowPower, powerPreference: lowPower ? "low-power" : "high-performance" }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 4]} intensity={1.6} />
        <pointLight position={[-3, -1, 2]} intensity={12} color="#7fe9ff" />
        {!still && <Bubbles n={lowPower ? 8 : 28} />}
        <Pet3D {...pet} reducedMotion={reducedMotion} quality={lowPower ? 0 : 1} mood={poked ? "laugh" : mood} onPoke={interactive ? () => setPoked(true) : undefined} />
        {!lowPower && <Adaptive />}
      </Canvas>
    </div>
  );
}
