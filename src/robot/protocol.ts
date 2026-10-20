/**
 * Wire protocol shared with the Arduino firmware.
 *
 * The app speaks one joint frame, with one value per servo channel in the
 * order the sketch attaches them:
 *
 *     A,<base>,<shoulder1>,<shoulder2>,<elbow>,<wrist>,<wristRot>,<gripper>\n
 *
 * Seven channels, six axes: the shoulder is driven by a mirrored pair, so
 * `shoulder2` is always `180 − shoulder1`. The pair is mirrored here, in the
 * store, so no path through the UI can desynchronise the two sides.
 *
 * `firmware/arm_controller_v2.ino` is the sketch that speaks this frame. It
 * also understands G,OPEN / G,CLOSE / S,0 / HOME / P and reports state back.
 * The original `arm_controller.ino` speaks the older five-channel frame and
 * does **not** understand this one — flash v2.
 */

import { JOINT_NAMES, type JointName } from "./config";

export type JointFrame = Record<JointName, number>;

/** Result of parsing one incoming line. */
export type ParsedLine =
  | { kind: "ready"; channels?: number }
  | { kind: "pong" }
  | { kind: "joints"; frame: JointFrame }
  | { kind: "error"; code: string; detail?: string }
  | { kind: "unknown"; raw: string };

export function encodeJointFrame(frame: JointFrame): string {
  const values = JOINT_NAMES.map((name) => {
    const value = Math.round(frame[name]);
    return Number.isFinite(value) ? String(value) : "0";
  });
  return `A,${values.join(",")}\n`;
}

export function encodeGripper(state: "OPEN" | "CLOSE"): string {
  return `G,${state}\n`;
}

/** Stop / hold. Firmware v2 freezes motion; the shipped v1 ignores it. */
export function encodeStop(): string {
  return "S,0\n";
}

export function encodeHome(): string {
  return "HOME\n";
}

export function encodePing(): string {
  return "P\n";
}

const INT_RE = /^-?\d{1,4}$/;

/** Parse one newline-delimited line coming back from the controller. */
export function parseLine(raw: string): ParsedLine {
  const line = raw.trim();
  if (!line) return { kind: "unknown", raw };

  if (line === "READY") return { kind: "ready" };
  /**
   * `READY,<channels>` — the v2 sketch announces how many servo channels it
   * speaks. The app compares that with its own frame, so a board still
   * running the original five-channel sketch is caught immediately instead
   * of looking like a dead arm.
   */
  if (line.startsWith("READY,")) {
    const channels = Number(line.slice(6).trim());
    return { kind: "ready", channels: Number.isFinite(channels) ? channels : undefined };
  }
  if (line === "PONG") return { kind: "pong" };

  if (line.startsWith("ERR")) {
    const [code, ...rest] = line.split(",");
    return { kind: "error", code: code.slice(3) || "UNKNOWN", detail: rest.join(",") || undefined };
  }

  if (line.startsWith("T,")) {
    const parts = line.split(",");
    if (parts.length !== JOINT_NAMES.length + 1) return { kind: "unknown", raw };
    const values = parts.slice(1).map((v) => Number(v));
    if (values.some((v) => !Number.isFinite(v))) return { kind: "unknown", raw };
    const frame = {} as JointFrame;
    JOINT_NAMES.forEach((joint, index) => {
      frame[joint] = values[index];
    });
    return { kind: "joints", frame };
  }

  return { kind: "unknown", raw };
}

/**
 * Incremental line splitter.
 *
 * Serial delivers arbitrary byte chunks: a frame can be split across two
 * reads, or several frames can arrive in one read. This buffers the tail and
 * hands back only complete lines.
 */
export class LineBuffer {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    if (this.buffer.length > 4096) {
      // A line that never terminates is a protocol error; drop it rather than
      // growing without bound.
      this.buffer = this.buffer.slice(-256);
    }
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";
    return lines.filter((line) => line.trim().length > 0);
  }

  reset(): void {
    this.buffer = "";
  }
}

/** Validate a candidate angle before it is written to the wire. */
export function isValidAngle(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1000;
}

export { INT_RE };
