import { useRef, useMemo, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/examples/jsm/objects/Lensflare.js";

// DRACOデコーダーの設定 (モジュールロード時に1回のみ)[cite: 1]
useGLTF.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

// SSR (Astro/Cloudflare Worker) 環境安全なキャンバステクスチャ生成
function createGlowTexture(size: number, inner: string, outer: string): THREE.CanvasTexture {
  if (typeof document === "undefined") return new THREE.CanvasTexture();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function FlareLight() {
  const { texMain, texBlob, lensflare } = useMemo(() => {
    const texMain = createGlowTexture(256, "rgba(255,255,255,1)", "rgba(120,170,255,0)");
    const texBlob = createGlowTexture(64, "rgba(200,225,255,0.9)", "rgba(0,0,0,0)");
    const lf = new Lensflare();
    lf.addElement(new LensflareElement(texMain, 480, 0, new THREE.Color(0.9, 0.95, 1.0)));
    lf.addElement(new LensflareElement(texBlob, 90, 0.45));
    lf.addElement(new LensflareElement(texBlob, 60, 0.6));
    lf.addElement(new LensflareElement(texBlob, 110, 0.75));
    lf.addElement(new LensflareElement(texBlob, 50, 0.88));
    lf.addElement(new LensflareElement(texBlob, 75, 1.0));
    return { texMain, texBlob, lensflare: lf };
  }, []);

  useEffect(() => {
    return () => {
      texMain.dispose();
      texBlob.dispose();
      lensflare.dispose();
    };
  }, [texMain, texBlob, lensflare]);

  return (
    <pointLight position={[5, 5, 5]} intensity={80} color="#ffffff" distance={100} decay={2}>
      <primitive object={lensflare} />
    </pointLight>
  );
}

function Crystal() {
  const groupRef = useRef<THREE.Group>(null!);
  const { size } = useThree();

  // Dreiフックによるアセット保持と標準キャッシュ[cite: 1, 2]
  const texture = useTexture("/images/sample_pic.jpg");
  const { scene } = useGLTF("/images/source_logo.glb");

  const responsiveScale = useMemo(() => {
    const minWidth = 320;
    const maxWidth = 1280;
    const minScale = 0.5;
    const maxScale = 1.0;
    const t = Math.min(1, Math.max(0, (size.width - minWidth) / (maxWidth - minWidth)));
    return minScale + t * (maxScale - minScale);
  }, [size.width]);

  const { bgMap, envMap } = useMemo(() => {
    const bg = texture.clone();
    bg.colorSpace = THREE.SRGBColorSpace;

    const env = texture.clone();
    env.mapping = THREE.EquirectangularRefractionMapping;
    env.colorSpace = THREE.SRGBColorSpace;

    return { bgMap: bg, envMap: env };
  }, [texture]);

  useEffect(() => {
    return () => {
      bgMap.dispose();
      envMap.dispose();
    };
  }, [bgMap, envMap]);

  const crystalMat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      envMap,
      envMapIntensity: 0.4,
      transmission: 1.0,
      roughness: 0.03,
      metalness: 0,
      ior: 1 / 0.67,
      thickness: 3.5,
      attenuationDistance: 4.0,
      attenuationColor: "#cce8ff",
      clearcoat: 0.6,
      clearcoatRoughness: 0.05,
      color: "#f0f8ff",
      side: THREE.FrontSide,
    });
  }, [envMap]);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = crystalMat;
      }
    });

    return () => {
      crystalMat.dispose();
    };
  }, [scene, crystalMat]);

  useFrame((_state, delta) => {
    groupRef.current.rotation.x += delta * 0.14;
    groupRef.current.rotation.y += delta * 0.20;
    groupRef.current.rotation.z += delta * 0.06;
  });

  return (
    <>
      <mesh renderOrder={-1}>
        <sphereGeometry args={[40, 64, 32]} />
        <meshBasicMaterial map={bgMap} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      <group ref={groupRef} scale={responsiveScale}>
        <primitive object={scene} />
      </group>
    </>
  );
}

function CameraRig() {
  const { camera, pointer } = useThree();

  useFrame(() => {
    const targetX = pointer.x * 0.6;
    const targetY = pointer.y * 0.35;

    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function ChrystalEffect() {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 1.75]}
    >
      <ambientLight intensity={0.9} />
      <FlareLight />
      <directionalLight position={[-3, -2, -3]} intensity={0.5} color="#a0c4ff" />
      <Suspense fallback={null}>
        <Crystal />
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}