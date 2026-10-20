/**
 * Web Serial transport.
 *
 * The browser refuses to hand out a port on its own: `requestPort()` always
 * opens the OS device picker, so the user explicitly chooses the USB port.
 * That is the only way a web page can reach a serial device, and it is why
 * this project needs Chrome/Edge over http://localhost.
 */

import {
  TransportError,
  type RobotTransport,
  type TransportEvents,
  type TransportKind,
  type TransportStatus,
} from "./RobotTransport";
import { LineBuffer } from "../protocol";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SerialPortLike = any;

export class WebSerialTransport implements RobotTransport {
  readonly kind: TransportKind = "webserial";
  readonly isPhysical = true;

  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private lines = new LineBuffer();
  private keepReading = false;
  private disposed = false;

  constructor(
    private readonly baudRate: number,
    private readonly events: TransportEvents,
  ) {}

  /**
   * The ports this origin has already been granted.
   *
   * `getPorts()` needs no user gesture, so the app can offer a one-click
   * reconnect — and auto-reconnect when the board is plugged back in — without
   * the operating system's device picker appearing again.
   */
  static async listGrantedPorts(): Promise<SerialPortLike[]> {
    if (typeof navigator === "undefined" || !("serial" in navigator)) return [];
    try {
      const ports = await (navigator as any).serial.getPorts();
      return Array.isArray(ports) ? ports : [];
    } catch {
      return [];
    }
  }

  /** True when the browser exposes the plug-in / unplug events. */
  static supportsConnectionEvents(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator && "onconnect" in navigator;
  }

  static describePort(port: SerialPortLike): string {
    const info = port?.getInfo?.() ?? {};
    const vid = info.usbVendorId ? `VID ${hex(info.usbVendorId)}` : null;
    const pid = info.usbProductId ? `PID ${hex(info.usbProductId)}` : null;
    const name = info.usbProductId || info.manufacturer || "USB Serial";
    return [name, vid, pid].filter(Boolean).join(" · ");
  }

  get label(): string {
    if (!this.port) return "No port selected";
    return WebSerialTransport.describePort(this.port);
  }

  /**
   * Opens the OS device picker.
   *
   * This is separated from `connect()` on purpose: `requestPort()` must be
   * called from inside the click handler, before any `await`, or the browser
   * rejects it with "Must be handling a user gesture".
   */
  async requestPort(): Promise<SerialPortLike> {
    if (!("serial" in navigator)) {
      throw new TransportError(
        "This browser does not expose the Web Serial API.",
        "Use Chrome or Edge on desktop, served over http://localhost or https.",
      );
    }
    let port: SerialPortLike;
    try {
      port = await (navigator as any).serial.requestPort();
    } catch (error) {
      throw new TransportError(
        "No serial port was selected.",
        String((error as Error)?.message ?? error),
      );
    }
    if (!port) throw new TransportError("No serial port was selected.");
    this.port = port;
    return port;
  }

  /**
   * Uses a port the browser has already been granted, without showing the
   * operating system's device picker again.
   */
  usePort(port: SerialPortLike): void {
    this.port = port;
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new TransportError("Transport has been disposed.");
    this.setStatus("connecting", "Opening the port…");

    const port = this.port;
    if (!port) {
      throw new TransportError("No serial port was selected.");
    }

    try {
      await port.open({ baudRate: this.baudRate, dataBits: 8, stopBits: 1, parity: "none" });
    } catch (error) {
      this.setStatus("error", "Could not open the port.");
      throw new TransportError(
        "The port could not be opened.",
        "Close the Arduino IDE serial monitor, then try again.",
      );
    }

    this.lines.reset();
    this.keepReading = true;
    this.setStatus("connected", `Connected at ${this.baudRate} baud.`);

    this.reader = port.readable.getReader();
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        this.events.onActivity?.("rx", value.length);
        const text = this.decoder.decode(value, { stream: true });
        for (const line of this.lines.push(text)) {
          this.events.onLine(line);
        }
      }
    } catch (error) {
      if (this.keepReading) {
        this.setStatus("error", "The serial connection was lost.");
        this.events.onDisconnect?.(String((error as Error)?.message ?? error));
      }
    }
  }

  async write(data: string): Promise<void> {
    const port = this.port;
    if (!port) throw new TransportError("Not connected.");
    const writer = this.writer ?? port.writable.getWriter();
    this.writer = writer;
    const bytes = new TextEncoder().encode(data);
    await writer.write(bytes);
    this.events.onActivity?.("tx", bytes.length);
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* the stream may already be closed */
    }
    this.reader?.releaseLock?.();
    this.reader = null;
    try {
      await this.writer?.close();
    } catch {
      /* ignore */
    }
    this.writer?.releaseLock?.();
    this.writer = null;
    try {
      await this.port?.close?.();
    } catch {
      /* ignore */
    }
    this.port = null;
    this.lines.reset();
    if (!this.disposed) this.setStatus("disconnected", "Disconnected.");
  }

  dispose(): void {
    this.disposed = true;
    void this.disconnect();
  }

  private setStatus(status: TransportStatus, message?: string): void {
    this.events.onStatus(status, message);
  }
}

function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}
