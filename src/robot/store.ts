/**
 * The single source of truth for robot state.
 *
 * Everything — the 3D rig, the sliders, the joysticks, the wire encoder —
 * reads the commanded joint angles from this store. There is deliberately no
 * second copy of the pose anywhere in the app, so the model can never disagree
 * with the hardware.
 */

import { create } from "zustand";
import {
  BUILTIN_PRESETS,
  JOINTS,
  JOINT_NAMES,
  JOYSTICK_DEFAULTS,
  SERIAL,
  type JointName,
  type Preset,
} from "./config";
import { mirrorInto } from "./motion";
import type { TransportKind, TransportStatus } from "./transport/RobotTransport";

export type JointAngles = Record<JointName, number>;

export interface JointLimit {
  min: number;
  max: number;
  calibrated: boolean;
}

export interface ConnectionState {
  status: TransportStatus;
  mode: TransportKind | null;
  portLabel: string;
  baudRate: number;
  /** True once the controller has announced itself with READY. */
  ready: boolean;
  /** How many serial ports this browser has already been granted. */
  grantedPorts: number;
  lastMessage: string;
  error: string | null;
  hint: string | null;
  /**
   * The controller's own report of its targets, from the `T` verb.
   *
   * This is the only thing the board ever says about itself, and it is the
   * operator's proof that the link is alive and that the board understood
   * the frame: the servos have no position feedback, so the report is of
   * the commanded angles, not of where the arm actually is.
   */
  reported: JointAngles | null;
  /** Timestamp of the last byte in either direction. */
  lastActivity: number;
  txCount: number;
  rxCount: number;
}

interface RobotState {
  /** Commanded joint angles. The servos have no feedback, so these are targets. */
  joints: JointAngles;
  limits: Record<JointName, JointLimit>;

  /** Per-joint UI options. */
  inverted: Record<JointName, boolean>;
  /**
   * Per-joint offset between the servo angle and the joint angle, in degrees.
   *
   * A servo's mechanical centre is rarely at 90°, so the number the app
   * shows is the servo angle, not the angle of the link. These offsets let
   * the model be lined up with the real machine: set the offset once, and the
   * 3D view then shows the pose the arm is actually in.
   */
  offsets: Record<JointName, number>;
  increment: number;
  sensitivity: number;
  deadZone: number;
  maxRate: number;

  connection: ConnectionState;
  presets: Preset[];

  /**
   * Reconnect automatically when the board is plugged back in.
   *
   * This is the Arduino IDE behaviour: the first connection asks once, after
   * that the browser remembers the port and the app takes it again by itself.
   */
  autoConnect: boolean;

  /** UI-only state shared between the 3D rig and the panels. */
  selectedPart: string | null;
  exploded: boolean;
  showLabels: boolean;
  hardwareArmed: boolean;
  motionLocked: boolean;

  setJoint: (joint: JointName, value: number) => void;
  setJoints: (angles: Partial<JointAngles>) => void;
  nudgeJoint: (joint: JointName, delta: number) => void;
  applyPreset: (preset: Preset) => void;
  savePreset: (name: string, angles: JointAngles) => void;
  removePreset: (id: string) => void;
  setLimit: (joint: JointName, limit: Partial<JointLimit>) => void;
  resetCalibration: () => void;
  setInverted: (joint: JointName, value: boolean) => void;
  setOffset: (joint: JointName, value: number) => void;
  setIncrement: (value: number) => void;
  setSensitivity: (value: number) => void;
  setDeadZone: (value: number) => void;
  setMaxRate: (value: number) => void;
  setConnection: (patch: Partial<ConnectionState>) => void;
  noteActivity: (direction: "tx" | "rx", bytes: number) => void;
  setSelectedPart: (name: string | null) => void;
  setExploded: (value: boolean) => void;
  setShowLabels: (value: boolean) => void;
  setHardwareArmed: (value: boolean) => void;
  setAutoConnect: (value: boolean) => void;
  setMotionLocked: (value: boolean) => void;
}

