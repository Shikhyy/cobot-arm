import * as THREE from "three";

/**
 * Where the machine is, for the camera.
 *
 * The control dashboard has to keep the whole arm in frame while it moves,
 * otherwise driving a joystick walks the tool out of shot and the operator
 * loses sight of what the machine is doing. The rig publishes the tool's
 * world position here every frame; the camera reads it and re-frames.
 *
 * World units: 1 unit = 100 mm.
 */

/** The tool's world position, updated by the robot rig each frame. */
export const toolAnchor = new THREE.Vector3(2.07, 3.86, 0);

/** The machine's own centre of mass on the desk — the yaw column. */
export const baseAnchor = new THREE.Vector3(0, 0.62, 0);

/**
 * How much of the frame the machine is allowed to take up.
 *
 * The distance between the base and the tool sets how much room the camera
 * needs; this is the floor, so a folded arm is still framed comfortably.
 */
export const MIN_FRAMING_RADIUS = 1.45;
