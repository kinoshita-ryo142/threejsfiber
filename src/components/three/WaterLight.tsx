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

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p = p * 2.02 + vec2(4.1, 2.7);
      amplitude *= 0.5;
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

  // 線の太さに動的な強弱（幅のバリエーション）を付与するレイヤー
  float causticLayer(vec2 uv, float scale, float speed) {
    vec2 flow = uv * scale;
    
    // 位置に応じた太さゆらぎ用パラメータ（軽量ノイズ）
    float n = noise(flow * 0.7 + vec2(speed * 0.2, -speed * 0.15));

    float warpA = fbm(flow * 0.5 + vec2(speed * 0.3, -speed * 0.2));
    float warpB = fbm(flow * 0.8 + vec2(-speed * 0.15, speed * 0.25));

    flow += vec2(warpA, warpB) * 1.1;
    flow += vec2(
      sin(flow.y * 0.8 + speed * 0.75),
      cos(flow.x * 0.7 - speed * 0.6)
    ) * 0.25;

    float edge = voronoiEdge(flow);

    // ★ 線の太さを 0.005（鋭く極細）〜 0.045（太く広い集光）の間で動的に変化
    float dynamicThickness = mix(0.005, 0.045, n * 0.5 + 0.5);
    
    // 集光線の方程式：太い部分は面のように明るく、細い部分は鋭いラインに
    float focus = dynamicThickness / (edge + dynamicThickness * 0.55);
    return clamp(focus - 0.06, 0.0, 2.8);
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 sceneUv = vec2(uv.x * aspect, uv.y);
    float time = uTime * 0.22;

    vec2 drift = vec2(
      fbm(sceneUv * 1.2 + vec2(time * 0.45, -time * 0.25)),
      fbm(sceneUv * 1.4 + vec2(-time * 0.22, time * 0.35))
    );

    vec2 warpedUv = sceneUv + (drift - 0.5) * 0.35;

    // 大小2つのスケールを重ね合わせることで交点と太さの重なりを表現
    float layerA = causticLayer(warpedUv + vec2(0.0, time * 0.05), 2.2, time);
    float layerB = causticLayer(warpedUv * 1.3 + vec2(-time * 0.03, time * 0.02), 3.8, time * 1.1);

    float caustics = layerA * 0.65 + layerB * 0.35;

    // 画像のような明るく澄んだ南国系プール（ターコイズ/シアン）のベースカラー
    vec3 shallowTurquoise = vec3(0.42, 0.88, 0.91);
    vec3 deepCyan = vec3(0.18, 0.62, 0.72);
    
    float depth = smoothstep(-0.6, 0.6, vUv.y);
    vec3 color = mix(deepCyan, shallowTurquoise, depth);

    // 光線ハイライト（太い部分は広範に光り、交点は眩しく白飛びする）
    vec3 causticLight = vec3(0.85, 0.98, 1.0);
    vec3 intenseSun = vec3(1.0, 1.0, 0.95);

    color += caustics * causticLight * 0.38;
    color += pow(max(caustics - 0.3, 0.0), 2.8) * intenseSun * 0.5;

    // 画面外縁のわずかな明るさの調整
    float vignette = smoothstep(1.3, 0.4, length(sceneUv * vec2(0.8, 1.0)));
    color *= mix(0.85, 1.0, vignette);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function WaterLightPlane() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const viewport = useThree((state) => state.viewport);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
    }),
    []
  );

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;

    material.uniforms.uTime.value += delta;
    material.uniforms.uResolution.value.set(state.size.width, state.size.height);
  });

  return (
    <mesh frustumCulled={false} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={waterLightVertexShader}
        fragmentShader={waterLightFragmentShader}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
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
      gl={{ antialias: false, alpha: false }}
    >
      <color attach="background" args={["#2BA8B8"]} />
      <WaterLightPlane />
    </Canvas>
  );
}