import { Environment, Grid, Lightformer } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useThemeStore } from "../theme";

/** Tone mapping exposure — the WebGLRenderer constructor cannot set it. */
function Exposure({ value }: { value: number }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

interface Palette {
  background: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ambient: string;
  ambientIntensity: number;
  ground: string;
  bounce: string;
  keyIntensity: number;
  rimIntensity: number;
  fillIntensity: number;
  pointIntensity: number;
  exposure: number;
  gridCell: string;
  gridSection: string;
  shadowOpacity: number;
}

const DARK: Palette = {
  background: "#07080a",
  fog: "#07080a",
  fogNear: 16,
  fogFar: 40,
  ambient: "#a8b3c7",
  ambientIntensity: 0.66,
  ground: "#251009",
  bounce: "#ff7a55",
  keyIntensity: 3.1,
  rimIntensity: 2.1,
  fillIntensity: 1.2,
  pointIntensity: 13,
  exposure: 0.95,
  gridCell: "#1c2029",
  gridSection: "#2b313d",
  shadowOpacity: 0.5,
};

const LIGHT: Palette = {
  background: "#e9ebf0",
  fog: "#e9ebf0",
  fogNear: 18,
  fogFar: 46,
  ambient: "#ffffff",
  ambientIntensity: 1.15,
  ground: "#c9cdd6",
  bounce: "#ffb59a",
  keyIntensity: 2.4,
  rimIntensity: 1.05,
  fillIntensity: 0.9,
  pointIntensity: 8,
  exposure: 0.85,
  gridCell: "#d5d9e1",
  gridSection: "#bcc3cf",
  shadowOpacity: 0.3,
};

/**
 * Studio stage.
 *
 * Deep graphite background, a single warm key light with soft shadows, a cool
 * rim to separate the printed parts from the background, and a procedural
 * environment map built from lightformers (no HDR download, so the site works
 * fully offline). The whole rig re-lights for the light theme.
 */
export function Stage({ showGrid = true }: { showGrid?: boolean }) {
  const theme = useThemeStore((state) => state.theme);
  const palette = theme === "light" ? LIGHT : DARK;

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.fog, palette.fogNear, palette.fogFar]} />
      <Exposure value={palette.exposure} />

      <ambientLight intensity={palette.ambientIntensity} color={palette.ambient} />
      <hemisphereLight args={["#b6c8e6", palette.ground, theme === "light" ? 1.3 : 1.1]} />

      {/* key — front, high and to the right, so the top faces of the links
          catch the highlight without the turret plate shadowing the base */}
      <directionalLight
        position={[6.2, 6.4, 7.4]}
        intensity={palette.keyIntensity}
        color="#fff4e8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-normalBias={0.014}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={7}
        shadow-camera-bottom={-3}
      />

      {/* hard rim from behind-left, so the silhouette and every chamfer
          read against the dark background */}
      <directionalLight position={[-6.4, 4.4, -5.6]} intensity={palette.rimIntensity} color="#9dbcff" />
      {/* a second, lower kicker from behind-right, which picks out the far
          edge of the tail and the far side of the drum */}
      <directionalLight position={[4.8, 2.1, -6.2]} intensity={palette.rimIntensity * 0.55} color="#c9d8ff" />
      {/* warm front-left fill, which lifts the shadow side without
          flattening the key */}
      <directionalLight position={[-4.5, 2.6, 6.4]} intensity={palette.fillIntensity} color="#ffd9c2" />
      {/* bounce, borrowed from the printed filament */}
      <directionalLight position={[-1.6, -3.2, 3.4]} intensity={1.1} color={palette.bounce} />
      {/* soft top fill */}
      <pointLight
        position={[0, 6.4, 1.2]}
        intensity={palette.pointIntensity}
        distance={22}
        decay={2}
        color="#cfe0ff"
      />
      {/* a close, low light that grazes the base and the underside of the
          links, so the machine does not float */}
      <pointLight
        position={[2.6, 0.9, 3.2]}
        intensity={palette.pointIntensity * 0.18}
        distance={9}
        decay={2}
        color="#ffb59a"
      />

      <Environment resolution={256} frames={1}>
        <Lightformer intensity={4} position={[0, 6, -8]} scale={[12, 6, 1]} color="#8ea6d6" />
        <Lightformer intensity={3} position={[6, 2, 4]} scale={[4, 8, 1]} color="#fff1e2" />
        <Lightformer intensity={2.4} position={[-6, 1, 2]} scale={[4, 6, 1]} color="#ff7a55" />
        <Lightformer intensity={2} position={[0, -6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} color="#1a1c22" />
        <Lightformer intensity={0.35} position={[0, 9, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} color="#dce6ff" />
      </Environment>

      {showGrid ? <StageFloor palette={palette} /> : null}
    </>
  );
}

function StageFloor({ palette }: { palette: Palette }) {
  const gridArgs = useMemo(
    () => ({
      cellSize: 0.5,
      cellThickness: 0.5,
      cellColor: new THREE.Color(palette.gridCell),
      sectionSize: 2.5,
      sectionThickness: 0.9,
      sectionColor: new THREE.Color(palette.gridSection),
      fadeDistance: 26,
      fadeStrength: 1.4,
      followCamera: false,
      infiniteGrid: true,
    }),
    [palette.gridCell, palette.gridSection],
  );

  return (
    <>
      <Grid args={[40, 40]} {...gridArgs} position={[0, -0.001, 0]} />
      {/* shadow catcher */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.004, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial transparent opacity={palette.shadowOpacity} color="#000000" />
      </mesh>
    </>
  );
}
