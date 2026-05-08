import { useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type BandConfig = {
  text: string;
  textColor: string;
  bgColor: string;
  rotateZ: number;
  yFraction: number;
  speed: number;
  reverse: boolean;
};

const BANDS: BandConfig[] = [
  {
    text: "CREATIVE • DESIGN • INNOVATION • TECHNOLOGY • FUTURE • WEB • ",
    textColor: "#ffffff",
    bgColor: "#16213e",
    rotateZ: (-35 * Math.PI) / 180,
    yFraction: 0.25,
    speed: 0.08,
    reverse: false,
  },
  {
    text: "MOTION • GRAPHICS • VISUAL • ART • DIGITAL • INTERACTIVE • ",
    textColor: "#111111",
    bgColor: "#f0f0f0",
    rotateZ: 0,
    yFraction: 0,
    speed: 0.1,
    reverse: true,
  },
  {
    text: "CODE • EXPERIENCE • ANIMATE • CREATE • EXPLORE • BUILD • ",
    textColor: "#ffffff",
    bgColor: "#e63946",
    rotateZ: (35 * Math.PI) / 180,
    yFraction: -0.25,
    speed: 0.07,
    reverse: false,
  },
];

const CANVAS_H = 256;
const FONT_PX = 100;
const BAND_H_FRAC = 0.13;

function createBandTexture(config: BandConfig): {
  tex: THREE.CanvasTexture;
  cw: number;
} {
  const font = `bold ${FONT_PX}px "Helvetica Neue", Arial, sans-serif`;
  const text = config.text.toUpperCase();

  // Measure text width on a tiny temporary canvas
  const measure = document.createElement("canvas");
  measure.width = 4;
  measure.height = 4;
  const mc = measure.getContext("2d")!;
  mc.font = font;
  const cw = Math.ceil(mc.measureText(text).width) || 2048;

  // Draw the band onto the actual canvas
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = config.bgColor;
  ctx.fillRect(0, 0, cw, CANVAS_H);
  ctx.fillStyle = config.textColor;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, CANVAS_H / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, cw };
}

function Band({ config, index }: { config: BandConfig; index: number }) {
  const { viewport } = useThree();
  const bandH = viewport.height * BAND_H_FRAC;
  // Extra wide to cover the screen even when rotated
  const bandW = Math.hypot(viewport.width, viewport.height) * 2.2;
  const y = viewport.height * config.yFraction;
  // pixels per world unit — keeps font non-distorted
  const ppu = CANVAS_H / bandH;

  const { tex, cw } = useMemo(() => createBandTexture(config), []);

  useEffect(() => {
    tex.repeat.set((bandW * ppu) / cw, 1);
    tex.needsUpdate = true;
    return () => tex.dispose();
  }, [tex, bandW, ppu, cw]);

  useFrame((_s, dt) => {
    tex.offset.x += (config.reverse ? 1 : -1) * config.speed * dt;
  });

  return (
    <mesh
      position={[0, y, index * 0.1]}
      rotation={[0, 0, config.rotateZ]}
      castShadow
      receiveShadow
    >
      <planeGeometry args={[bandW, bandH]} />
      <meshStandardMaterial map={tex} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Scene() {
  const { viewport } = useThree();
  const bgSize = Math.max(viewport.width, viewport.height) * 3;

  return (
    <>
      {/* Dark background plane that receives shadows from the bands */}
      <mesh position={[0, 0, -0.5]} receiveShadow>
        <planeGeometry args={[bgSize, bgSize]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {BANDS.map((band, i) => (
        <Band key={i} config={band} index={i} />
      ))}

      <ambientLight intensity={2.0} />
      <directionalLight
        position={[2, 3, 4]}
        intensity={2.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        //shadow-bias={-0.001}
        shadow-normalBias={0.02}
      />
    </>
  );
}

export default function TextMarquee() {
  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 55 }} shadows>
      <Scene />
    </Canvas>
  );
}
