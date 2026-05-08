import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const SIM_SCALE = 0.5;
const MAX_SIM_SIZE = 768;

type PointerState = {
    uv: THREE.Vector2;
    velocity: THREE.Vector2;
    active: number;
};

const simulationVertexShader = /* glsl */ `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

const velocityFragmentShader = /* glsl */ `
    uniform sampler2D uVelocity;
    uniform float uTime;
    uniform float uDelta;
    uniform vec2 uPointer;
    uniform vec2 uPointerVelocity;
    uniform float uPointerActive;
    uniform vec2 uTexelSize;

    varying vec2 vUv;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
        );
    }

    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;

        for (int i = 0; i < 4; i++) {
            value += noise(p) * amplitude;
            p = p * 2.02 + vec2(4.2, 1.3);
            amplitude *= 0.5;
        }

        return value;
    }

    float potential(vec2 uv) {
        vec2 drift = vec2(uTime * 0.018, -uTime * 0.012);
        float large = fbm(uv * 1.7 + drift);
        float medium = fbm(uv * 0.85 - drift * 0.45);
        return large * 0.75 + medium * 0.65;
    }

    vec2 curlFlow(vec2 uv) {
        float e = max(uTexelSize.x, uTexelSize.y) * 8.0;
        float left = potential(uv - vec2(e, 0.0));
        float right = potential(uv + vec2(e, 0.0));
        float bottom = potential(uv - vec2(0.0, e));
        float top = potential(uv + vec2(0.0, e));
        float dPdX = (right - left) / (2.0 * e);
        float dPdY = (top - bottom) / (2.0 * e);
        return vec2(dPdY, -dPdX);
    }

    void main() {
        vec2 sampleUv = clamp(vUv - texture2D(uVelocity, vUv).xy * uDelta * 0.045, vec2(0.001), vec2(0.999));
        vec2 velocity = texture2D(uVelocity, sampleUv).xy;
        vec2 targetFlow = curlFlow(vUv) * 0.70;

        velocity += (targetFlow - velocity) * 0.040;
        velocity *= 0.992;

        float pointerFalloff = smoothstep(0.18, 0.0, distance(vUv, uPointer));
        velocity += uPointerVelocity * pointerFalloff * 0.65 * uPointerActive;

        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`;

const densityFragmentShader = /* glsl */ `
    uniform sampler2D uDensity;
    uniform sampler2D uVelocity;
    uniform float uTime;
    uniform float uDelta;

    varying vec2 vUv;

    float blob(vec2 uv, vec2 center, vec2 radius) {
        vec2 q = (uv - center) / radius;
        return exp(-dot(q, q));
    }

    void main() {
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        vec2 sampleUv = clamp(vUv - velocity * uDelta * 0.055, vec2(0.001), vec2(0.999));
        vec3 color = texture2D(uDensity, sampleUv).rgb;

        vec2 drift = vec2(sin(uTime * 0.035), cos(uTime * 0.028)) * 0.025;
        float plumeA = blob(vUv, vec2(0.28, 0.64) + drift * vec2(1.0, -0.25), vec2(0.24, 0.29));
        float plumeB = blob(vUv, vec2(0.74, 0.45) - drift * vec2(0.7, 1.0), vec2(0.3, 0.25));
        float plumeC = blob(vUv, vec2(0.5, 0.24) + drift.yx * vec2(-0.45, 0.55), vec2(0.35, 0.22));

        vec3 source =
            plumeA * vec3(0.08, 0.32, 0.52) +
            plumeB * vec3(0.05, 0.18, 0.36) +
            plumeC * vec3(0.02, 0.08, 0.18);

        color = color * 0.9968 + source * 0.020;
        color = min(color, vec3(1.15));

        gl_FragColor = vec4(color, 1.0);
    }
`;

const displayVertexShader = /* glsl */ `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const displayFragmentShader = /* glsl */ `
    uniform sampler2D uDensity;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;

    varying vec2 vUv;

    float calcLum(vec3 color) {
        return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        vec2 offset = velocity * 0.028;
        vec3 density = texture2D(uDensity, clamp(vUv + offset, vec2(0.001), vec2(0.999))).rgb;

        float lLeft = calcLum(texture2D(uDensity, clamp(vUv - vec2(uTexelSize.x * 5.0, 0.0), vec2(0.001), vec2(0.999))).rgb);
        float lRight = calcLum(texture2D(uDensity, clamp(vUv + vec2(uTexelSize.x * 5.0, 0.0), vec2(0.001), vec2(0.999))).rgb);
        float lBottom = calcLum(texture2D(uDensity, clamp(vUv - vec2(0.0, uTexelSize.y * 5.0), vec2(0.001), vec2(0.999))).rgb);
        float lTop = calcLum(texture2D(uDensity, clamp(vUv + vec2(0.0, uTexelSize.y * 5.0), vec2(0.001), vec2(0.999))).rgb);

        vec3 normal = normalize(vec3(lLeft - lRight, lBottom - lTop, 0.18));
        vec3 lightDir = normalize(vec3(-0.45, 0.6, 0.68));
        float light = dot(normal, lightDir) * 0.72 + 0.28;

        vec3 background = mix(vec3(0.01, 0.02, 0.035), vec3(0.02, 0.05, 0.09), vUv.y);
        float vignette = smoothstep(1.05, 0.2, distance(vUv, vec2(0.5)));
        vec3 ink = density * (0.5 + light * 1.4);
        vec3 color = background + ink + density * density * 0.35;
        color *= mix(0.7, 1.0, vignette);

        gl_FragColor = vec4(color, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`;

function createRenderTarget(width: number, height: number) {
    const target = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        type: THREE.HalfFloatType,
    });

    target.texture.generateMipmaps = false;
    return target;
}

