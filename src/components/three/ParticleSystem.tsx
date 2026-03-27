import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 3000;

function Particles() {
  const pointsRef = useRef<THREE.Points>(null!);
  const { pointer } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 10;
      positions[i3 + 1] = (Math.random() - 0.5) * 10;
      positions[i3 + 2] = (Math.random() - 0.5) * 10;
      const t = Math.random();
      colors[i3] = 0.5 + t * 0.5;
      colors[i3 + 1] = 0.4 + t * 0.2;
      colors[i3 + 2] = 1.0;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, []);

  useFrame((_state, delta) => {
    const targetRotationY = pointer.x * Math.PI;
    pointsRef.current.rotation.y += (targetRotationY - pointsRef.current.rotation.y) * 0.05;
    pointsRef.current.rotation.x += delta * 0.02;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial size={0.04} vertexColors sizeAttenuation />
    </points>
  );
}

export default function ParticleSystem() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 60 }}>
      <ambientLight intensity={0.2} />
      <Particles />
    </Canvas>
  );
}

