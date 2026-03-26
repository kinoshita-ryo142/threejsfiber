import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SEGMENTS = 64;

function WavePlane() {
  const meshRef = useRef<THREE.Mesh>(null!);

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(12, 12, SEGMENTS, SEGMENTS);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const posAttr = meshRef.current.geometry.attributes.position;
    for (let i = 0; i <= SEGMENTS; i++) {
      for (let j = 0; j <= SEGMENTS; j++) {
        const idx = i * (SEGMENTS + 1) + j;
        const x = posAttr.getX(idx);
        const y = posAttr.getY(idx);
        const z =
          Math.sin(x * 0.8 + t * 1.5) * 0.5 +
          Math.sin(y * 0.6 + t * 1.2) * 0.4 +
          Math.sin((x + y) * 0.5 + t) * 0.3;
        posAttr.setZ(idx, z);
      }
    }
    posAttr.needsUpdate = true;
    meshRef.current.geometry.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 3, 0, 0]}>
      <meshStandardMaterial
        color="#34d399"
        wireframe={false}
        side={THREE.DoubleSide}
        metalness={0.2}
        roughness={0.6}
      />
    </mesh>
  );
}

export default function WaveAnimation() {
  return (
    <Canvas camera={{ position: [0, 5, 8], fov: 55 }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} color="#6ee7b7" />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} />
      <WavePlane />
    </Canvas>
  );
}
