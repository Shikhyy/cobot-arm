import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { Stage } from "./Stage";
import { director, sampleShots, VIEWS } from "./director";
import { useReducedMotion } from "./useMotionPreference";
import { MIN_FRAMING_RADIUS, baseAnchor, toolAnchor } from "./framing";

export interface RobotViewportProps {
  children?: ReactNode;
  /** Free camera home position, in world units. */
  home?: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  /** Change this value to trigger a camera reset. */
  resetSignal?: number;
  showGrid?: boolean;
  className?: string;
  /** Enable orbit / zoom / pan. */
  interactive?: boolean;
  /** Render the scroll-driven camera instead of a free camera. */
  scrollDriven?: boolean;
  /** Show the corner zoom controls. */
  showZoomControls?: boolean;
  /** Named inspection view; changing it moves the camera. */
  view?: string;
  /**
   * Keep the whole machine framed while it moves.
   *
   * The camera follows the tool: it re-aims at a point between the base and
   * the tool and eases back until both fit in shot, so driving a joystick
   * never walks the arm out of frame.
   */
  autoFrame?: boolean;
}

/** Imperative camera controls, shared between the overlay buttons and the rig. */
export interface ViewportApi {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/* ------------------------------------------------------------------ */

/** The default free-camera framing, in world units. */
const DEFAULT_HOME = {
  position: [7.3, 4.35, 9.1] as [number, number, number],
  target: [0.4, 2.3, 0] as [number, number, number],
  fov: 34,
};

export function RobotViewport({
  children,
  home = DEFAULT_HOME,
  resetSignal = 0,
  showGrid = true,
  className,
  interactive = true,
  scrollDriven = false,
  showZoomControls = false,
  view,
  autoFrame = false,
}: RobotViewportProps) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const api = useRef<ViewportApi | null>(null);

  /**
   * The camera configuration has to keep a stable identity.
   *
   * R3F re-applies the `camera` prop whenever it changes, so a fresh object
   * literal on every render would snap the camera back to its start position
   * and fight the view switcher and the scroll rig.
   */
  const cameraConfig = useMemo(
    () => ({
      position: [home.position[0], home.position[1], home.position[2]] as [number, number, number],
      fov: home.fov ?? 34,
      near: 0.1,
      far: 120,
    }),
    [home.position[0], home.position[1], home.position[2], home.fov],
  );

