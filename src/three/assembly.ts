/**
 * The authored assembly of the real CAD parts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROVENANCE
 * ─────────────────────────────────────────────────────────────────────────
 * The twenty `.stl` files in `Robotic+Arm+with+Servo+&+Arduino/` are the
 * author's own CAD export of the printed parts. No `.step` / `.FCStd`
 * assembly file was provided, so the *kinematic* layout below is
 * reconstructed from the geometry itself:
 *
 *   • Bores were measured by slicing each part and locating the enclosed
 *     holes (`scripts/measure_bores.py`).
 *   • `On_Kol`  has a Ø10.5 bore on its own origin and a Ø7 bore 140 mm away.
 *   • `Alt_Kol` has two Ø10 bores exactly 200 mm apart.
 *   • `El` / `El_Ust` are servo plates (50 x 48 with the classic hole
 *     pattern); `El_Ust` carries the servo output bore.
 *   • `Bilek` is the wrist housing; `Parmak*` are the fingers.
 *
 * Resulting chain (all pitch axes are world Z, the yaw axis is world Y):
 *
 *   base (static) → turret (YAW) → upper arm (SHOULDER) → forearm (ELBOW)
 *                 → wrist (WRIST) → gripper (GRIPPER)
 *
 * Every number below is in millimetres, authored in the CAD's own local
 * frames, and is the single place to edit if a real assembly file arrives.
 * `scripts/build_model.py` turns the STLs into `public/models/cobot-arm.glb`
 * with one node per part, matching the `name` fields used here.
 */

export const MM = 0.01; // 1 mm → 1 three.js unit (the robot is ~5.3 units tall)

export type GroupId = "base" | "turret" | "upperArm" | "forearm" | "wrist" | "gripper";

export type MaterialId = "printed" | "printedDark" | "metal" | "gear";

export interface PartPlacement {
  /** GLB node name (see scripts/build_model.py). */
  name: string;
  /** Display label for the UI. */
  label: string;
  group: GroupId;
  /** Local position in millimetres, inside its group's frame. */
  position: [number, number, number];
  /** Local rotation, Euler XYZ in radians (three.js order: R = Rx·Ry·Rz). */
  rotation: [number, number, number];
  /**
   * Extra rotation about the group's vertical axis, applied outside `rotation`.
   * Used to turn a part around without flipping it over (a 180° yaw is the
   * only way to mirror a part in X while keeping it the right way up).
   */
  yaw?: number;
  material: MaterialId;
  /** Exploded-view offset in millimetres, in the group frame. */
  explode: [number, number, number];
}

const HALF_PI = Math.PI / 2;

/* ────────────────────────────── pivots ────────────────────────────── */

/** World-space (mm) joint pivots in the rest pose. */
export const PIVOTS = {
  /** Yaw axis passes through the world origin (the turret axis on the desk). */
  yaw: [0, 0, 0] as [number, number, number],
  /**
   * Shoulder: the arm's tail lies flat on the turret bracket.
   *
   * Measured from the CAD: `Alt_Govde` carries a raised bracket whose top
   * face is 30 mm wide and offset towards +X (CAD x -18 .. 58), and
   * `Alt_Kol` ends in a 55 x 30 mm tail with its bore 27.5 mm from the
   * end. The pivot therefore sits 27.5 mm above that face and 19.8 mm
   * forward of the turret axis, so the tail lands square on the bracket.
   */
  shoulder: [19.8, 172, 0] as [number, number, number],
  /** Elbow: 200 mm up the upper arm, offset 47.5 mm forward. */
  elbow: [47.5, 194.27, 0] as [number, number, number],
  /** Wrist: 140 mm out along the forearm. */
  wrist: [140, 0, 0] as [number, number, number],
  /** Gripper: at the wrist housing. */
  gripper: [0, 0, 0] as [number, number, number],
};

/** Distance from the elbow to the wrist, used for the exploded layout. */
export const FOREARM_LENGTH = 140;

/**
 * The model's rest pose, in degrees.
 *
 * The CAD parts were exported in whatever orientation the author modelled
 * them in, which for the two long links is a near-vertical L — a crane
 * silhouette rather than a cobot. These angles re-pose the chain so the
 * machine reads the way it is actually used: the upper arm leaning forward
 * over the tray, the elbow bent, and the tool pointing down at the work.
 *
 * They are added on top of every joint angle, so the "Home" preset always
 * reproduces exactly this pose.
 */
export const REST_POSE: Record<string, number> = {
  base: 0,
  /**
   * The shoulder is left at zero on purpose: that is the angle at which the
   * arm's tail lies flat on the turret bracket, exactly as it is bolted on
   * the prototype. Any lean here would lift the tail off its bracket and the
   * joint would read as floating.
   */
  shoulder: 0,
  /* The elbow carries the pose: the forearm reaches forward and down. */
  elbow: -55,
  /* And the wrist folds the tool down so the blades hang over the board. */
  wrist: -20,
  gripper: 0,
};

