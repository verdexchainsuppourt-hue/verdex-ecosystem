"use client";

/**
 * Interactive 3D Verdex crystal — the real brand emblem extruded,
 * orbited by blockchain rings, network nodes, validated blocks,
 * token particles and mining data streams. Subtle mouse response.
 * Rendered only on the client; callers lazy-load this module.
 */
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ---------- the real Verdex mark as an extruded crystal ---------- */
function useCrystalGeometry() {
  return useMemo(() => {
    const group: THREE.BufferGeometry[] = [];
    const mk = (pts: [number, number][]) => {
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.34, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3,
      });
      geo.center();
      return geo;
    };
    // Logo facets (from production SVG, viewBox 0 0 100 160), normalized & centered.
    const s = (x: number) => (x - 50) / 52;
    const sy = (y: number) => (80 - y) / 52;
    group.push(mk([[s(50), sy(0)], [s(95), sy(80)], [s(50), sy(55)], [s(5), sy(80)]]));
    group.push(mk([[s(50), sy(105)], [s(95), sy(80)], [s(50), sy(160)], [s(5), sy(80)]]));
    return group;
  }, []);
}

function Crystal() {
  const geos = useCrystalGeometry();
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.28) * 0.35;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.08;
  });
  return (
    <group ref={ref}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshPhysicalMaterial
            color={i === 0 ? "#2bd489" : "#24E596"}
            emissive={i === 0 ? "#0d5c37" : "#0a4a2d"}
            emissiveIntensity={0.55}
            metalness={0.62}
            roughness={0.22}
            clearcoat={0.75}
            clearcoatRoughness={0.3}
            transparent
            opacity={0.96}
          />
        </mesh>
      ))}
      {/* core glow */}
      <pointLight color="#57FFB3" intensity={14} distance={7} />
    </group>
  );
}

/* ---------- rotating rings ---------- */
function Ring({ radius, tilt, speed, color, opacity }: { radius: number; tilt: number; speed: number; color: string; opacity: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += speed * delta;
  });
  return (
    <mesh ref={ref} rotation={[tilt, 0, 0]}>
      <torusGeometry args={[radius, 0.012, 12, 128]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

/* ---------- network nodes + links ---------- */
function Nodes({ count = 7, radius = 2.35 }: { count?: number; radius?: number }) {
  const group = useRef<THREE.Group>(null);
  const nodes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        return { pos: new THREE.Vector3(Math.cos(a) * radius, Math.sin(a * 1.3) * 0.5, Math.sin(a) * radius), phase: i * 1.7 };
      }),
    [count, radius]
  );
  const lines = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    nodes.forEach((n, i) => {
      pts.push(new THREE.Vector3(0, 0, 0), n.pos);
      const next = nodes[(i + 1) % nodes.length];
      pts.push(n.pos, next.pos);
    });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return geo;
  }, [nodes]);

  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.elapsedTime * 0.08;
  });

  return (
    <group ref={group}>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#24E596" transparent opacity={0.16} />
      </lineSegments>
      {nodes.map((n, i) => (
        <mesh key={i} position={n.pos}>
          <sphereGeometry args={[0.045, 14, 14]} />
          <meshBasicMaterial color={i % 3 === 0 ? "#22D3EE" : "#57FFB3"} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- drifting token particles ---------- */
function Particles({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.6 + Math.random() * 2.4;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 4.4;
      arr[i * 3] = Math.cos(theta) * r;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(theta) * r;
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 0.03;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#57FFB3" size={0.035} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

/* ---------- validated blocks popping in ---------- */
function Blocks({ count = 6 }: { count?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        offset: i * 1.35,
        pos: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 5),
      })),
    [count]
  );
  useFrame(({ clock }) => {
    seeds.forEach((s, i) => {
      const m = refs.current[i];
      if (!m) return;
      const t = ((clock.elapsedTime + s.offset) % 6) / 6;
      const scale = t < 0.12 ? t / 0.12 : t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.25) : 1;
      m.scale.setScalar(0.12 * scale);
      m.rotation.y += 0.01;
      (m.material as THREE.MeshBasicMaterial).opacity = 0.5 * scale;
    });
  });
  return (
    <>
      {seeds.map((s, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={s.pos}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#22D3EE" wireframe transparent opacity={0.4} />
        </mesh>
      ))}
    </>
  );
}

/* ---------- mining data streams (vertical light trails) ---------- */
function Streams({ count = 5 }: { count?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2,
        radius: 1.7 + (i % 3) * 0.5,
        speed: 0.35 + (i % 4) * 0.12,
        offset: i * 0.9,
      })),
    [count]
  );
  useFrame(({ clock }) => {
    seeds.forEach((s, i) => {
      const m = refs.current[i];
      if (!m) return;
      const y = (((clock.elapsedTime * s.speed + s.offset) % 3.2) - 1.6);
      m.position.set(Math.cos(s.angle) * s.radius, y, Math.sin(s.angle) * s.radius);
      const fade = 1 - Math.abs(y / 1.6);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0, fade);
    });
  });
  return (
    <>
      {seeds.map((s, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <cylinderGeometry args={[0.008, 0.008, 0.5, 6]} />
          <meshBasicMaterial color={i % 2 ? "#57FFB3" : "#22D3EE"} transparent opacity={0.5} />
        </mesh>
      ))}
    </>
  );
}

/* ---------- scene root with subtle mouse response ---------- */
function Rig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ pointer }) => {
    if (!ref.current || reduced) return;
    ref.current.rotation.y += (pointer.x * 0.22 - ref.current.rotation.y) * 0.04;
    ref.current.rotation.x += (pointer.y * 0.12 - ref.current.rotation.x) * 0.04;
  });
  return <group ref={ref}>{children}</group>;
}

export default function CrystalScene({ particleCount = 90 }: { particleCount?: number }) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <Canvas
      camera={{ position: [0, 0.4, 6.2], fov: 42 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      aria-label="Interactive 3D Verdex crystal"
      role="img"
    >
      <ambientLight intensity={0.55} />
      <pointLight position={[5, 4, 4]} color="#24E596" intensity={26} distance={16} />
      <pointLight position={[-5, -2, 3]} color="#22D3EE" intensity={14} distance={14} />
      <Rig reduced={reduced}>
        <Crystal />
        <Ring radius={2.1} tilt={Math.PI / 2.25} speed={0.22} color="#24E596" opacity={0.5} />
        <Ring radius={2.6} tilt={Math.PI / 1.85} speed={-0.16} color="#22D3EE" opacity={0.3} />
        <Ring radius={3.1} tilt={Math.PI / 2.6} speed={0.1} color="#57FFB3" opacity={0.18} />
        <Nodes />
        <Particles count={particleCount} />
        <Blocks />
        <Streams />
      </Rig>
    </Canvas>
  );
}
