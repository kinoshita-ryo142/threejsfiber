
import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Lensflare, LensflareElement } from "three/addons/objects/Lensflare.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

function createGlowTexture(
  size: number,
  inner: string,
  outer: string
): THREE.CanvasTexture {
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
  const { texMain, texBlob } = useMemo(() => ({
    texMain: createGlowTexture(256, "rgba(255,255,255,1)", "rgba(120,170,255,0)"),
    texBlob: createGlowTexture(64, "rgba(200,225,255,0.9)", "rgba(0,0,0,0)"),
  }), []);

  const lensflare = useMemo(() => {
    const lf = new Lensflare();
    lf.addElement(new LensflareElement(texMain, 480, 0, new THREE.Color(0.9, 0.95, 1.0)));
    lf.addElement(new LensflareElement(texBlob, 90, 0.45));
    lf.addElement(new LensflareElement(texBlob, 60, 0.6));
    lf.addElement(new LensflareElement(texBlob, 110, 0.75));
    lf.addElement(new LensflareElement(texBlob, 50, 0.88));
    lf.addElement(new LensflareElement(texBlob, 75, 1.0));
    return lf;
  }, [texMain, texBlob]);

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
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const { size } = useThree();

  const responsiveScale = useMemo(() => {
    const minWidth = 320;
    const maxWidth = 1280;
    const minScale = 0.5;
    const maxScale = 1.0;
    const t = Math.min(1, Math.max(0, (size.width - minWidth) / (maxWidth - minWidth)));
    return minScale + t * (maxScale - minScale);
  }, [size.width]);

  // 背景・envMap 用テクスチャ
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load("/images/sample_pic.jpg", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
  }, []);

  // 圧縮 GLB ロード
  useEffect(() => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    gltfLoader.load("/images/source_logo.glb", (gltf) => {
      setScene(gltf.scene);
    });

    return () => {
      dracoLoader.dispose();
    };
  }, []);

  const { bgMap, envMap } = useMemo(() => {
    if (!texture) return { bgMap: null, envMap: null };

    const bg = texture.clone();
    bg.colorSpace = THREE.SRGBColorSpace;

    const env = texture.clone();
    env.mapping = THREE.EquirectangularRefractionMapping;
    env.colorSpace = THREE.SRGBColorSpace;

    return { bgMap: bg, envMap: env };
  }, [texture]);

  // GLB メッシュにクリスタルマテリアルを適用
  useEffect(() => {
    if (!scene || !envMap) return;

    const crystalMat = new THREE.MeshPhysicalMaterial({
      envMap,
      envMapIntensity: 0.4,        // 映り込みは控えめ
      transmission: 1.0,           // 完全透過
      roughness: 0.03,             // ほぼ鏡面、微細な散乱だけ残す
      metalness: 0,                // 金属感ゼロ
      ior: 1 / 0.67,               // refractionRatio: 0.67 相当 (≈ 1.49)
      thickness: 3.5,              // 内部厚み（屈折量に影響）
      attenuationDistance: 4.0,    // 内部を通る光の減衰距離
      attenuationColor: "#cce8ff", // 減衰時の色（青みがかった透明感）
      clearcoat: 0.6,
      clearcoatRoughness: 0.05,
      color: "#f0f8ff",            // ほぼ無色透明
      side: THREE.FrontSide,
    });

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = crystalMat;
      }
    });
  }, [scene, envMap]);

  useFrame((_state, delta) => {
    groupRef.current.rotation.x += delta * 0.14;
    groupRef.current.rotation.y += delta * 0.20;
    groupRef.current.rotation.z += delta * 0.06;
  });

  return (
    <>
      {/* 全天背景球 */}
      {bgMap && (
        <mesh renderOrder={-1}>
          <sphereGeometry args={[40, 64, 32]} />
          <meshBasicMaterial map={bgMap} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      )}

      {/* GLB モデル */}
      <group ref={groupRef} scale={responsiveScale}>
        {scene && <primitive object={scene} />}
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
      <Crystal />
      <CameraRig />
    </Canvas>
  );
}