/* ────────────────────────────── parts ────────────────────────────── */

export const PARTS: PartPlacement[] = [
  /* ---------------- base (static) ----------------
     Read off the reference photograph of the prototype:
       • Alt_Kapak — the bottom tray of the enclosure, turned upside down so
                     its socket faces the desk.
       • Alt_Kasa  — the vented electronics enclosure, bolted on top of the
                     tray. Together they close the base box.
       • Tabla_Alt — the spoked cable ring, lying on the enclosure.
     The base drum (Alt_Govde) drops into the Ø110 collar of the enclosure
     and turns inside it: that is the yaw bearing.                        */
  {
    name: "Alt_Kapak",
    label: "Base tray",
    group: "base",
    // Turned over on the spot: the socket now points down at the desk and
    // the flat face with the screw tabs is on top. The footprint is
    // unchanged, so the tray still reaches under the enclosure above it.
    position: [0, 44.5, 0],
    rotation: [-HALF_PI, 0, Math.PI],
    material: "printed",
    explode: [0, -30, 0],
  },
  {
    name: "Alt_Kasa",
    label: "Controller enclosure",
    group: "base",
    position: [0, 44.5, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printed",
    explode: [-40, 0, 0],
  },
  {
    name: "Tabla_Alt",
    label: "Cable ring",
    group: "base",
    position: [-95, 69.5, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printedDark",
    explode: [0, 40, 0],
  },
  {
    name: "Jack_Cover",
    label: "Power jack cover",
    group: "base",
    position: [-150, 64.5, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printedDark",
    explode: [-50, 0, 0],
  },

  /* ---------------- turret (yaw) ---------------- */
  {
    name: "Alt_Govde",
    label: "Base drum",
    group: "turret",
    // The lower 10 mm is the spigot that turns inside the enclosure collar.
    position: [0, 114.5, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printed",
    explode: [0, 60, 0],
  },
  {
    name: "Mil_3",
    label: "Yaw column",
    group: "turret",
    position: [0, 30, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printedDark",
    explode: [0, -30, 0],
  },
  {
    name: "Mil_1",
    label: "Shoulder axle",
    group: "turret",
    position: [19.8, 172, -44],
    rotation: [0, 0, 0],
    material: "metal",
    explode: [0, 0, -60],
  },
  {
    name: "Mil_Disli",
    label: "Yaw bearing plate",
    group: "turret",
    position: [0, 92, 0],
    rotation: [0, 0, 0],
    material: "gear",
    explode: [0, -20, 0],
  },
  {
    name: "Parmak_Disli_X_2",
    label: "Yaw drive gear",
    group: "turret",
    position: [0, 92, 0],
    rotation: [HALF_PI, 0, 0],
    material: "gear",
    explode: [40, -20, 0],
  },

  /* ---------------- upper arm (shoulder) ---------------- */
  {
    name: "Alt_Kol",
    label: "Upper arm link",
    group: "upperArm",
    // Local to the shoulder pivot: the link's lower Ø10 bore (CAD z = -100)
    // lands exactly on the shoulder axis.
    position: [0, 100, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printed",
    explode: [0, 0, 0],
  },
  {
    name: "Servo_Cable_Holder",
    label: "Servo cable clamp",
    group: "upperArm",
    position: [0, 0, 0],
    rotation: [-HALF_PI, 0, 0],
    material: "printedDark",
    explode: [0, 0, 60],
  },

  /* ---------------- forearm (elbow) ---------------- */
  {
    name: "On_Kol",
    label: "Forearm link",
    group: "forearm",
    position: [0, 0, 0],
    rotation: [-HALF_PI, Math.PI, 0],
    material: "printed",
    explode: [0, 0, 0],
  },
  {
    name: "Disli",
    label: "Elbow servo horn",
    group: "forearm",
    position: [0, 0, -18],
    rotation: [0, 0, 0],
    material: "gear",
    explode: [0, 0, -70],
  },
  {
    name: "El",
    label: "Elbow servo plate",
    group: "forearm",
    position: [0, 0, -46],
    rotation: [0, 0, 0],
    material: "printedDark",
    explode: [0, 0, -70],
  },
  {
    name: "El_Ust",
    label: "Elbow servo cover",
    group: "forearm",
    position: [-4, 0, -20],
    rotation: [0, 0, 0],
    material: "printedDark",
    explode: [0, 0, 70],
  },

  /* ---------------- wrist ---------------- */
  {
    name: "Mil_2",
    label: "Wrist axle",
    group: "forearm",
    position: [PIVOTS.wrist[0], 0, -14],
    rotation: [0, 0, 0],
    material: "metal",
    explode: [0, 0, -50],
  },
  {
    name: "Bilek",
    label: "Gripper palm",
    group: "wrist",
    // Cyclic remap (X→Z, Y→X, Z→Y): the palm's fork opens towards the
    // tool axis (+X) and its two walls are separated across the closing
    // direction (Z), so the fingers slide apart across the tool.
    position: [0, 0, 0],
    rotation: [Math.PI / 2, Math.PI, Math.PI / 2],
    material: "printed",
    explode: [0, 0, 0],
  },
  {
    name: "Servo_Disli",
    label: "Wrist servo horn",
    group: "wrist",
    position: [0, 0, 7],
    rotation: [0, 0, 0],
    material: "gear",
    explode: [0, 0, 60],
  },

  /* ---------------- gripper ---------------- */
  {
    name: "Parmak_X_2",
    label: "Finger carriage",
    group: "gripper",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: "printedDark",
    explode: [0, 0, 50],
  },
  {
    name: "Parmak_2_X_2",
    label: "Finger pad",
    group: "gripper",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    material: "printed",
    explode: [0, 0, 50],
  },
];

/* ─────────────────────── procedural servo bodies ─────────────────────── */
/**
 * The CAD export contains the printed parts only — the servos, screws and
 * wiring are bought-in components and are not in the STL set. They are
 * modelled here as simple, accurate-enough standard hobby servos so the
 * mechanism reads correctly on screen.
 */
export interface ServoPlacement {
  id: string;
  label: string;
  group: GroupId;
  position: [number, number, number];
  /** Output boss points along this axis. */
  axis: "x" | "y" | "z";
  /** Body size in millimetres (length along the shaft-perpendicular axis). */
  size: [number, number, number];
  color: "dark" | "metal";
  /** Mirror the body so the output boss points the other way. */
  flip?: boolean;
  explode: [number, number, number];
}

export const SERVOS: ServoPlacement[] = [
  {
    id: "servo-base",
    label: "Base yaw servo",
    group: "base",
    // Inside the enclosure, driving the column up into the drum.
    position: [0, 62, 0],
    axis: "y",
    size: [40, 40, 20],
    color: "dark",
    explode: [-70, 0, 0],
  },
  {
    id: "servo-shoulder-left",
    label: "Shoulder servo (left)",
    group: "upperArm",
    // One micro servo on each side of the arm's tail, inside the clevis of
    // the turret bracket — the arrangement the prototype photograph shows.
    position: [0, 0, -22],
    axis: "z",
    size: [23, 25, 12],
    color: "metal",
    explode: [0, 0, -60],
  },
  {
    id: "servo-shoulder-right",
    label: "Shoulder servo (right)",
    group: "upperArm",
    position: [0, 0, 22],
    axis: "z",
    size: [23, 25, 12],
    color: "metal",
    flip: true,
    explode: [0, 0, 60],
  },
  {
    id: "servo-elbow",
    label: "Elbow servo",
    group: "forearm",
    position: [0, 0, -33],
    axis: "z",
    size: [40, 36, 20],
    color: "dark",
    explode: [0, 0, -70],
  },
  {
    id: "servo-wrist",
    label: "Wrist servo",
    group: "forearm",
    position: [122, 0, -26],
    axis: "z",
    size: [23, 25, 12],
    color: "metal",
    explode: [0, 0, -70],
  },
];

/* ─────────────────────────── materials ─────────────────────────── */

export const MATERIALS: Record<
  MaterialId,
  { color: string; roughness: number; metalness: number; emissive?: string; emissiveIntensity?: number }
> = {
  printed: {
    color: "#c4391f",
    roughness: 0.46,
    metalness: 0.05,
    emissive: "#220703",
    emissiveIntensity: 0.45,
  },
  printedDark: {
    color: "#7d2513",
    roughness: 0.55,
    metalness: 0.05,
    emissive: "#170402",
    emissiveIntensity: 0.4,
  },
  metal: { color: "#aab1bb", roughness: 0.28, metalness: 0.9 },
  gear: { color: "#2b2f36", roughness: 0.38, metalness: 0.3 },
};

/* ─────────────────────────── helpers ─────────────────────────── */

export const PART_LABELS: Record<string, string> = PARTS.reduce<Record<string, string>>(
  (acc, part) => {
    acc[part.name] = part.label;
    return acc;
  },
  {},
);

/** Group id → the joint that drives it. */
export const GROUP_JOINT = {
  turret: "base",
  upperArm: "shoulder",
  forearm: "elbow",
  wrist: "wrist",
  gripper: "gripper",
} as const satisfies Record<string, string>;
