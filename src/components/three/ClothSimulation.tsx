import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const CLOTH_WIDTH = 7.4;
const CLOTH_HEIGHT = 4.9;
const SEGMENTS_X = 72;
const SEGMENTS_Y = 48;
const CONSTRAINT_ITERATIONS = 5;
const DAMPING = 0.985;
const WIND_FORCE = 11.5;

type ClothState = {
  positions: THREE.Vector3[];
  previousPositions: THREE.Vector3[];
  accelerations: THREE.Vector3[];
  restPositions: THREE.Vector3[];
  constraints: Array<[number, number, number]>;
  pinned: number[];
};

function particleIndex(x: number, y: number) {
  return y * (SEGMENTS_X + 1) + x;
}

function createClothState() {
  const positions: THREE.Vector3[] = [];
  const previousPositions: THREE.Vector3[] = [];
  const accelerations: THREE.Vector3[] = [];
  const restPositions: THREE.Vector3[] = [];
  const constraints: Array<[number, number, number]> = [];
  const pinned: number[] = [];

  for (let y = 0; y <= SEGMENTS_Y; y += 1) {
    for (let x = 0; x <= SEGMENTS_X; x += 1) {
      const px = (x / SEGMENTS_X - 0.5) * CLOTH_WIDTH;
      const py = (0.5 - y / SEGMENTS_Y) * CLOTH_HEIGHT;
      const position = new THREE.Vector3(px, py, 0);

      positions.push(position.clone());
      previousPositions.push(position.clone());
      accelerations.push(new THREE.Vector3());
      restPositions.push(position.clone());

      if (y === 0) {
        pinned.push(particleIndex(x, y));
      }
    }
  }

  const addConstraint = (ax: number, ay: number, bx: number, by: number) => {
    const left = particleIndex(ax, ay);
    const right = particleIndex(bx, by);
    const restDistance = restPositions[left].distanceTo(restPositions[right]);
    constraints.push([left, right, restDistance]);
  };

  for (let y = 0; y <= SEGMENTS_Y; y += 1) {
    for (let x = 0; x <= SEGMENTS_X; x += 1) {
      if (x < SEGMENTS_X) addConstraint(x, y, x + 1, y);
      if (y < SEGMENTS_Y) addConstraint(x, y, x, y + 1);
      if (x < SEGMENTS_X && y < SEGMENTS_Y) {
        addConstraint(x, y, x + 1, y + 1);
        addConstraint(x + 1, y, x, y + 1);
      }
      if (x < SEGMENTS_X - 1) addConstraint(x, y, x + 2, y);
      if (y < SEGMENTS_Y - 1) addConstraint(x, y, x, y + 2);
    }
  }

  return { positions, previousPositions, accelerations, restPositions, constraints, pinned };
}

function satisfyConstraint(a: THREE.Vector3, b: THREE.Vector3, restDistance: number) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const distance = delta.length();

  if (distance === 0) return;

  const correction = delta.multiplyScalar((distance - restDistance) / distance * 0.5);
  a.add(correction);
  b.sub(correction);
}

function ClothMesh() {
  const texture = useTexture("/images/sample_cloth.jpg");
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const stateRef = useRef<ClothState>(createClothState());
  const tempForce = useRef(new THREE.Vector3());
  const tempVelocity = useRef(new THREE.Vector3());

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  useFrame((state, delta) => {
    const geometry = geometryRef.current;
    if (!geometry) return;

    const dt = Math.min(delta, 1 / 30);
    const cloth = stateRef.current;
    const time = state.clock.elapsedTime;
    const gravity = -5.5;
    const positionsAttribute = geometry.attributes.position as THREE.BufferAttribute;

    const windDirection = new THREE.Vector3(
      Math.sin(time * 0.45) * 0.8 + 0.3,
      Math.cos(time * 0.28) * 0.18,
      1.0
    ).normalize();

    for (let i = 0; i < cloth.positions.length; i += 1) {
      const position = cloth.positions[i];
      const previous = cloth.previousPositions[i];
      const acceleration = cloth.accelerations[i];
      const rest = cloth.restPositions[i];

      acceleration.set(0, gravity, 0);

      const gust =
        Math.sin(rest.x * 1.3 + time * 1.7) * 0.45 +
        Math.cos(rest.y * 1.8 - time * 1.15) * 0.35 +
        Math.sin((rest.x + rest.y) * 1.1 + time * 0.9) * 0.2;

      tempForce.current.copy(windDirection).multiplyScalar((0.65 + gust) * WIND_FORCE);
      acceleration.add(tempForce.current);

      tempVelocity.current.subVectors(position, previous).multiplyScalar(DAMPING);
      previous.copy(position);
      position.add(tempVelocity.current);
      position.addScaledVector(acceleration, dt * dt);
    }

    for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration += 1) {
      for (let i = 0; i < cloth.constraints.length; i += 1) {
        const [left, right, restDistance] = cloth.constraints[i];
        satisfyConstraint(cloth.positions[left], cloth.positions[right], restDistance);
      }

      for (let i = 0; i < cloth.pinned.length; i += 1) {
        const index = cloth.pinned[i];
        const rest = cloth.restPositions[index];
        const position = cloth.positions[index];
        const previous = cloth.previousPositions[index];
        const swayX = Math.sin(time * 0.7 + rest.x * 0.4) * 0.03;
        const swayZ = Math.cos(time * 0.5 + rest.x * 0.25) * 0.02;

        position.set(rest.x + swayX, rest.y, rest.z + swayZ);
        previous.copy(position);
      }
    }

    for (let i = 0; i < cloth.positions.length; i += 1) {
      const position = cloth.positions[i];
      positionsAttribute.setXYZ(i, position.x, position.y, position.z);
    }

    positionsAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <mesh position={[0, -0.45, 0]} castShadow receiveShadow>
      <planeGeometry ref={geometryRef} args={[CLOTH_WIDTH, CLOTH_HEIGHT, SEGMENTS_X, SEGMENTS_Y]} />
      <meshPhysicalMaterial
        map={texture}
        side={THREE.DoubleSide}
        roughness={0.84}
        metalness={0.02}
        clearcoat={0.08}
        clearcoatRoughness={0.6}
        sheen={0.35}
        sheenColor="#d8d0c5"
        toneMapped
      />
    </mesh>
  );
}

export default function ClothSimulation() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, -0.05, 12.8], fov: 30 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#000000"]} />
        <fog attach="fog" args={["#000000", 10, 22]} />
        <ambientLight intensity={0.45} />
        <hemisphereLight intensity={0.45} color="#f6efe4" groundColor="#121212" />
        <directionalLight
          castShadow
          position={[4.8, 6.5, 4.2]}
          intensity={2.1}
          color="#fff5e8"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={18}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-normalBias={0.02}
        />
        <directionalLight position={[-4, 2, 2]} intensity={0.28} color="#9fb7d2" />
        <ClothMesh />
      </Canvas>
    </div>
  );
}