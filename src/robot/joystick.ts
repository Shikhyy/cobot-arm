/**
 * Joystick input bus.
 *
 * Joystick output is high-frequency and must never be a source of truth for
 * the pose — it is *velocity* input. It lives outside React state so the
 * control loop can read it every tick without triggering a re-render, and so
 * the STOP button can recentre every stick in one place.
 */

export type JoystickId = "A" | "B";

export interface JoystickAxes {
  /** Horizontal axis, -1 (left) .. 1 (right). */
  x: number;
  /** Vertical axis, -1 (down) .. 1 (up). */
  y: number;
  /** True while a pointer is down on the stick. */
  active: boolean;
}

const axes: Record<JoystickId, JoystickAxes> = {
  A: { x: 0, y: 0, active: false },
  B: { x: 0, y: 0, active: false },
};

type Listener = (id: JoystickId) => void;
const listeners = new Set<Listener>();

export function getJoystickAxes(id: JoystickId): JoystickAxes {
  return axes[id];
}

export function setJoystickAxes(id: JoystickId, next: Partial<JoystickAxes>): void {
  axes[id] = { ...axes[id], ...next };
  listeners.forEach((listener) => listener(id));
}

/** Recentre every stick. Used by STOP and whenever the arm is disarmed. */
export function centerJoysticks(): void {
  for (const id of ["A", "B"] as JoystickId[]) {
    axes[id] = { x: 0, y: 0, active: false };
  }
  listeners.forEach((listener) => listener("A"));
  listeners.forEach((listener) => listener("B"));
}

export function subscribeJoysticks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Apply the dead zone and sensitivity to a raw axis reading.
 * Returns a normalised -1..1 velocity request.
 */
export function shapeAxis(raw: number, deadZone: number, sensitivity: number): number {
  const magnitude = Math.abs(raw);
  if (magnitude <= deadZone) return 0;
  const scaled = ((magnitude - deadZone) / (1 - deadZone)) * sensitivity;
  return Math.sign(raw) * Math.min(1, scaled);
}
