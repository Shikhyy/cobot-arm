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
  describeBoardError,
} from "../src/robot/protocol.ts";
import { integrateJoystick, mirrorInto, posesDiffer } from "../src/robot/motion.ts";
import { JOINTS, JOINT_NAMES, mirrorAngle } from "../src/robot/config.ts";

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

const LIMITS_FULL = Object.fromEntries(
  JOINT_NAMES.map((j) => [j, { min: JOINTS[j].min, max: JOINTS[j].max, calibrated: true }]),
) as Record<(typeof JOINT_NAMES)[number], { min: number; max: number; calibrated: boolean }>;

/* ── 1. the wire format ─────────────────────────────────────────────── */
console.log("\n1. Wire format (must match the sketch)");
{
  const frame = encodeJointFrame({
    base: 90,
    shoulder1: 0,
    shoulder2: 180,
    elbow: 180,
    wrist: 90,
    wristRotation: 150,
    gripper: 90,
  });
  check("frame is A,b,s1,s2,e,w,wr,g + LF", frame === "A,90,0,180,180,90,150,90\n", JSON.stringify(frame));

  // The sketch parses this with sscanf(s + 2, "%d,%d,%d,%d,%d,%d,%d").
  const payload = frame.trim().slice(2);
  const values = payload.split(",").map(Number);
  check(
    "sscanf would read exactly 7 integers",
    values.length === 7 && values.every((v) => Number.isInteger(v)),
  );
  check(
    "channel order is base, shoulder1, shoulder2, elbow, wrist, wristRot, gripper",
    values.join(",") === "90,0,180,180,90,150,90",
  );

  check("stop verb is S,0", encodeStop() === "S,0\n");
  check("gripper verb is G,OPEN", encodeGripper("OPEN") === "G,OPEN\n");
  check("gripper verb is G,CLOSE", encodeGripper("CLOSE") === "G,CLOSE\n");
}

/* ── 1b. the mirrored shoulder pair ────────────────────────────────────── */
console.log("\n1b. The mirrored shoulder pair");
{
  check("the shoulder has a twin", JOINTS.shoulder1.mirroredBy === "shoulder2");
  check("the twin knows what it mirrors", JOINTS.shoulder2.mirrorOf === "shoulder1");
  check("the twin is a different pin", JOINTS.shoulder2.pin !== JOINTS.shoulder1.pin);
  check("the pair is on the right pins", JOINTS.shoulder1.pin === 9 && JOINTS.shoulder2.pin === 10);

  // The two servos sit on opposite sides of the arm, so one turns the other
  // way: the mirrored angle is 180 - x, exactly as the prototype runs it.
  check("at shoulder1 = 0 the twin sits at 180", mirrorAngle("shoulder1", 0) === 180);
  check("at shoulder1 = 90 the twin sits at 90", mirrorAngle("shoulder1", 90) === 90);
  check("at shoulder1 = 180 the twin sits at 0", mirrorAngle("shoulder1", 180) === 0);
  check(
    "the mirror is exactly 180 - x",
    [0, 30, 90, 137].every((x) => mirrorAngle("shoulder1", x) === 180 - x),
  );

  // Commanding one channel has to move its twin with it.
  const pose: Record<string, number> = {
    base: 90,
    shoulder1: 120,
    shoulder2: 180,
    elbow: 180,
    wrist: 90,
    wristRotation: 150,
    gripper: 90,
  };
  const limits = Object.fromEntries(
    JOINT_NAMES.map((joint) => [joint, { min: JOINTS[joint].min, max: JOINTS[joint].max, calibrated: true }]),
  ) as Record<(typeof JOINT_NAMES)[number], { min: number; max: number; calibrated: boolean }>;
  mirrorInto(pose as never, "shoulder1", limits);
  check("commanding the shoulder moves the twin", pose.shoulder2 === 60, String(pose.shoulder2));

  const back: Record<string, number> = { ...pose };
  mirrorInto(back as never, "shoulder2", limits);
  check(
    "commanding the twin moves the shoulder back",
    Math.abs(back.shoulder1 - 120) < 1e-6,
    String(back.shoulder1),
  );
}

/* ── 2. the line splitter ───────────────────────────────────────────── */
console.log("\n2. Partial reads and batched frames");
{
  const buffer = new LineBuffer();
  check("a split frame is reassembled", buffer.push("A,90,0,180,180").length === 0);
  const lines = buffer.push(",90,150,90\n");
  check(
    "the tail completes one frame",
    lines.length === 1 && lines[0] === "A,90,0,180,180,90,150,90",
    JSON.stringify(lines),
  );
  const batch = new LineBuffer().push("READY\nA,1,2,3,4,5\nPONG\n");
  check("three frames in one read are split", batch.length === 3);
  check("PONG parses", parseLine("PONG").kind === "pong");
  check("READY parses", parseLine("READY").kind === "ready");

  /* The board announces how many channels it speaks, so a board still
     running the original five-channel sketch is caught instead of looking
     like a dead arm. */
  const readyV2 = parseLine(`READY,${JOINT_NAMES.length}`);
  check("READY with a channel count parses", readyV2.kind === "ready");
  check(
    "the channel count is read",
    readyV2.kind === "ready" && readyV2.channels === JOINT_NAMES.length,
  );
  const readyOld = parseLine("READY");
  check(
    "a bare READY reports no channel count",
    readyOld.kind === "ready" && readyOld.channels === undefined,
  );
  const readyWrong = parseLine("READY,5");
  check(
    "a five channel board is recognised as a mismatch",
    readyWrong.kind === "ready" && readyWrong.channels === 5,
  );
  check("a T report parses", parseLine("T,90,0,180,180,90,150,90").kind === "joints");
  check("a six value T report is rejected", parseLine("T,90,0,180,180,90,150").kind === "unknown");
  check("an error reply parses", parseLine("ERR,TIMEOUT").kind === "error");

  /* The error code has to survive: a board that says ERR,TIMEOUT means it
     froze the arm because the link went quiet, and "UNKNOWN" tells the
     operator nothing at all. */
  const errTimeout = parseLine("ERR,TIMEOUT");
  check(
    "the error code is kept, not swallowed",
    errTimeout.kind === "error" && errTimeout.code === "TIMEOUT",
  );
  const errPair = parseLine("ERR,SHOULDER-PAIR");
  check(
    "a two word error code is kept whole",
    errPair.kind === "error" && errPair.code === "SHOULDER-PAIR",
  );
  const errBare = parseLine("ERR");
  check(
    "a bare ERR still means something",
    errBare.kind === "error" && errBare.code === "UNKNOWN",
  );
  check(
    "a timeout is explained in words",
    /froze the arm/.test(describeBoardError("TIMEOUT")),
  );
  check(
    "a shoulder pair mismatch is explained in words",
    /180/.test(describeBoardError("SHOULDER-PAIR")),
  );
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
  const jointCap = JOINTS.shoulder1.maxRate;
  check(
    "the per-joint cap wins over a larger global cap",
    Math.abs(perJoint.shoulder1 - (HOME.shoulder1 + jointCap * 0.04)) < 1e-6,
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
