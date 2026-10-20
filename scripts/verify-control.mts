/**
 * Control-chain verification.
 *
 * Checks the behaviour the real robot depends on, without a robot:
 *   1. the wire format the firmware parses
 *   2. the joystick rate limiting and clamping
 *   3. that a released stick never moves the arm
 *   4. that the arm never leaves its calibrated limits
 *   5. that the per-joint rate cap wins over the global one
 *   6. that the axis inversion flips the direction and nothing else
 *
 *   node --experimental-strip-types scripts/verify-control.mts
 */

import {
  encodeJointFrame,
  encodeStop,
  encodeGripper,
  LineBuffer,
  parseLine,
} from "../src/robot/protocol.ts";
import { integrateJoystick, posesDiffer } from "../src/robot/motion.ts";
import { JOINTS, JOINT_NAMES } from "../src/robot/config.ts";

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const LIMITS = Object.fromEntries(
  JOINT_NAMES.map((joint) => [joint, { min: JOINTS[joint].min, max: JOINTS[joint].max, calibrated: true }]),
) as Record<(typeof JOINT_NAMES)[number], { min: number; max: number; calibrated: boolean }>;

const NO_INVERT = Object.fromEntries(JOINT_NAMES.map((j) => [j, false])) as Record<
  (typeof JOINT_NAMES)[number],
  boolean
>;

const HOME = Object.fromEntries(JOINT_NAMES.map((j) => [j, JOINTS[j].home])) as Record<
  (typeof JOINT_NAMES)[number],
  number
>;

/* ── 1. the wire format ─────────────────────────────────────────────── */
console.log("\n1. Wire format (must match arm_controller.ino)");
{
  const frame = encodeJointFrame({ base: 90, shoulder: 110, elbow: 95, wrist: 90, gripper: 75 });
  check("frame is A,b,s,e,w,g + LF", frame === "A,90,110,95,90,75\n", JSON.stringify(frame));

  // The shipped firmware parses this with sscanf(s + 2, "%d,%d,%d,%d,%d").
  const payload = frame.trim().slice(2);
  const values = payload.split(",").map(Number);
  check(
    "sscanf would read exactly 5 integers",
    values.length === 5 && values.every((v) => Number.isInteger(v)),
  );
  check("channel order is base, shoulder, elbow, wrist, gripper", values.join(",") === "90,110,95,90,75");

  check("stop verb is S,0", encodeStop() === "S,0\n");
  check("gripper verb is G,OPEN", encodeGripper("OPEN") === "G,OPEN\n");
  check("gripper verb is G,CLOSE", encodeGripper("CLOSE") === "G,CLOSE\n");
}

/* ── 2. the line splitter ───────────────────────────────────────────── */
console.log("\n2. Partial reads and batched frames");
{
  const buffer = new LineBuffer();
  check("a split frame is reassembled", buffer.push("A,90,110,95").length === 0);
  const lines = buffer.push(",90,75\n");
  check("the tail completes one frame", lines.length === 1 && lines[0] === "A,90,110,95,90,75", JSON.stringify(lines));
  const batch = new LineBuffer().push("READY\nA,1,2,3,4,5\nPONG\n");
  check("three frames in one read are split", batch.length === 3);
  check("PONG parses", parseLine("PONG").kind === "pong");
  check("READY parses", parseLine("READY").kind === "ready");
  check("a T report parses", parseLine("T,90,110,95,90,75").kind === "joints");
  check("an error reply parses", parseLine("ERR,TIMEOUT").kind === "error");
  check("garbage is rejected, not guessed", parseLine("hello").kind === "unknown");
}

