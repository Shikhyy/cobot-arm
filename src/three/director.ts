import * as THREE from "three";

/**
 * Camera direction for the scroll-driven landing page.
 *
 * A single mutable object (not React state) so ScrollTrigger can write to it
 * at 60 fps without triggering a render, and so the camera rig can read it
 * inside `useFrame`.
 */

export interface Shot {
  name: string;
  /** Camera position in world units. */
  position: [number, number, number];
  /** Look-at target in world units. */
  target: [number, number, number];
  /** Field of view in degrees. */
  fov: number;
}

/**
 * The shots the landing page travels through.
 *
 * Distances are chosen so the whole arm (≈5.3 units tall at MM = 0.01) stays
 * inside the frame, with the tighter shots deliberately cropping in on the
 * joints.
 */
export const SHOTS: Shot[] = [
  {
    name: "hero",
    position: [6.4, 4.0, 7.6],
    target: [0.65, 2.1, 0],
    fov: 34,
  },
  {
    name: "anatomy",
    position: [5.5, 3.6, 6.5],
    target: [0.9, 2.4, 0],
    fov: 32,
  },
  {
    name: "joints",
    position: [3.9, 4.5, 4.7],
    target: [1.25, 3.35, 0],
    fov: 30,
  },
  {
    name: "links",
    position: [-4.5, 2.6, 5.6],
    target: [0.6, 2.6, 0],
    fov: 33,
  },
  {
    name: "controller",
    position: [5.4, 2.0, 6.8],
    target: [0.2, 0.9, 0],
    fov: 34,
  },
  {
    name: "outro",
    position: [7.6, 4.1, -6.6],
    target: [0.7, 2.0, 0],
    fov: 33,
  },
];

/**
 * Inspection views.
 *
 * Used by the 3D Explorer and the control dashboard to jump the camera to a
 * subsystem without losing the orbit controls.
 *
 * The framings follow the machine's home pose: the base box sits on the
 * desk, the drum turns at 1.1, the shoulder is at 1.58, the elbow at 3.52
 * and the tool reaches forward to 2.07.
 */
export const VIEWS: Record<string, Shot> = {
  full: {
    name: "Full",
    position: [5.6, 3.5, 6.3],
    target: [0.7, 1.9, 0],
    fov: 34,
  },
  base: {
    name: "Base",
    position: [3.3, 1.9, 3.5],
    target: [0.0, 0.9, 0],
    fov: 34,
  },
  head: {
    name: "Head",
    position: [1.3, 4.0, 2.4],
    target: [1.85, 3.45, 0],
    fov: 32,
  },
  arm: {
    name: "Arm",
    position: [3.5, 3.0, 3.7],
    target: [0.45, 2.5, 0],
    fov: 34,
  },
  gripper: {
    name: "Gripper",
    position: [3.0, 3.9, 1.7],
    target: [2.05, 3.5, 0],
    fov: 30,
  },
  "gripper-axis": {
    name: "End-on",
    position: [3.5, 3.6, 0.12],
    target: [2.05, 3.5, 0],
    fov: 36,
  },
};

export const director = {
  /** 0 → 1 across the whole landing story. */
  progress: 0,
  /** Set while the user is dragging the orbit controls. */
  interacting: false,
  /** When true the camera rig ignores scroll progress (explorer / control). */
  free: true,
  /** When true the camera rig eases towards the shot instead of snapping. */
  smooth: true,
};

const tmpPosition = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

/**
 * Interpolate the shot list at `t` (0..1) and return the camera position,
 * look-at target and fov.
 */
export function sampleShots(t: number): { position: THREE.Vector3; target: THREE.Vector3; fov: number } {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const scaled = clamped * (SHOTS.length - 1);
  const index = Math.min(SHOTS.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = SHOTS[index];
  const b = SHOTS[index + 1];
  const eased = local * local * (3 - 2 * local);

  tmpPosition.set(
    THREE.MathUtils.lerp(a.position[0], b.position[0], eased),
    THREE.MathUtils.lerp(a.position[1], b.position[1], eased),
    THREE.MathUtils.lerp(a.position[2], b.position[2], eased),
  );
  tmpTarget.set(
    THREE.MathUtils.lerp(a.target[0], b.target[0], eased),
    THREE.MathUtils.lerp(a.target[1], b.target[1], eased),
    THREE.MathUtils.lerp(a.target[2], b.target[2], eased),
  );
  const fov = THREE.MathUtils.lerp(a.fov, b.fov, eased);
  return { position: tmpPosition, target: tmpTarget, fov };
}
