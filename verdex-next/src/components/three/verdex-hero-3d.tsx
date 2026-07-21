"use client";

import { useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, MeshDistortMaterial, Sphere } from "@react-three/drei";
import * as THREE from "three";

function VerdexCrystal() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const ringRef1 = useRef<THREE.Mesh>(null!);
  const ringRef2 = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.18;
      meshRef.current.rotation.x = Math.sin(t * 0.12) * 0.15;
    }
    if (ringRef1.current) {
      ringRef1.current.rotation.z = t * 0.25;
      ringRef1.current.rotation.x = Math.PI / 3 + Math.sin(t * 0.08) * 0.05;
    }
    if (ringRef2.current) {
      ringRef2.current.rotation.z = -t * 0.18;
      ringRef2.current.rotation.x = Math.PI / 4;
    }
  });

  return (
    <group>
      {/* Main Verdex Diamond / Crystal */}
      <Float speed={1.2} rotationIntensity={0.1} floatIntensity={0.4}>
        <mesh ref={meshRef} scale={1.6}>
          <octahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial
            color="#24E596"
            emissive="#0A3320"
            emissiveIntensity={0.4}
            metalness={0.3}
            roughness={0.1}
            transparent
            opacity={0.88}
            transmission={0.2}
            thickness={1}
            envMapIntensity={1.5}
          />
        </mesh>
      </Float>

      {/* Inner glow sphere */}
      <Sphere args={[0.65, 32, 32]}>
        <meshStandardMaterial
          color="#57FFB3"
          emissive="#24E596"
          emissiveIntensity={0.6}
          transparent
          opacity={0.15}
        />
      </Sphere>

      {/* Orbit ring 1 */}
      <mesh ref={ringRef1} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[2.2, 0.015, 16, 120]} />
        <meshStandardMaterial
          color="#57FFB3"
          emissive="#24E596"
          emissiveIntensity={0.8}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Orbit ring 2 */}
      <mesh ref={ringRef2} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[2.9, 0.01, 16, 120]} />
        <meshStandardMaterial
          color="#22D3EE"
          emissive="#22D3EE"
          emissiveIntensity={0.6}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Particle nodes */}
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 2.2;
        const z = Math.sin(angle) * 2.2;
        return (
          <mesh key={i} position={[x, 0, z]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial
              color="#57FFB3"
              emissive="#24E596"
              emissiveIntensity={1.5}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[4, 4, 4]} intensity={1.5} color="#24E596" />
      <pointLight position={[-4, -2, -4]} intensity={0.8} color="#22D3EE" />
      <pointLight position={[0, -4, 2]} intensity={0.4} color="#57FFB3" />
      <Environment preset="night" />
      <VerdexCrystal />
    </>
  );
}

export function VerdexHero3D() {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
