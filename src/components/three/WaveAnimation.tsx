import { useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SEGMENTS = 64;
const PLANE_SIZE = 12;

function WavePlane({ mouseRef }: { mouseRef: React.RefObject<THREE.Vector2> }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, SEGMENTS, SEGMENTS);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const mx = mouseRef.current?.x ?? 0;
    const my = mouseRef.current?.y ?? 0;
    const posAttr = meshRef.current.geometry.attributes.position;
    for (let i = 0; i <= SEGMENTS; i++) {
      for (let j = 0; j <= SEGMENTS; j++) {
        const idx = i * (SEGMENTS + 1) + j;
        const x = posAttr.getX(idx);
        const y = posAttr.getY(idx);
        // マウス位置からの距離を波紋の中心として使用
        const dx = x - mx;
        const dy = y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const z =
          Math.sin(dist * 0.8 - t * 2.0) * 0.6 * Math.exp(-dist * 0.08) +
          Math.sin(dist * 1.4 - t * 1.5) * 0.3 * Math.exp(-dist * 0.05);
        posAttr.setZ(idx, z);
      }
    }
    posAttr.needsUpdate = true;
    meshRef.current.geometry.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 3, 0, 0]}>
      <meshStandardMaterial
        color="#1ee8ce"
        wireframe={false}
        side={THREE.DoubleSide}
        metalness={0.2}
        roughness={0.6}
      />
    </mesh>
  );
}

export default function WaveAnimation() {
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // スクリーン座標をプレーン座標系（-6〜6）に変換
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mouseRef.current.set(nx * (PLANE_SIZE / 2), ny * (PLANE_SIZE / 2));
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }} onMouseMove={handleMouseMove}>
      <Canvas camera={{ position: [0, 5, 8], fov: 55 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={1.5} color="#6ee7b7" />
        <directionalLight position={[-5, -5, -5]} intensity={0.3} />
        <WavePlane mouseRef={mouseRef} />
      </Canvas>
    </div>
  );
}
