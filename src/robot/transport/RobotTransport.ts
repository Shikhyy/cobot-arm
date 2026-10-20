/**
 * Transport abstraction.
 *
 * The controller never talks to a serial port directly — it talks to a
 * `RobotTransport`. That keeps the Web Serial API (and its permission
 * choreography) out of the control logic, and makes the mock mode a first
 * class citizen instead of a hack.
 */

export type TransportKind = "webserial" | "mock";

export type TransportStatus = "disconnected" | "connecting" | "connected" | "error";

export interface TransportEvents {
  /** A complete line arrived from the device. */
  onLine: (line: string) => void;
  /** The transport changed state. */
  onStatus: (status: TransportStatus, message?: string) => void;
  /** The device went away (cable pulled, port reset, tab suspended). */
  onDisconnect?: (reason: string) => void;
  /** Bytes were written (used for the activity indicator). */
  onActivity?: (direction: "tx" | "rx", bytes: number) => void;
}

export interface RobotTransport {
  readonly kind: TransportKind;
  /** Human readable identity shown in the connection panel. */
  readonly label: string;
  /** True only when a real device is attached and talking. */
  readonly isPhysical: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(data: string): Promise<void>;
  dispose(): void;
}

export class TransportError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = "TransportError";
  }
}

/** The Web Serial API is Chromium-only and needs a secure context. */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isSecureContextForSerial(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}
