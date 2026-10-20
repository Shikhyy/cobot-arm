/**
 * The control maths, kept pure so it can be tested without a browser, a
 * serial port or a robot.
 *
 * These are the rules the virtual sticks, the sliders and the wire encoder
 * all obey. Keeping them here means the behaviour that matters for the real
 * machine can be checked in one place.
 */

import { JOINTS, mirrorAngle, type JointName } from "./config";
import type { JointAngles, JointLimit } from "./store";
import { shapeAxis } from "./joystick";

/** Which joint each joystick axis drives. */
export const AXIS_MAP: Record<"A" | "B", { x: JointName; y: JointName }> = {
  A: { x: "base", y: "shoulder1" },
  B: { x: "elbow", y: "wrist" },
};

export interface StickState {
  x: number;
  y: number;
  active: boolean;
}

export interface IntegrateOptions {
  axes: Record<"A" | "B", StickState>;
  limits: Record<JointName, JointLimit>;
  inverted: Record<JointName, boolean>;
  deadZone: number;
  sensitivity: number;
  /** Global cap on the commanded rate, degrees per second. */
  maxRate: number;
  /** Time since the last integration, in seconds. */
  dt: number;
}

/**
 * Turn the current stick positions into the next commanded angles.
 *
 * The sticks are *velocity* controls: they add to the commanded angle at a
 * bounded rate. A released stick contributes nothing, so the arm stays where
 * it is — it is never pulled back to a previous or home pose.
 *
 * Returns a new object; the input is never mutated.
 */
export function integrateJoystick(
  joints: JointAngles,
  options: IntegrateOptions,
): JointAngles {
  const next: JointAngles = { ...joints };

  for (const id of ["A", "B"] as const) {
    const raw = options.axes[id];
    if (!raw.active) continue;
    const map = AXIS_MAP[id];

    for (const axis of ["x", "y"] as const) {
      const joint = map[axis];
      const sign = options.inverted[joint] ? -1 : 1;
      const value = shapeAxis(raw[axis], options.deadZone, options.sensitivity) * sign;
      if (value === 0) continue;

      // The per-joint rate is the lower of the global cap and the joint's own
      // limit, so a fast joint cannot be flogged by a fast stick.
      const rate = Math.min(options.maxRate, JOINTS[joint].maxRate);
      const limit = options.limits[joint];
      const candidate = next[joint] + value * rate * options.dt;
      next[joint] = Math.min(limit.max, Math.max(limit.min, candidate));
    }
  }

  return next;
}

/**
 * Mirrors a channel onto its twin, in place.
 *
 * The two shoulder servos sit on opposite sides of the arm's tail, so to move
 * the arm one way one servo has to turn the other way. The mirrored value is
 * the reflection of its twin's angle about the pair's centre, clamped to the
 * twin's own limits.
 */
export function mirrorInto(
  joints: JointAngles,
  joint: JointName,
  limits: Record<JointName, JointLimit>,
): JointAngles {
  const spec = JOINTS[joint];
  const twin = spec.mirrorOf ?? spec.mirroredBy;
  if (!twin) return joints;
  const limit = limits[twin];
  joints[twin] = Math.min(limit.max, Math.max(limit.min, mirrorAngle(joint, joints[joint])));
  return joints;
}

/** True when two poses differ by more than the given epsilon. */
export function posesDiffer(a: JointAngles, b: JointAngles, epsilon = 1e-4): boolean {
  for (const joint of Object.keys(a) as JointName[]) {
    if (Math.abs(a[joint] - b[joint]) > epsilon) return true;
  }
  return false;
}