function FluidSurface({ pointerRef }: { pointerRef: React.RefObject<PointerState> }) {
    const { gl, size, viewport } = useThree();

    const simulation = useMemo(() => {
        const simWidth = Math.max(180, Math.min(Math.round(size.width * SIM_SCALE), MAX_SIM_SIZE));
        const simHeight = Math.max(180, Math.min(Math.round(size.height * SIM_SCALE), MAX_SIM_SIZE));
        const texelSize = new THREE.Vector2(1 / simWidth, 1 / simHeight);

        const velocityRead = createRenderTarget(simWidth, simHeight);
        const velocityWrite = createRenderTarget(simWidth, simHeight);
        const densityRead = createRenderTarget(simWidth, simHeight);
        const densityWrite = createRenderTarget(simWidth, simHeight);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        const velocityMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uVelocity: { value: velocityRead.texture },
                uTime: { value: 0 },
                uDelta: { value: 0.016 },
                uPointer: { value: new THREE.Vector2(0.5, 0.5) },
                uPointerVelocity: { value: new THREE.Vector2(0, 0) },
                uPointerActive: { value: 0 },
                uTexelSize: { value: texelSize.clone() },
            },
            vertexShader: simulationVertexShader,
            fragmentShader: velocityFragmentShader,
        });

        const densityMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uDensity: { value: densityRead.texture },
                uVelocity: { value: velocityRead.texture },
                uTime: { value: 0 },
                uDelta: { value: 0.016 },
            },
            vertexShader: simulationVertexShader,
            fragmentShader: densityFragmentShader,
        });

        const displayMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uDensity: { value: densityRead.texture },
                uVelocity: { value: velocityRead.texture },
                uTexelSize: { value: texelSize.clone() },
            },
            vertexShader: displayVertexShader,
            fragmentShader: displayFragmentShader,
            depthWrite: false,
            depthTest: false,
            toneMapped: true,
        });

        return {
            camera,
            density: { read: densityRead, write: densityWrite },
            densityMaterial,
            displayMaterial,
            quad,
            scene,
            texelSize,
            velocity: { read: velocityRead, write: velocityWrite },
            velocityMaterial,
            swapDensity() {
                const current = this.density.read;
                this.density.read = this.density.write;
                this.density.write = current;
            },
            swapVelocity() {
                const current = this.velocity.read;
                this.velocity.read = this.velocity.write;
                this.velocity.write = current;
            },
        };
    }, [size.height, size.width]);

    useEffect(() => {
        const clearColor = new THREE.Color();
        const previousTarget = gl.getRenderTarget();
        const previousAlpha = gl.getClearAlpha();

        gl.getClearColor(clearColor);
        gl.setClearColor(0x000000, 1);

        for (const target of [
            simulation.velocity.read,
            simulation.velocity.write,
            simulation.density.read,
            simulation.density.write,
        ]) {
            gl.setRenderTarget(target);
            gl.clear(true, true, true);
        }

        gl.setRenderTarget(previousTarget);
        gl.setClearColor(clearColor, previousAlpha);

        return () => {
            simulation.quad.geometry.dispose();
            simulation.velocity.read.dispose();
            simulation.velocity.write.dispose();
            simulation.density.read.dispose();
            simulation.density.write.dispose();
            simulation.velocityMaterial.dispose();
            simulation.densityMaterial.dispose();
            simulation.displayMaterial.dispose();
        };
    }, [gl, simulation]);

    useFrame((state, delta) => {
        const pointer = pointerRef.current;
        const clampedDelta = Math.min(delta, 1 / 24);
        const previousTarget = gl.getRenderTarget();

        pointer.velocity.multiplyScalar(Math.exp(-clampedDelta * 3.2));

        simulation.velocityMaterial.uniforms.uVelocity.value = simulation.velocity.read.texture;
        simulation.velocityMaterial.uniforms.uTime.value = state.clock.elapsedTime;
        simulation.velocityMaterial.uniforms.uDelta.value = clampedDelta;
        simulation.velocityMaterial.uniforms.uPointer.value.copy(pointer.uv);
        simulation.velocityMaterial.uniforms.uPointerVelocity.value.copy(pointer.velocity);
        simulation.velocityMaterial.uniforms.uPointerActive.value = pointer.active;
        simulation.velocityMaterial.uniforms.uTexelSize.value.copy(simulation.texelSize);

        simulation.quad.material = simulation.velocityMaterial;
        gl.setRenderTarget(simulation.velocity.write);
        gl.render(simulation.scene, simulation.camera);
        simulation.swapVelocity();

        simulation.densityMaterial.uniforms.uDensity.value = simulation.density.read.texture;
        simulation.densityMaterial.uniforms.uVelocity.value = simulation.velocity.read.texture;
        simulation.densityMaterial.uniforms.uTime.value = state.clock.elapsedTime;
        simulation.densityMaterial.uniforms.uDelta.value = clampedDelta;

        simulation.quad.material = simulation.densityMaterial;
        gl.setRenderTarget(simulation.density.write);
        gl.render(simulation.scene, simulation.camera);
        simulation.swapDensity();

        simulation.displayMaterial.uniforms.uDensity.value = simulation.density.read.texture;
        simulation.displayMaterial.uniforms.uVelocity.value = simulation.velocity.read.texture;
        simulation.displayMaterial.uniforms.uTexelSize.value.copy(simulation.texelSize);

        gl.setRenderTarget(previousTarget);
    });

    return (
        <mesh scale={[viewport.width, viewport.height, 1]}>
            <planeGeometry args={[1, 1]} />
            <primitive object={simulation.displayMaterial} attach="material" />
        </mesh>
    );
}

