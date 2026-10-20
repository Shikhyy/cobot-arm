/**
 * Mock transport.
 *
 * Simulates a controller that echoes a state frame back so the whole UI —
 * the 3D rig, the readouts, the presets, the stop behaviour — can be exercised
 * without hardware.
 *
 * The mock NEVER pretends the physical arm is connected: `isPhysical` is false
 * and the UI labels every mock session explicitly.
 */

import type { RobotTransport, TransportEvents, TransportKind, TransportStatus } from "./RobotTransport";
import { parseLine } from "../protocol";
import { JOINTS, type JointName } from "../config";

export class MockRobotTransport implements RobotTransport {
  readonly kind: TransportKind = "mock";
  readonly isPhysical = false;
  readonly label = "Simulated controller (no hardware)";

  private timer: number | null = null;
  private disposed = false;
  private state: Record<JointName, number> = {
    base: 90,
    shoulder: 110,
    elbow: 95,
    wrist: 90,
    gripper: 75,
  };

  constructor(private readonly events: TransportEvents) {}

  async connect(): Promise<void> {
    if (this.disposed) throw new Error("Transport has been disposed.");
    this.setStatus("connecting", "Starting the simulator…");
    await delay(320);
    if (this.disposed) return;
    this.setStatus("connected", "Simulated controller running. No hardware is attached.");
    this.events.onLine("READY");

    this.timer = window.setInterval(() => {
      const values = (["base", "shoulder", "elbow", "wrist", "gripper"] as JointName[])
        .map((name) => Math.round(this.state[name]))
        .join(",");
      this.events.onLine(`T,${values}`);
    }, 250);
  }

  async disconnect(): Promise<void> {
    this.clearTimer();
    if (!this.disposed) this.setStatus("disconnected", "Simulator stopped.");
  }

  async write(data: string): Promise<void> {
    this.events.onActivity?.("tx", data.length);
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseLine(line);
      if (parsed.kind === "unknown") continue;
      if (line.startsWith("A,")) {
        const values = line.split(",").slice(1).map((v) => Number(v));
        (["base", "shoulder", "elbow", "wrist", "gripper"] as JointName[]).forEach((name, i) => {
          const value = values[i];
          if (Number.isFinite(value)) this.state[name] = value;
        });
      }
      if (line.startsWith("P")) {
        this.events.onLine("PONG");
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private setStatus(status: TransportStatus, message?: string): void {
    this.events.onStatus(status, message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const MOCK_HOME: Record<JointName, number> = {
  base: JOINTS.base.home,
  shoulder: JOINTS.shoulder.home,
  elbow: JOINTS.elbow.home,
  wrist: JOINTS.wrist.home,
  gripper: JOINTS.gripper.home,
};
