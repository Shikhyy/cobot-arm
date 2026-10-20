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

export const JOINT_NAMES = ["base", "shoulder", "elbow", "wrist", "gripper"] as const;
export type JointName = (typeof JOINT_NAMES)[number];

export interface JointSpec {
  /** Human label used across the UI. */
  label: string;
  /** Which physical joint this is, for the docs panel. */
  description: string;
  /** Arduino pin driving the servo (from the shipped firmware). */
  pin: number;
  /** Servo travel, in degrees, as written in the firmware. */
  min: number;
  max: number;
  /** Neutral / rest angle used by presets that need one. */
  home: number;
  /** Maximum commanded angular velocity, degrees per second. */
  maxRate: number;
  /** True when the physical axis is mirrored relative to the web UI. */
  inverted: boolean;
  /** Joints that must be calibrated before they may be driven. */
  requiresCalibration: boolean;
}

export const JOINTS: Record<JointName, JointSpec> = {
  base: {
    label: "Base",
    description: "Turntable yaw. Rotates the whole column about the vertical axis.",
    pin: 3,
    min: 0,
    max: 180,
    home: 90,
    maxRate: 120,
    inverted: false,
    requiresCalibration: true,
  },
  shoulder: {
    label: "Shoulder",
    description: "Pitch of the upper arm link. Carries the whole arm mass.",
    pin: 5,
    min: 20,
    max: 160,
    home: 110,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
  },
  elbow: {
    label: "Elbow",
    description: "Pitch of the forearm link at the end of the upper arm.",
    pin: 6,
    min: 20,
    max: 160,
    home: 95,
    maxRate: 90,
    inverted: false,
    requiresCalibration: true,
  },
  wrist: {
    label: "Wrist",
    description: "Final pitch that sets the soldering angle of the held board.",
    pin: 9,
    min: 0,
    max: 180,
    home: 90,
    maxRate: 120,
    inverted: false,
    requiresCalibration: true,
  },
  gripper: {
    label: "Gripper",
    description: "Two-finger end effector. Larger angle = more open.",
    pin: 10,
    min: 30,
    max: 120,
    home: 75,
    maxRate: 90,
    inverted: false,
    requiresCalibration: false,
  },
};

export const JOINT_ORDER: JointName[] = ["base", "shoulder", "elbow", "wrist", "gripper"];

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
  shoulder: number;
  elbow: number;
  wrist: number;
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
    shoulder: 110,
    elbow: 95,
    wrist: 90,
    gripper: 75,
    builtin: true,
  },
  {
    id: "pickup",
    name: "PCB Pickup",
    note: "Reaches down and forward towards the work tray. Sample angles.",
    base: 90,
    shoulder: 145,
    elbow: 55,
    wrist: 110,
    gripper: 115,
    builtin: true,
  },
  {
    id: "solder-1",
    name: "Soldering Position 1",
    note: "Steep angle for through-hole work on the near edge of the board.",
    base: 90,
    shoulder: 125,
    elbow: 70,
    wrist: 60,
    gripper: 70,
    builtin: true,
  },
  {
    id: "solder-2",
    name: "Soldering Position 2",
    note: "Shallow angle for surface-mount work along the board edge.",
    base: 90,
    shoulder: 100,
    elbow: 85,
    wrist: 125,
    gripper: 70,
    builtin: true,
  },
  {
    id: "inspect",
    name: "Inspection",
    note: "Raises the board to eye level for checking the joint before soldering.",
    base: 90,
    shoulder: 65,
    elbow: 40,
    wrist: 100,
    gripper: 90,
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