const DEFAULT_LIMITS: Record<JointName, JointLimit> = JOINT_NAMES.reduce(
  (acc, joint) => {
    acc[joint] = { min: JOINTS[joint].min, max: JOINTS[joint].max, calibrated: false };
    return acc;
  },
  {} as Record<JointName, JointLimit>,
);

const DEFAULT_ANGLES: JointAngles = JOINT_NAMES.reduce((acc, joint) => {
  acc[joint] = JOINTS[joint].home;
  return acc;
}, {} as JointAngles);

const STORAGE_KEY = "cobot.pcb-fixture.v1";

interface PersistedState {
  presets?: Preset[];
  limits?: Record<JointName, JointLimit>;
  inverted?: Record<JointName, boolean>;
  offsets?: Record<JointName, number>;
  increment?: number;
  sensitivity?: number;
  deadZone?: number;
  maxRate?: number;
  autoConnect?: boolean;
}

function loadPersisted(): PersistedState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persist(state: RobotState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedState = {
      presets: state.presets,
      limits: state.limits,
      inverted: state.inverted,
      offsets: state.offsets,
      increment: state.increment,
      sensitivity: state.sensitivity,
      deadZone: state.deadZone,
      maxRate: state.maxRate,
      autoConnect: state.autoConnect,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage may be unavailable in private mode; the app still works */
  }
}

const persisted = loadPersisted();

function mergeLimits(): Record<JointName, JointLimit> {
  const out = { ...DEFAULT_LIMITS };
  if (persisted.limits) {
    for (const joint of JOINT_NAMES) {
      const saved = persisted.limits[joint];
      if (!saved) continue;
      out[joint] = {
        min: Number.isFinite(saved.min) ? saved.min : out[joint].min,
        max: Number.isFinite(saved.max) ? saved.max : out[joint].max,
        calibrated: Boolean(saved.calibrated),
      };
    }
  }
  return out;
}

function mergePresets(): Preset[] {
  const custom = (persisted.presets ?? []).filter((preset) => !preset.builtin);
  return [...BUILTIN_PRESETS, ...custom];
}