  if (failed) {
    return (
      <div className={`viewport viewport--error ${className ?? ""}`}>
        <div className="viewport__message">
          <span className="viewport__message-title">3D view unavailable</span>
          <span className="viewport__message-body">
            The WebGL context could not be created, or the CAD model failed to load. Every joint can
            still be driven from the control panels.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`viewport ${className ?? ""}`}>
      <ErrorCatcher onError={() => setFailed(true)}>
        <Canvas
          shadows
          dpr={[1, 1.75]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          camera={cameraConfig}
        >
          <Stage showGrid={showGrid} />
          <Suspense fallback={<Loader />}>
            {children}
          </Suspense>
          <CameraRig
            home={home}
            resetSignal={resetSignal}
            scrollDriven={scrollDriven}
            reduced={reduced}
            interactive={interactive}
            apiRef={api}
            view={view}
            autoFrame={autoFrame}
          />
          <VisibilityPause />
        </Canvas>
      </ErrorCatcher>

      {showZoomControls ? (
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            className="btn btn--sm !px-2.5 !py-1.5"
            aria-label="Zoom in"
            onClick={() => api.current?.zoomIn()}
          >
            +
          </button>
          <button
            type="button"
            className="btn btn--sm !px-2.5 !py-1.5"
            aria-label="Zoom out"
            onClick={() => api.current?.zoomOut()}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn--sm !px-2.5 !py-1.5"
            aria-label="Reset the camera"
            onClick={() => api.current?.reset()}
          >
            ⟲
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CameraRig({
  home,
  resetSignal,
  scrollDriven,
  reduced,
  interactive,
  apiRef,
  view,
  autoFrame,
}: {
  home: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  resetSignal: number;
  scrollDriven: boolean;
  reduced: boolean;
  interactive: boolean;
  apiRef: React.MutableRefObject<ViewportApi | null>;
  view?: string;
  autoFrame?: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const perspective = camera as PerspectiveCamera;

  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);
  const currentTarget = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const posePosition = useMemo(() => new THREE.Vector3(), []);
  const poseTarget = useMemo(() => new THREE.Vector3(), []);
  const poseFov = useRef(34);
  const animating = useRef(false);

  /* Auto-framing scratch vectors. */
  const frameMid = useMemo(() => new THREE.Vector3(), []);
  const frameDir = useMemo(() => new THREE.Vector3(), []);

  /** The framing a named inspection view asks for. */
  const poseFor = useCallback(
    (name?: string) => {
      const shot = name ? VIEWS[name] : undefined;
      const position = shot ? shot.position : home.position;
      const target = shot ? shot.target : home.target;
      const fov = shot ? shot.fov : home.fov;
      return { position, target, fov };
    },
    [home],
  );

  /** Starts a smooth move to a framing. */
  const moveTo = useCallback(
    (name?: string) => {
      const pose = poseFor(name);
      posePosition.set(...pose.position);
      poseTarget.set(...pose.target);
      poseFov.current = pose.fov ?? 34;
      currentTarget.set(...pose.target);
      animating.current = true;
    },
    [poseFor, posePosition, poseTarget, currentTarget],
  );

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    currentTarget.set(...home.target);
    controls.target.set(...home.target);
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetSignal === 0) return;
    moveTo(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  useEffect(() => {
    moveTo(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /* Imperative camera API used by the corner buttons. */
  useEffect(() => {
    const dolly = (factor: number) => {
      const controls = controlsRef.current;
      if (!controls) return;
      offset.copy(perspective.position).sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * factor, 1.8, 26);
      offset.setLength(distance);
      perspective.position.copy(controls.target).add(offset);
      animating.current = false;
      controls.update();
    };
    apiRef.current = {
      zoomIn: () => dolly(0.82),
      zoomOut: () => dolly(1.22),
      reset: () => moveTo(view),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, offset, perspective, moveTo, view]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const d = Math.min(delta, 0.05);

    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__rig = {
        animating: animating.current,
        interacting: director.interacting,
        pose: posePosition.toArray().map((v) => +v.toFixed(2)),
        poseTarget: poseTarget.toArray().map((v) => +v.toFixed(2)),
        currentTarget: currentTarget.toArray().map((v) => +v.toFixed(2)),
        pos: perspective.position.toArray().map((v) => +v.toFixed(2)),
        fov: +perspective.fov.toFixed(1),
      };
    }

    if (scrollDriven && !director.interacting) {
      const shot = sampleShots(director.progress);
      desiredPosition.copy(shot.position);
      desiredTarget.copy(shot.target);

      /**
       * Off-centre framing.
       *
       * On a wide screen the copy owns the left half of the viewport, so the
       * camera aims just left of the robot to push it into the right half of
       * the frame. On a narrow screen the copy sits underneath instead, so
       * the camera aims below the robot and the machine rises into the top.
       */
      const aspect = perspective.aspect;
      const dir = offset.copy(desiredTarget).sub(desiredPosition).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      if (aspect > 1.25) {
        const shift = THREE.MathUtils.clamp((aspect - 1.15) / 1.1, 0, 1) * 2.1;
        desiredTarget.addScaledVector(right, -shift);
        const pullBack = THREE.MathUtils.clamp((aspect - 1.25) * 0.42, 0, 0.55);
        if (pullBack > 0.001) {
          desiredPosition.sub(desiredTarget).multiplyScalar(1 + pullBack).add(desiredTarget);
        }
      } else {
        desiredPosition.sub(desiredTarget).multiplyScalar(1.4).add(desiredTarget);
        desiredTarget.y -= 1.15;
      }

      const k = reduced ? 1 : 1 - Math.pow(0.0009, d);
      perspective.position.lerp(desiredPosition, k);
      currentTarget.lerp(desiredTarget, k);
      controls.target.copy(currentTarget);
      perspective.lookAt(currentTarget);

      const nextFov = perspective.fov + (shot.fov - perspective.fov) * k;
      if (Math.abs(nextFov - perspective.fov) > 0.01) {
        perspective.fov = nextFov;
        perspective.updateProjectionMatrix();
      }
      return;
    }

    if (animating.current && !director.interacting) {
      /* A programmatic move owns the camera until it lands. OrbitControls
         keeps its own spherical state and would drag the camera back, so it
         is left alone while the move is in flight. */
      const k = reduced ? 1 : 1 - Math.pow(0.004, d);
      if (import.meta.env.DEV && Math.random() < 0.02) {
        console.log("[cam]", JSON.stringify({ pose: posePosition.toArray().map(v=>+v.toFixed(2)), cur: perspective.position.toArray().map(v=>+v.toFixed(2)), tgt: poseTarget.toArray().map(v=>+v.toFixed(2)), k: +k.toFixed(3), dist: +perspective.position.distanceTo(posePosition).toFixed(3) }));
      }
      perspective.position.lerp(posePosition, k);
      currentTarget.lerp(poseTarget, k);
      controls.target.copy(currentTarget);
      perspective.lookAt(currentTarget);
      const nextFov = perspective.fov + (poseFov.current - perspective.fov) * k;
      if (Math.abs(nextFov - perspective.fov) > 0.01) {
        perspective.fov = nextFov;
        perspective.updateProjectionMatrix();
      }
      if (perspective.position.distanceTo(posePosition) < 0.004) {
        animating.current = false;
      }
      return;
    }

    /**
     * Auto-framing.
     *
     * The camera keeps both the machine and its tool in shot: it aims at a
     * point between the base and the tool, and eases back until the pair
     * fits the frustum. The viewing direction the operator chose is kept, so
     * this only ever pans and dollies — it never spins the view around.
     */
    if (autoFrame && !director.interacting) {
      frameMid.copy(baseAnchor).lerp(toolAnchor, 0.55);

      const radius = Math.max(MIN_FRAMING_RADIUS, baseAnchor.distanceTo(toolAnchor) * 0.62);
      const vFov = THREE.MathUtils.degToRad(perspective.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(perspective.aspect, 0.5));
      const needed = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2));

      frameDir.copy(perspective.position).sub(currentTarget);
      if (frameDir.lengthSq() < 1e-6) frameDir.set(5, 2.2, 6.7);
      frameDir.normalize();

      /**
       * The camera pulls back when the arm reaches too far, but it never
       * pushes in on its own — the operator's own zoom is left alone.
       */
      const distance = Math.max(needed, perspective.position.distanceTo(currentTarget));
      desiredPosition.copy(frameMid).addScaledVector(frameDir, distance);

      const k = reduced ? 1 : 1 - Math.pow(0.02, d);
      perspective.position.lerp(desiredPosition, k);
      currentTarget.lerp(frameMid, k);
      controls.target.copy(currentTarget);
      perspective.lookAt(currentTarget);
      return;
    }

    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={interactive}
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.72}
      zoomSpeed={0.8}
      panSpeed={0.6}
      minDistance={1.8}
      maxDistance={26}
      minPolarAngle={0.16}
      maxPolarAngle={Math.PI * 0.495}
      onStart={() => {
        director.interacting = true;
      }}
      onEnd={() => {
        director.interacting = false;
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

/** Pause the render loop when the tab is hidden. */
function VisibilityPause() {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const controls = useThree((state) => state.controls);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      Object.assign(window as unknown as Record<string, unknown>, {
        __camera: camera,
        __scene: scene,
        __controls: controls,
        __director: director,
      });
    }
  }, [camera, scene, controls]);

  useEffect(() => {
    const onVisibility = () => {
      setFrameloop(document.hidden ? "never" : "always");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [setFrameloop]);

  useEffect(() => {
    const onLost = (event: Event) => event.preventDefault();
    gl.domElement.addEventListener("webglcontextlost", onLost);
    return () => gl.domElement.removeEventListener("webglcontextlost", onLost);
  }, [gl]);

  return null;
}

function Loader() {
  return (
    <Html center>
      <div className="viewport__loader">
        <span className="viewport__loader-bar" />
        <span className="viewport__loader-text">Loading CAD assembly…</span>
      </div>
    </Html>
  );
}

/* ------------------------------------------------------------------ */

interface BoundaryProps {
  children: ReactNode;
  onError: () => void;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function ErrorCatcher({ children, onError }: BoundaryProps) {
  return <Boundary onError={onError}>{children}</Boundary>;
}
