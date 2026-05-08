import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const waterLightVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const waterLightFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 vUv;

  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = dot(hash22(i + vec2(0.0, 0.0)) - 0.5, f - vec2(0.0, 0.0));
    float b = dot(hash22(i + vec2(1.0, 0.0)) - 0.5, f - vec2(1.0, 0.0));
    float c = dot(hash22(i + vec2(0.0, 1.0)) - 0.5, f - vec2(0.0, 1.0));
    float d = dot(hash22(i + vec2(1.0, 1.0)) - 0.5, f - vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = p * 2.02 + vec2(4.1, 2.7);
      amplitude *= 0.52;
    }

    return value;
  }

  float voronoiEdge(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float nearest = 8.0;
    float secondNearest = 8.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 jitter = hash22(cell + offset);
        jitter = 0.5 + 0.5 * sin(uTime * vec2(0.17, 0.21) + 6.28318 * jitter);
        vec2 diff = offset + jitter - local;
        float dist = dot(diff, diff);

        if (dist < nearest) {
          secondNearest = nearest;
          nearest = dist;
        } else if (dist < secondNearest) {
          secondNearest = dist;
        }
      }
    }

    return max(secondNearest - nearest, 0.0);
  }

  float causticLayer(vec2 uv, float scale, float speed, float thickness) {
    vec2 flow = uv * scale;
    float warpA = fbm(flow * 0.55 + vec2(speed * 0.35, -speed * 0.22));
    float warpB = fbm(flow * 0.9 + vec2(-speed * 0.18, speed * 0.27));

    flow += vec2(warpA, warpB) * 1.15;
    flow += vec2(
      sin(flow.y * 0.85 + speed * 0.8),
      cos(flow.x * 0.72 - speed * 0.65)
    ) * 0.22;

    float edge = voronoiEdge(flow);
    float sharp = 1.0 - smoothstep(0.0, thickness, edge);
    float soft = 1.0 - smoothstep(0.0, thickness * 3.8, edge);

    return sharp * 0.95 + soft * 0.35;
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 sceneUv = vec2(uv.x * aspect, uv.y);
    float time = uTime * 0.27;

    vec2 drift = vec2(
      fbm(sceneUv * 1.35 + vec2(time * 0.55, -time * 0.3)),
      fbm(sceneUv * 1.55 + vec2(-time * 0.28, time * 0.42))
    );

    vec2 warpedUv = sceneUv + (drift - 0.5) * 0.5;

    float layerA = causticLayer(warpedUv + vec2(0.0, time * 0.06), 2.35, time, 0.21);
    float layerB = causticLayer(warpedUv * 1.04 + vec2(-time * 0.04, time * 0.03), 3.7, time * 1.1, 0.155);
    float layerC = causticLayer(warpedUv * 1.14 + vec2(time * 0.025, -time * 0.04), 5.7, time * 1.35, 0.115);

    float envelopeA = smoothstep(0.14, 0.72, fbm(warpedUv * 0.95 + vec2(time * 0.16, -time * 0.11)) + 0.62);
    float envelopeB = smoothstep(0.22, 0.82, fbm(warpedUv * 0.55 - vec2(time * 0.08, time * 0.06)) + 0.68);
    float coverage = mix(0.45, 1.0, clamp(envelopeA * 0.58 + envelopeB * 0.42, 0.0, 1.0));

    float caustics = (layerA * 0.7 + layerB * 0.42 + layerC * 0.22) * coverage;
    float breakupA = smoothstep(0.34, 0.72, fbm(warpedUv * 3.8 + vec2(time * 0.42, -time * 0.31)) + 0.58);
    float breakupB = 1.0 - smoothstep(0.18, 0.46, fbm(warpedUv * 7.2 - vec2(time * 0.67, time * 0.24)) + 0.5);
    float breakup = mix(0.72, 1.0, breakupA * breakupB);

    caustics *= breakup;
    caustics = max(caustics - 0.17, 0.0) * 1.12;

    float softBloom = smoothstep(0.035, 0.36, caustics);
    float sharpHighlights = pow(max(caustics, 0.0), 2.55);

    float vignette = smoothstep(1.15, 0.24, length(sceneUv * vec2(0.9, 1.1)));
    float depth = smoothstep(-0.45, 0.55, vUv.y);

    vec3 baseColor = vec3(0.0, 0.070, 0.125);
    vec3 depthTint = vec3(0.0, 0.095, 0.155);
    vec3 color = mix(baseColor, depthTint, depth * 0.35);

    color += vec3(0.72, 0.82, 0.92) * softBloom * 0.11;
    color += vec3(1.0) * sharpHighlights * 0.28;
    color *= mix(0.72, 1.0, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function WaterLightPlane() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size, viewport } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    [size.height, size.width]
  );

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) {
      return;
    }

    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uResolution.value.set(size.width, size.height);
  });

  return (
    <mesh frustumCulled={false} position={[0, 0, 0]} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[
          {
            uniforms,
            vertexShader: waterLightVertexShader,
            fragmentShader: waterLightFragmentShader,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          },
        ]}
      />
    </mesh>
  );
}

export default function WaterLightScene() {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], zoom: 1, near: 0.1, far: 10 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={["#001220"]} />
      <WaterLightPlane />
    </Canvas>
  );
}
