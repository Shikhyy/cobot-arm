/**
 * Central hardware + kinematics configuration.
 *
 * Everything the app knows about the physical robot lives here so the browser
 * side and the firmware side can never drift apart silently.
 *
 * PROVENANCE WARNING
 * ------------------
 * The joint angle limits below are the ones hard-coded in the shipped
 * `arm_controller.ino`. They are a *starting point*, not a measured calibration.
 * The real safe range of every joint depends on how the arm was assembled, and
 * must be established with the Calibration workflow on the /control page before
 * the robot is driven with load.
 */

/**
 * The servo channels, in the order they go on the wire.
 *
 * The prototype has six servos. Five of them drive the five articulated axes;
 * the sixth is the second shoulder servo, mounted on the far side of the
 * arm's tail so it turns the opposite way to its twin. The two are mirrored
 * mechanically, so one axis is driven by a pair.
 */
export const JOINT_NAMES = [
  "base",
  "shoulder1",
  "shoulder2",
  "elbow",
  "wrist",
  "wristRotation",
  "gripper",
] as const;

/**
 * The servo channels, in the order the sketch attaches them.
 *
 * The prototype has seven servos for six axes: the shoulder is driven by a
 * PAIR of servos mounted on opposite sides of the arm's tail. They turn the
 * opposite way to each other, so the app mirrors one onto the other.
 */
export type JointName = (typeof JOINT_NAMES)[number];

export interface JointSpec {
  /** Human label used across the UI. */
  label: string;
  /** Which physical joint this is, for the docs panel. */
  description: string;
  /** Arduino pin driving the servo. */
  pin: number;
  /** Servo travel, in degrees. */
  min: number;
  max: number;
  /** Neutral / rest angle used by the presets that need one. */
  home: number;
  /** Maximum commanded angular velocity, degrees per second. */
  maxRate: number;
  /** True when the physical axis is mirrored relative to the web UI. */
  inverted: boolean;
  /** Joints that must be calibrated before they may be driven. */
  requiresCalibration: boolean;
  /**
   * The channel this one mirrors. A servo mounted on the opposite side of
   * the arm has to turn the other way to move the arm the same way, so its
   * commanded angle is the reflection of its twin's about the pair's centre.
   */
  mirrorOf?: JointName;
  /** The channel that mirrors this one. */
  mirroredBy?: JointName;
  /** Set on a channel that has no user-facing control of its own. */
  hidden?: boolean;
  /** For a linear end effector: the angle that opens it, and the one that closes it. */
  openAngle?: number;
  closeAngle?: number;
}

export const JOINTS: Record<JointName, JointSpec> = {
  base: {
    label: "Base",
    description: "Yaw of the whole machine about the vertical column.",
    pin: 13,
    min: 0,
    max: 180,
    home: 90,
    maxRate: 120,
    inverted: false,
    requiresCalibration: true,
  },
  shoulder1: {
    label: "Shoulder",
    description: "Pitch of the upper arm, driven by a mirrored pair of servos.",
    pin: 9,
    min: 0,
    max: 180,
    home: 0,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
    mirroredBy: "shoulder2",
  },
  shoulder2: {
    label: "Shoulder (mirrored)",
    description: "Second shoulder servo, on the far side of the arm's tail.",
    pin: 10,
    min: 0,
    max: 180,
    home: 180,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
    mirrorOf: "shoulder1",
    hidden: true,
  },
  elbow: {
    label: "Elbow",
    description: "Pitch of the forearm at the end of the upper arm.",
    pin: 5,
    min: 0,
    max: 180,
    home: 180,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
  },
  wrist: {
    label: "Wrist",
    description: "Pitch of the tool. Sets the soldering angle of the held board.",
    pin: 6,
    min: 0,
    max: 180,
    home: 90,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
  },
  wristRotation: {
    label: "Wrist rotation",
    description: "Roll of the tool about the forearm axis. Turns the board in the fingers.",
    pin: 7,
    min: 0,
    max: 180,
    home: 150,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
  },
  gripper: {
    label: "Gripper",
    description: "Two-finger end effector. 0° is open, 180° is closed.",
    pin: 11,
    min: 0,
    max: 180,
    home: 90,
    maxRate: 60,
    inverted: false,
    requiresCalibration: false,
    openAngle: 0,
    closeAngle: 180,
  },
};

