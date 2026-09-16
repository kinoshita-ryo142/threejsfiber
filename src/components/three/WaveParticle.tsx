import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// 背景色（爽やかな水色）
const BACKGROUND_COLOR = "#bce2fa";

const ribbonVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uFreq;
  uniform float uAmp;
  uniform float uPhase;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // 両端に向かって細くする (uv.x: 0.0 ~ 1.0)
    float thickness = sin(uv.x * 3.14159265);
    pos.y *= pow(thickness, 0.7);

    // 波のY方向のうねり
    float wave = sin(uv.x * uFreq + uTime * uSpeed + uPhase) * uAmp;
    pos.y += wave;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const ribbonFragmentShader = /* glsl */ `
  uniform float uOpacity;

  void main() {
    // 縁のぼかしグラデーションを無くし、くっきりとした半透明のベタ塗りにする
    gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacity);
  }
`;

function Ribbon({ positionY, speed, freq, amp, phase, opacity, heightScale = 1 }: any) {
  const viewport = useThree((state) => state.viewport);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const width = viewport.width * 1.2;

  const geometry = useMemo(() => {
    const height = 0.55 * heightScale;
    return new THREE.PlaneGeometry(width, height, 128, 1);
  }, [width, heightScale]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uFreq: { value: freq },
      uAmp: { value: amp },
      uPhase: { value: phase },
      uOpacity: { value: opacity },
    }),
    [speed, freq, amp, phase, opacity]
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh geometry={geometry} position={[0, positionY, 0]}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={ribbonVertexShader}
        fragmentShader={ribbonFragmentShader}
      />
    </mesh>
  );
}

const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWidth;
  uniform float uLeft;
  attribute float aSize;
  attribute float aOpacity;
  attribute float aSpeed;
  attribute float aBobFreq;
  attribute float aBobAmp;
  attribute float aPhase;
  varying float vOpacity;

  void main() {
    vOpacity = aOpacity;

    // 右から左へ一定速度でループ移動
    float currentX = position.x - uTime * aSpeed;
    float x = mod(currentX - uLeft, uWidth) + uLeft;

    // 粒子ごとに異なる位相・周波数・振幅でゆったり上下に揺れる
    float y = position.y + sin(uTime * aBobFreq + aPhase) * aBobAmp;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, position.z, 1.0);
    
    // パースに応じたサイズ設定
    gl_PointSize = aSize * (15.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = /* glsl */ `
  varying float vOpacity;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float dist = length(centered);
    
    // 半径0.5より外側を捨てることで、境界をぼかさずくっきりした正円にする
    if (dist > 0.5) discard;
    
    gl_FragColor = vec4(1.0, 1.0, 1.0, vOpacity);
  }
`;

function Particles({ count = 35 }: { count?: number }) {
  const viewport = useThree((state) => state.viewport);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);

  const width = viewport.width * 1.3;
  const left = -width / 2;

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const speeds = new Float32Array(count);
    const bobFreqs = new Float32Array(count);
    const bobAmps = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = left + Math.random() * width;
      positions[i * 3 + 1] = (Math.random() - 0.5) * viewport.height * 0.75;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.2;

      sizes[i] = 3.0 + Math.random() * 5.0;
      opacities[i] = 0.25 + Math.random() * 0.6;
      speeds[i] = 0.1 + Math.random() * 0.2;

      bobFreqs[i] = 0.5 + Math.random() * 1.0;
      bobAmps[i] = 0.08 + Math.random() * 0.15;
      phases[i] = Math.random() * Math.PI * 2.0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute("aBobFreq", new THREE.BufferAttribute(bobFreqs, 1));
    geo.setAttribute("aBobAmp", new THREE.BufferAttribute(bobAmps, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return geo;
  }, [count, viewport.height, width, left]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWidth: { value: width },
      uLeft: { value: left },
    }),
    [width, left]
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={particleVertexShader}
        fragmentShader={particleFragmentShader}
      />
    </points>
  );
}

export default function WaveParticleScene() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 50 }} gl={{ antialias: true, alpha: false }} dpr={[1, 1.75]}>
      <color attach="background" args={[BACKGROUND_COLOR]} />
      
      {/* 上側の波 */}
      <Ribbon positionY={0.35} speed={0.2} freq={7.0} amp={0.35} phase={0.0} opacity={0.25} heightScale={0.6} />
      {/* 下側の波 */}
      <Ribbon positionY={-0.5} speed={0.3} freq={5.5} amp={0.25} phase={2.0} opacity={0.45} heightScale={0.4} />
      
      {/* くっきりとした円形パーティクル */}
      <Particles count={30} />
    </Canvas>
  );
}