function mergeOffsets(): Record<JointName, number> {
  const out = {} as Record<JointName, number>;
  for (const joint of JOINT_NAMES) {
    const value = persisted.offsets?.[joint];
    out[joint] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return out;
}

function mergeInverted(): Record<JointName, boolean> {
  const out = {} as Record<JointName, boolean>;
  for (const joint of JOINT_NAMES) {
    out[joint] = persisted.inverted?.[joint] ?? JOINTS[joint].inverted;
  }
  return out;
}

export const useRobotStore = create<RobotState>((set, get) => ({
  joints: { ...DEFAULT_ANGLES },
  limits: mergeLimits(),
  inverted: mergeInverted(),
  offsets: mergeOffsets(),
  increment: persisted.increment ?? 5,
  sensitivity: persisted.sensitivity ?? JOYSTICK_DEFAULTS.sensitivity,
  deadZone: persisted.deadZone ?? JOYSTICK_DEFAULTS.deadZone,
  maxRate: persisted.maxRate ?? JOYSTICK_DEFAULTS.maxRate,

  connection: {
    status: "disconnected",
    mode: null,
    portLabel: "",
    baudRate: SERIAL.defaultBaudRate,
    ready: false,
    grantedPorts: 0,
    lastMessage: "—",
    reported: null,
    error: null,
    hint: null,
    lastActivity: 0,
    txCount: 0,
    rxCount: 0,
  },

  presets: mergePresets(),

  autoConnect: persisted.autoConnect ?? true,

  selectedPart: null,
  exploded: false,
  showLabels: true,
  hardwareArmed: false,
  motionLocked: false,

  setJoint(joint, value) {
    const { limits } = get();
    const limit = limits[joint];
    const clamped = Math.min(limit.max, Math.max(limit.min, value));
    const current = get().joints[joint];
    if (Math.abs(clamped - current) < 1e-4) return;

    set((state) => {
      const joints = { ...state.joints, [joint]: clamped };
      /* Keep a mirrored pair in step: the two shoulder servos are on opposite
         sides of the arm, so one has to turn the other way. */
      mirrorInto(joints, joint, state.limits);
      return { joints };
    });
  },

  setJoints(angles) {
    set((state) => {
      const next = { ...state.joints };
      for (const joint of JOINT_NAMES) {
        const value = angles[joint];
        if (value === undefined || !Number.isFinite(value)) continue;
        const limit = state.limits[joint];
        next[joint] = Math.min(limit.max, Math.max(limit.min, value));
      }
      /* Apply the mirroring last, so a pair can never be commanded out of
         step with itself. */
      for (const joint of JOINT_NAMES) {
        if (angles[joint] !== undefined) mirrorInto(next, joint, state.limits);
      }
      return { joints: next };
    });
  },

  nudgeJoint(joint, delta) {
    const state = get();
    state.setJoint(joint, state.joints[joint] + delta);
  },

  applyPreset(preset) {
    get().setJoints({
      base: preset.base,
      shoulder1: preset.shoulder1,
      elbow: preset.elbow,
      wrist: preset.wrist,
      wristRotation: preset.wristRotation,
      gripper: preset.gripper,
    });
  },

  savePreset(name, angles) {
    const preset: Preset = {
      id: `custom-${Date.now().toString(36)}`,
      name: name.trim() || "Custom pose",
      note: "Saved from the controller. Angles are commanded values, not measured.",
      builtin: false,
      ...angles,
    };
    set((state) => ({ presets: [...state.presets, preset] }));
    persist(get());
  },

  removePreset(id) {
    set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) }));
    persist(get());
  },

  setLimit(joint, limit) {
    set((state) => ({
      limits: { ...state.limits, [joint]: { ...state.limits[joint], ...limit } },
    }));
    const current = get().joints[joint];
    get().setJoint(joint, current);
    persist(get());
  },

  resetCalibration() {
    set({ limits: { ...DEFAULT_LIMITS } });
    persist(get());
  },

  setInverted(joint, value) {
    set((state) => ({ inverted: { ...state.inverted, [joint]: value } }));
    persist(get());
  },

  setOffset(joint, value) {
    const clamped = Math.max(-90, Math.min(90, Math.round(value)));
    set((state) => ({ offsets: { ...state.offsets, [joint]: clamped } }));
    persist(get());
  },

  setIncrement(value) {
    set({ increment: Math.max(0.5, Math.min(45, value)) });
    persist(get());
  },

  setSensitivity(value) {
    set({ sensitivity: Math.max(0.1, Math.min(3, value)) });
    persist(get());
  },

  setDeadZone(value) {
    set({ deadZone: Math.max(0, Math.min(0.45, value)) });
    persist(get());
  },

  setMaxRate(value) {
    set({ maxRate: Math.max(5, Math.min(240, value)) });
    persist(get());
  },

  setConnection(patch) {
    set((state) => ({ connection: { ...state.connection, ...patch } }));
  },

  noteActivity(direction, bytes) {
    set((state) => ({
      connection: {
        ...state.connection,
        lastActivity: Date.now(),
        txCount: state.connection.txCount + (direction === "tx" ? bytes : 0),
        rxCount: state.connection.rxCount + (direction === "rx" ? bytes : 0),
      },
    }));
  },

  setSelectedPart(name) {
    set({ selectedPart: name });
  },

  setExploded(value) {
    set({ exploded: value });
  },

  setShowLabels(value) {
    set({ showLabels: value });
  },

  setHardwareArmed(value) {
    set({ hardwareArmed: value });
  },

  setAutoConnect(value) {
    set({ autoConnect: value });
    persist(get());
  },

  setMotionLocked(value) {
    set({ motionLocked: value });
  },
}));

/** Clamp helper shared by the control loop and the UI. */
export function clampToLimits(
  joint: JointName,
  value: number,
  limits: Record<JointName, JointLimit>,
): number {
  const limit = limits[joint];
  return Math.min(limit.max, Math.max(limit.min, value));
}

/* A development handle, so the control loop can be inspected from the
   console while wiring up real hardware. Never included in a production
   bundle. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __robotStore?: typeof useRobotStore }).__robotStore = useRobotStore;
}
