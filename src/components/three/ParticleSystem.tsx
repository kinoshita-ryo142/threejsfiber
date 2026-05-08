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
  const groupRef = useRef<THREE.Group>(null!);
  const { gl, pointer, viewport } = useThree();

  const particleData = useMemo(() => {
    const spreadX = viewport.width * 0.92;
    const spreadY = viewport.height * 0.92;
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

    return {
      basePositions,
      positions,
      colors,
      scales,
      phases,
      drift,
    };
  }, [viewport.height, viewport.width]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(particleData.positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute("position", positionAttribute);
    geo.setAttribute("color", new THREE.BufferAttribute(particleData.colors, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(particleData.scales, 1));

    return geo;
  }, [particleData]);

  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_LINE_SEGMENTS * 2 * 3);
    const colors = new Float32Array(MAX_LINE_SEGMENTS * 2 * 3);

    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute("position", positionAttribute);
    geo.setAttribute("color", colorAttribute);
    geo.setDrawRange(0, 0);

    return geo;
  }, []);

  const triangleGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_TRIANGLES * 3 * 3);
    const colors = new Float32Array(MAX_TRIANGLES * 3 * 3);

    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute("position", positionAttribute);
    geo.setAttribute("color", colorAttribute);
    geo.setDrawRange(0, 0);

    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPixelRatio: { value: 1 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const lineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.46,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    []
  );

  const triangleMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.18,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    []
  );

  useEffect(() => {
    material.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), 2);

    return () => {
      geometry.dispose();
      lineGeometry.dispose();
      triangleGeometry.dispose();
      material.dispose();
      lineMaterial.dispose();
      triangleMaterial.dispose();
    };
  }, [geometry, gl, lineGeometry, lineMaterial, material, triangleGeometry, triangleMaterial]);

  useFrame((state, delta) => {
    const elapsedTime = state.clock.elapsedTime;
    const positions = particleData.positions;
    const basePositions = particleData.basePositions;
    const { colors, drift, phases, scales } = particleData;

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

    geometry.attributes.position.needsUpdate = true;

    const adjacency = Array.from({ length: COUNT }, () => [] as number[]);
    const linePositions = lineGeometry.attributes.position.array as Float32Array;
    const lineColors = lineGeometry.attributes.color.array as Float32Array;
    let lineSegmentCount = 0;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;

      for (let j = i + 1; j < COUNT; j++) {
        if (adjacency[i].length >= MAX_NEIGHBORS && adjacency[j].length >= MAX_NEIGHBORS) {
          continue;
        }

        const j3 = j * 3;
        const dx = positions[i3] - positions[j3];
        const dy = positions[i3 + 1] - positions[j3 + 1];
        const dz = positions[i3 + 2] - positions[j3 + 2];
        const distanceSq = dx * dx + dy * dy + dz * dz;

        if (distanceSq > LINK_DISTANCE_SQ) {
          continue;
        }

        if (adjacency[i].length >= MAX_NEIGHBORS || adjacency[j].length >= MAX_NEIGHBORS) {
          continue;
        }

        adjacency[i].push(j);
        adjacency[j].push(i);

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

          lineSegmentCount += 1;
        }
      }
    }

    lineGeometry.setDrawRange(0, lineSegmentCount * 2);
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;

    const trianglePositions = triangleGeometry.attributes.position.array as Float32Array;
    const triangleColors = triangleGeometry.attributes.color.array as Float32Array;
    let triangleCount = 0;

    for (let i = 0; i < COUNT; i++) {
      const neighbors = adjacency[i];

      for (let first = 0; first < neighbors.length; first++) {
        const j = neighbors[first];
        if (j <= i) {
          continue;
        }

        for (let second = first + 1; second < neighbors.length; second++) {
          const k = neighbors[second];
          if (k <= j || !adjacency[j].includes(k) || triangleCount >= MAX_TRIANGLES) {
            continue;
          }

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

          for (let vertex = 0; vertex < 3; vertex++) {
            const colorOffset = offset + vertex * 3;
            triangleColors[colorOffset] = avgR;
            triangleColors[colorOffset + 1] = avgG;
            triangleColors[colorOffset + 2] = avgB;
          }

          triangleCount += 1;
        }
      }
    }

    triangleGeometry.setDrawRange(0, triangleCount * 3);
    triangleGeometry.attributes.position.needsUpdate = true;
    triangleGeometry.attributes.color.needsUpdate = true;

    const targetRotationY = pointer.x * POINTER_SWAY_Y;
    const targetRotationX = pointer.y * POINTER_SWAY_X;

    groupRef.current.rotation.y += (targetRotationY - groupRef.current.rotation.y) * 0.025;
    groupRef.current.rotation.x += (targetRotationX - groupRef.current.rotation.x) * 0.02;
    groupRef.current.rotation.z += delta * 0.006;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={triangleGeometry} material={triangleMaterial} frustumCulled={false} />
      <lineSegments geometry={lineGeometry} material={lineMaterial} frustumCulled={false} />
      <points geometry={geometry} material={material} frustumCulled={false} />
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

