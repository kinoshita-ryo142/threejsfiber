import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 160;
const POINTER_SWAY_Y = 0.35;
const POINTER_SWAY_X = 0.12;
const LINK_DISTANCE = 0.84;
const LINK_DISTANCE_SQ = LINK_DISTANCE * LINK_DISTANCE;
const MAX_NEIGHBORS = 3;
const MAX_LINE_SEGMENTS = COUNT * MAX_NEIGHBORS;
const MAX_TRIANGLES = COUNT * 2;

// 毎フレームのGC（Garbage Collection）発生を防ぐための定常バッファ
const adjacencyBuffer = new Int32Array(COUNT * MAX_NEIGHBORS);
const neighborCounts = new Uint8Array(COUNT);

const vertexShader = /* glsl */ `
  uniform float uPixelRatio;

  attribute vec3 color;
  attribute float aScale;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float perspectiveScale = clamp(1.6 / -mvPosition.z, 0.0, 2.0);

    gl_PointSize = (8.0 + aScale * 14.0) * uPixelRatio * perspectiveScale;
    gl_Position = projectionMatrix * mvPosition;

    vColor = color;
    vAlpha = 0.35 + aScale * 0.6;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(centered);

    float outerGlow = smoothstep(0.52, 0.0, distanceToCenter);
    float core = smoothstep(0.18, 0.0, distanceToCenter);
    float alpha = outerGlow * vAlpha;

    if (alpha < 0.01) discard;

    vec3 color = vColor * (outerGlow * 0.9 + core * 2.0);
    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Particles() {
  const groupRef = useRef<THREE.Group>(null);
  const { gl, pointer } = useThree();

  // 初期配置データ（画面リサイズで再破棄・再生成されないよう固定化）
  const particleData = useMemo(() => {
    const spreadX = 10;
    const spreadY = 6;
    const spreadZ = 4.8;
    const basePositions = new Float32Array(COUNT * 3);
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const scales = new Float32Array(COUNT);
    const phases = new Float32Array(COUNT);
    const drift = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;

      basePositions[i3] = (Math.random() - 0.5) * spreadX;
      basePositions[i3 + 1] = (Math.random() - 0.5) * spreadY;
      basePositions[i3 + 2] = (Math.random() - 0.5) * spreadZ;

      positions[i3] = basePositions[i3];
      positions[i3 + 1] = basePositions[i3 + 1];
      positions[i3 + 2] = basePositions[i3 + 2];

      const warmth = Math.random();
      colors[i3] = 0.55 + warmth * 0.35;
      colors[i3 + 1] = 0.68 + warmth * 0.18;
      colors[i3 + 2] = 0.9 + Math.random() * 0.1;

      scales[i] = 0.2 + Math.pow(Math.random(), 1.4) * 1.4;
      phases[i] = Math.random() * Math.PI * 2;
      drift[i3] = Math.random();
      drift[i3 + 1] = Math.random();
      drift[i3 + 2] = Math.random();
    }

    return { basePositions, positions, colors, scales, phases, drift };
  }, []);

  const { particleGeo, lineGeo, triangleGeo, particleMat, lineMat, triangleMat } = useMemo(() => {
    // 1. Particle Geometry
    const pGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(particleData.positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    pGeo.setAttribute("position", posAttr);
    pGeo.setAttribute("color", new THREE.BufferAttribute(particleData.colors, 3));
    pGeo.setAttribute("aScale", new THREE.BufferAttribute(particleData.scales, 1));

    // 2. Line Geometry
    const lGeo = new THREE.BufferGeometry();
    const lPosAttr = new THREE.BufferAttribute(new Float32Array(MAX_LINE_SEGMENTS * 6), 3);
    const lColAttr = new THREE.BufferAttribute(new Float32Array(MAX_LINE_SEGMENTS * 6), 3);
    lPosAttr.setUsage(THREE.DynamicDrawUsage);
    lColAttr.setUsage(THREE.DynamicDrawUsage);
    lGeo.setAttribute("position", lPosAttr);
    lGeo.setAttribute("color", lColAttr);
    lGeo.setDrawRange(0, 0);

    // 3. Triangle Geometry
    const tGeo = new THREE.BufferGeometry();
    const tPosAttr = new THREE.BufferAttribute(new Float32Array(MAX_TRIANGLES * 9), 3);
    const tColAttr = new THREE.BufferAttribute(new Float32Array(MAX_TRIANGLES * 9), 3);
    tPosAttr.setUsage(THREE.DynamicDrawUsage);
    tColAttr.setUsage(THREE.DynamicDrawUsage);
    tGeo.setAttribute("position", tPosAttr);
    tGeo.setAttribute("color", tColAttr);
    tGeo.setDrawRange(0, 0);

    // 4. Materials
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const lMat = new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.46,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    const tMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.18,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    return {
      particleGeo: pGeo,
      lineGeo: lGeo,
      triangleGeo: tGeo,
      particleMat: pMat,
      lineMat: lMat,
      triangleMat: tMat,
    };
  }, [particleData]);

  useEffect(() => {
    particleMat.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);

    return () => {
      particleGeo.dispose();
      lineGeo.dispose();
      triangleGeo.dispose();
      particleMat.dispose();
      lineMat.dispose();
      triangleMat.dispose();
    };
  }, [particleGeo, lineGeo, triangleGeo, particleMat, lineMat, triangleMat, gl]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const elapsedTime = state.clock.elapsedTime;
    const { positions, basePositions, colors, drift, phases, scales } = particleData;

    // 1. パーティクル座標更新
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const motionTime = elapsedTime * (0.1 + drift[i3 + 2] * 0.4) + phases[i];

      positions[i3] =
        basePositions[i3] +
        Math.sin(motionTime * 0.85 + drift[i3] * Math.PI * 2) * (0.18 + scales[i] * 0.18);
      positions[i3 + 1] =
        basePositions[i3 + 1] +
        Math.cos(motionTime * 0.65 + drift[i3 + 1] * Math.PI * 2) * (0.22 + scales[i] * 0.18);
      positions[i3 + 2] = basePositions[i3 + 2] + Math.sin(motionTime * 0.45 + phases[i]) * 0.28;
    }
    particleGeo.attributes.position.needsUpdate = true;

    // 2. 近接判定 & ラインデータ作成（アロケーションなし）
    neighborCounts.fill(0);

    const linePositions = lineGeo.attributes.position.array as Float32Array;
    const lineColors = lineGeo.attributes.color.array as Float32Array;
    let lineSegmentCount = 0;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      if (neighborCounts[i] >= MAX_NEIGHBORS) continue;

      for (let j = i + 1; j < COUNT; j++) {
        if (neighborCounts[i] >= MAX_NEIGHBORS) break;
        if (neighborCounts[j] >= MAX_NEIGHBORS) continue;

        const j3 = j * 3;
        const dx = positions[i3] - positions[j3];
        const dy = positions[i3 + 1] - positions[j3 + 1];
        const dz = positions[i3 + 2] - positions[j3 + 2];
        const distanceSq = dx * dx + dy * dy + dz * dz;

        if (distanceSq > LINK_DISTANCE_SQ) continue;

        adjacencyBuffer[i * MAX_NEIGHBORS + neighborCounts[i]++] = j;
        adjacencyBuffer[j * MAX_NEIGHBORS + neighborCounts[j]++] = i;

        if (lineSegmentCount < MAX_LINE_SEGMENTS) {
          const offset = lineSegmentCount * 6;

          linePositions[offset] = positions[i3];
          linePositions[offset + 1] = positions[i3 + 1];
          linePositions[offset + 2] = positions[i3 + 2];
          linePositions[offset + 3] = positions[j3];
          linePositions[offset + 4] = positions[j3 + 1];
          linePositions[offset + 5] = positions[j3 + 2];

          lineColors[offset] = colors[i3];
          lineColors[offset + 1] = colors[i3 + 1];
          lineColors[offset + 2] = colors[i3 + 2];
          lineColors[offset + 3] = colors[j3];
          lineColors[offset + 4] = colors[j3 + 1];
          lineColors[offset + 5] = colors[j3 + 2];

          lineSegmentCount++;
        }
      }
    }

    lineGeo.setDrawRange(0, lineSegmentCount * 2);
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate = true;

    // 3. 三角形メッシュ生成
    const trianglePositions = triangleGeo.attributes.position.array as Float32Array;
    const triangleColors = triangleGeo.attributes.color.array as Float32Array;
    let triangleCount = 0;

    for (let i = 0; i < COUNT; i++) {
      const countI = neighborCounts[i];
      const offsetI = i * MAX_NEIGHBORS;

      for (let first = 0; first < countI; first++) {
        const j = adjacencyBuffer[offsetI + first];
        if (j <= i) continue;

        const countJ = neighborCounts[j];
        const offsetJ = j * MAX_NEIGHBORS;

        for (let second = first + 1; second < countI; second++) {
          const k = adjacencyBuffer[offsetI + second];
          if (k <= j || triangleCount >= MAX_TRIANGLES) continue;

          // j と k が繋がっているか判定
          let isConnected = false;
          for (let m = 0; m < countJ; m++) {
            if (adjacencyBuffer[offsetJ + m] === k) {
              isConnected = true;
              break;
            }
          }
          if (!isConnected) continue;

          const i3 = i * 3;
          const j3 = j * 3;
          const k3 = k * 3;
          const offset = triangleCount * 9;

          const avgR = (colors[i3] + colors[j3] + colors[k3]) / 3;
          const avgG = (colors[i3 + 1] + colors[j3 + 1] + colors[k3 + 1]) / 3;
          const avgB = (colors[i3 + 2] + colors[j3 + 2] + colors[k3 + 2]) / 3;

          trianglePositions[offset] = positions[i3];
          trianglePositions[offset + 1] = positions[i3 + 1];
          trianglePositions[offset + 2] = positions[i3 + 2];
          trianglePositions[offset + 3] = positions[j3];
          trianglePositions[offset + 4] = positions[j3 + 1];
          trianglePositions[offset + 5] = positions[j3 + 2];
          trianglePositions[offset + 6] = positions[k3];
          trianglePositions[offset + 7] = positions[k3 + 1];
          trianglePositions[offset + 8] = positions[k3 + 2];

          for (let v = 0; v < 3; v++) {
            const colorOffset = offset + v * 3;
            triangleColors[colorOffset] = avgR;
            triangleColors[colorOffset + 1] = avgG;
            triangleColors[colorOffset + 2] = avgB;
          }

          triangleCount++;
        }
      }
    }

    triangleGeo.setDrawRange(0, triangleCount * 3);
    triangleGeo.attributes.position.needsUpdate = true;
    triangleGeo.attributes.color.needsUpdate = true;

    // 4. マウス慣性回転
    const targetRotationY = pointer.x * POINTER_SWAY_Y;
    const targetRotationX = pointer.y * POINTER_SWAY_X;

    groupRef.current.rotation.y += (targetRotationY - groupRef.current.rotation.y) * 0.025;
    groupRef.current.rotation.x += (targetRotationX - groupRef.current.rotation.x) * 0.02;
    groupRef.current.rotation.z += delta * 0.006;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={triangleGeo} material={triangleMat} frustumCulled={false} />
      <lineSegments geometry={lineGeo} material={lineMat} frustumCulled={false} />
      <points geometry={particleGeo} material={particleMat} frustumCulled={false} />
    </group>
  );
}

export default function ParticleSystem() {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
    >
      <fog attach="fog" args={["#020409", 4, 12]} />
      <Particles />
    </Canvas>
  );
}