export default function FluidSimulationScene() {
    const pointerRef = useRef<PointerState>({
        uv: new THREE.Vector2(0.5, 0.5),
        velocity: new THREE.Vector2(0, 0),
        active: 0,
    });

    const updatePointer = (event: ReactPointerEvent<HTMLDivElement>, active: number) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nextX = (event.clientX - rect.left) / rect.width;
        const nextY = 1 - (event.clientY - rect.top) / rect.height;
        const pointer = pointerRef.current;

        pointer.velocity.set((nextX - pointer.uv.x) * 1.4, (nextY - pointer.uv.y) * 1.4);
        pointer.uv.set(nextX, nextY);
        pointer.active = active;
    };

    return (
        <div
            className="relative h-full w-full overflow-hidden bg-[#020409]"
            onPointerDown={(event) => updatePointer(event, 1)}
            onPointerMove={(event) => updatePointer(event, 1)}
            onPointerLeave={() => {
                pointerRef.current.active = 0;
            }}
            onPointerUp={() => {
                pointerRef.current.active = 0;
            }}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(74,162,204,0.18),transparent_45%),radial-gradient(circle_at_bottom,rgba(10,50,90,0.35),transparent_50%)]" />
            <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 100 }} dpr={[1, 2]} gl={{ antialias: true }}>
                <FluidSurface pointerRef={pointerRef} />
            </Canvas>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-black text-xl lg:text-4xl font-bold font-serif text-center">流れる液体を<br className="inline lg:hidden" />シミュレーションする。</div>
        </div>
    );
}