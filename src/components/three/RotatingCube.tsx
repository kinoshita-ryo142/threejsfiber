import { useRef, useMemo } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

const BASE_COLOR = new THREE.Color("#3b82f6");
const HOVER_COLOR = new THREE.Color("#f59e0b");

function Cube() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const hoveredFaceRef = useRef<number>(-1);

  const materials = useMemo(
    () =>
      Array.from(
        { length: 6 },
        () =>
          new THREE.MeshStandardMaterial({
            color: BASE_COLOR.clone(),
            metalness: 0.3,
            roughness: 0.4,
          })
      ),
    []
  );

  useFrame((_state, delta) => {
    meshRef.current.rotation.x += delta * 0.5;
    meshRef.current.rotation.y += delta * 0.8;
  });

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.faceIndex == null) return;
    const faceIndex = Math.floor(e.faceIndex / 2);
    if (faceIndex !== hoveredFaceRef.current) {
      if (hoveredFaceRef.current >= 0) {
        materials[hoveredFaceRef.current].color.copy(BASE_COLOR);
      }
      materials[faceIndex].color.copy(HOVER_COLOR);
      hoveredFaceRef.current = faceIndex;
    }
  };

  const handlePointerLeave = () => {
    if (hoveredFaceRef.current >= 0) {
      materials[hoveredFaceRef.current].color.copy(BASE_COLOR);
      hoveredFaceRef.current = -1;
    }
  };

  return (
    <mesh
      ref={meshRef}
      material={materials}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <boxGeometry args={[2, 2, 2]} />
    </mesh>
  );
}

export default function RotatingCube() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.5} />
      <directionalLight position={[-3, -3, -3]} intensity={0.3} color="#93c5fd" />
      <Cube />
    </Canvas>
  );
}
