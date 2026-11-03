"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { backgroundMode, usePrefs } from "@/lib/usePrefs";

function Waves({ intensity }: { intensity: number }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(26, 14, 48, 28), []);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime * 0.5;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, (Math.sin(x * 0.5 + t) + Math.cos(y * 0.7 + t * 1.2)) * 0.25 * intensity);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh geometry={geo} rotation={[-1.1, 0, 0]} position={[0, -3.2, -4]}>
      <meshStandardMaterial color="#5fc4ff" transparent opacity={0.35} roughness={0.3} metalness={0.1} />
    </mesh>
  );
}

function Bubbles({ n, still }: { n: number; still: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () => Array.from({ length: n }, () => ({ x: Math.random() * 18 - 9, y: Math.random() * 12 - 6, z: Math.random() * -6 - 1, s: Math.random() * 0.25 + 0.1, v: Math.random() * 0.3 + 0.1 })),
    [n],
  );
  const d = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    seeds.forEach((b, i) => {
      d.position.set(b.x + (still ? 0 : Math.sin(clock.elapsedTime * 0.4 + i) * 0.2), still ? b.y : ((b.y + clock.elapsedTime * b.v + 6) % 12) - 6, b.z);
      d.scale.setScalar(b.s);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshStandardMaterial color="#ffffff" transparent opacity={0.28} roughness={0.05} />
    </instancedMesh>
  );
}

function Rays({ still }: { still: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.z = still ? 0 : Math.sin(clock.elapsedTime * 0.15) * 0.05;
  });
  return (
    <group ref={g} position={[0, 6, -6]}>
      {[-5, -2, 1.5, 4.5].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, 0.25]}>
          <planeGeometry args={[0.9 + (i % 2) * 0.6, 16]} />
          <meshBasicMaterial color="#bfeaff" transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

/** Parallax: the camera drifts toward the pointer / touch. */
function Parallax() {
  const { camera } = useThree();
  const p = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const h = (e: PointerEvent) => {
      p.current = { x: (e.clientX / innerWidth - 0.5) * 2, y: (e.clientY / innerHeight - 0.5) * 2 };
    };
    addEventListener("pointermove", h, { passive: true });
    return () => removeEventListener("pointermove", h);
  }, []);
  useFrame((_, dt) => {
    camera.position.x = THREE.MathUtils.damp(camera.position.x, p.current.x * 0.6, 2, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, -p.current.y * 0.4, 2, dt);
    camera.lookAt(0, 0, -3);
  });
  return null;
}

/** Drops resolution if frames get slow; after sustained slowness the parent falls back to the static "lite" scene. */
function Governor({ onSlow }: { onSlow: () => void }) {
  const a = useRef({ t: 0, n: 0, slow: 0 });
  useFrame(({ setDpr }, dt) => {
    const s = a.current;
    s.t += dt;
    s.n++;
    if (s.t > 2) {
      const fps = s.n / s.t;
      setDpr(fps < 40 ? 0.7 : 1);
      s.slow = fps < 28 ? s.slow + 1 : 0;
      if (s.slow >= 2) onSlow();
      s.t = 0;
      s.n = 0;
    }
  });
  return null;
}

export function OceanBackground() {
  const [prefs] = usePrefs();
  const [demoted, setDemoted] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const h = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  const mode = demoted ? "lite" : backgroundMode(prefs);
  if (mode === "off") return null;
  const full = mode === "full";
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", opacity: 0.35 + prefs.bgIntensity * 0.65 }}>
      <Canvas dpr={full ? [1, 1.5] : 0.75} frameloop={visible && full ? "always" : "demand"} camera={{ position: [0, 0, 5], fov: 55 }} gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} color="#e6f7ff" />
        <Rays still={!full} />
        {full && <Waves intensity={prefs.bgIntensity} />}
        <Bubbles n={full ? 36 : 12} still={!full} />
        {full && <Parallax />}
        {full && <Governor onSlow={() => setDemoted(true)} />}
      </Canvas>
    </div>
  );
}