export const JOINT_ORDER: JointName[] = [
  "base",
  "shoulder1",
  "elbow",
  "wrist",
  "wristRotation",
  "gripper",
];

/**
 * The angle a mirrored channel has to be given so that it turns the opposite
 * way to its twin and still moves the arm the same way.
 */
export function mirrorAngle(joint: JointName, value: number): number {
  const spec = JOINTS[joint];
  const twin = spec.mirrorOf ?? spec.mirroredBy;
  if (!twin) return value;
  const other = JOINTS[twin];
  return other.home + (spec.home - value);
}

/** Serial settings. 115200 matches the shipped firmware. */
export const SERIAL = {
  defaultBaudRate: 115200,
  baudRates: [9600, 19200, 38400, 57600, 115200, 230400] as const,
  /** Maximum bytes the app is willing to accept in one line. */
  maxLineLength: 64,
} as const;

/** Firmware command verbs. `A` is the one the shipped firmware understands. */
export const COMMANDS = {
  /** A,<base>,<shoulder>,<elbow>,<wrist>,<gripper> */
  joints: "A",
  /** G,OPEN | G,CLOSE (firmware v2 only) */
  gripper: "G",
  /** S,0 — stop / hold current position (firmware v2 only) */
  stop: "S",
  /** HOME (firmware v2 only) */
  home: "HOME",
  /** P — ping (firmware v2 only) */
  ping: "P",
} as const;

/** How often the controller pushes a joint frame to the robot. */
export const CONTROL_TICK_MS = 40;

/** Neutral preset poses. Angles are *samples*, not a measured calibration. */
export interface Pose {
  base: number;
  shoulder1: number;
  shoulder2: number;
  elbow: number;
  wrist: number;
  wristRotation: number;
  gripper: number;
}

export interface Preset extends Pose {
  id: string;
  name: string;
  note: string;
  builtin: boolean;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "home",
    name: "Home",
    note: "Neutral rest pose. Sample angles — re-calibrate before trusting it.",
    base: 90,
    shoulder1: 0,
    shoulder2: 180,
    elbow: 180,
    wrist: 90,
    wristRotation: 150,
    gripper: 90,
    builtin: true,
  },
  {
    id: "pickup",
    name: "PCB Pickup",
    note: "Reaches down and forward towards the work tray. Sample angles.",
    base: 90,
    shoulder1: 25,
    shoulder2: 155,
    elbow: 140,
    wrist: 100,
    wristRotation: 150,
    gripper: 20,
    builtin: true,
  },
  {
    id: "solder-1",
    name: "Soldering Position 1",
    note: "Steep angle for through-hole work on the near edge of the board.",
    base: 90,
    shoulder1: 20,
    shoulder2: 160,
    elbow: 130,
    wrist: 80,
    wristRotation: 150,
    gripper: 30,
    builtin: true,
  },
  {
    id: "solder-2",
    name: "Soldering Position 2",
    note: "Shallow angle for surface-mount work along the board edge.",
    base: 90,
    shoulder1: 12,
    shoulder2: 168,
    elbow: 150,
    wrist: 110,
    wristRotation: 150,
    gripper: 30,
    builtin: true,
  },
  {
    id: "inspect",
    name: "Inspection",
    note: "Raises the board to eye level for checking the joint before soldering.",
    base: 90,
    shoulder1: 5,
    shoulder2: 175,
    elbow: 165,
    wrist: 120,
    wristRotation: 150,
    gripper: 60,
    builtin: true,
  },
];

/** Joystick configuration defaults. */
export const JOYSTICK_DEFAULTS = {
  sensitivity: 1,
  deadZone: 0.08,
  /** Degrees per second at full deflection, per joint, before sensitivity. */
  maxRate: 60,
} as const;