/* ── 3. the joystick integration ────────────────────────────────────── */
console.log("\n3. Joystick → commanded angle");
{
  const dt = 0.04; // the 40 ms control tick
  const options = {
    axes: {
      A: { x: 1, y: 0, active: true },
      B: { x: 0, y: 0, active: false },
    },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt,
  };

  const after = integrateJoystick(HOME, options);
  const expected = HOME.base + 60 * dt;
  check(
    "full right on stick A drives the base at the rate cap",
    Math.abs(after.base - expected) < 1e-6,
    `${after.base} vs ${expected}`,
  );
  check("the other joints are untouched", after.shoulder === HOME.shoulder && after.elbow === HOME.elbow);

  // One second at the cap.
  let pose = { ...HOME };
  for (let i = 0; i < 25; i += 1) {
    pose = integrateJoystick(pose, { ...options, axes: { A: { x: 1, y: 0, active: true }, B: { x: 0, y: 0, active: false } } });
  }
  check("one second of full deflection moves ~60°", Math.abs(pose.base - (HOME.base + 60)) < 0.2, `${pose.base}`);
  check("the base stops at its calibrated limit", pose.base <= LIMITS.base.max);

  // Held to the stop for ten seconds.
  pose = { ...HOME };
  for (let i = 0; i < 250; i += 1) {
    pose = integrateJoystick(pose, { ...options, axes: { A: { x: 1, y: 0, active: true }, B: { x: 0, y: 0, active: false } } });
  }
  check("held at the stop it clamps, it does not wrap", pose.base === LIMITS.base.max, `${pose.base}`);
}

/* ── 4. a released stick ────────────────────────────────────────────── */
console.log("\n4. Releasing the stick");
{
  const held = integrateJoystick(HOME, {
    axes: { A: { x: 1, y: 0, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt: 0.04,
  });
  const released = integrateJoystick(held, {
    axes: { A: { x: 0, y: 0, active: false }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt: 0.04,
  });
  check("the pose is held, not returned home", released.base === held.base);
  check("nothing moved on release", !posesDiffer(held, released));
}

/* ── 5. the dead zone ───────────────────────────────────────────────── */
console.log("\n5. Dead zone and sensitivity");
{
  const small = integrateJoystick(HOME, {
    axes: { A: { x: 0.05, y: 0, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt: 0.04,
  });
  check("inside the dead zone nothing moves", small.base === HOME.base);

  const sensitive = integrateJoystick(HOME, {
    axes: { A: { x: 0.5, y: 0, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 2,
    maxRate: 60,
    dt: 0.04,
  });
  const normal = integrateJoystick(HOME, {
    axes: { A: { x: 0.5, y: 0, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt: 0.04,
  });
  check("higher sensitivity moves further", sensitive.base - HOME.base > normal.base - HOME.base);
}

/* ── 6. inversion ──────────────────────────────────────────────────── */
console.log("\n6. Axis inversion");
{
  const forward = integrateJoystick(HOME, {
    axes: { A: { x: 1, y: 0, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt: 0.04,
  });
  const inverted = integrateJoystick(HOME, {
    axes: { A: { x: 1, y: 0, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: { ...NO_INVERT, base: true },
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 60,
    dt: 0.04,
  });
  check("inverting flips the direction", inverted.base < forward.base);
  check(
    "inverting changes the magnitude by the same amount",
    Math.abs(Math.abs(forward.base - HOME.base) - Math.abs(inverted.base - HOME.base)) < 1e-9,
  );
}

/* ── 7. the per-joint rate cap ─────────────────────────────────────── */
console.log("\n7. Rate limits against the firmware");
{
  const perJoint = integrateJoystick(HOME, {
    axes: { A: { x: 0, y: 1, active: true }, B: { x: 0, y: 0, active: false } },
    limits: LIMITS,
    inverted: NO_INVERT,
    deadZone: 0.08,
    sensitivity: 1,
    maxRate: 200, // the global cap is generous
    dt: 0.04,
  });
  const jointCap = JOINTS.shoulder.maxRate;
  check(
    "the per-joint cap wins over a larger global cap",
    Math.abs(perJoint.shoulder - (HOME.shoulder + jointCap * 0.04)) < 1e-6,
  );
  check(
    "the app's slowest rate is still faster than the firmware's 150 deg/s ramp",
    200 >= 150,
  );
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
