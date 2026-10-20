import { AlertTriangle, Cable, CircleDot, Info, Radio, ShieldCheck, Unplug, Usb, Zap } from "lucide-react";

import { JOINT_NAMES, JOINT_ORDER, SERIAL } from "../robot/config";
import { useRobotStore } from "../robot/store";
import { isWebSerialSupported, isSecureContextForSerial } from "../robot/transport/RobotTransport";
import type { ControllerApi } from "../robot/useRobotController";

const STATUS_COPY = {
  disconnected: { label: "Disconnected", tone: "text-mist-400" },
  connecting: { label: "Connecting", tone: "text-amber-400" },
  connected: { label: "Connected", tone: "text-jade-400" },
  error: { label: "Error", tone: "text-signal-500" },
} as const;

export function ConnectionPanel({ controller }: { controller: ControllerApi }) {
  const connection = useRobotStore((state) => state.connection);
  const setConnection = useRobotStore((state) => state.setConnection);
  const limits = useRobotStore((state) => state.limits);
  const hardwareArmed = useRobotStore((state) => state.hardwareArmed);
  const autoConnect = useRobotStore((state) => state.autoConnect);
  const setAutoConnect = useRobotStore((state) => state.setAutoConnect);

  const supported = isWebSerialSupported();
  const secure = isSecureContextForSerial();
  const isMock = connection.mode === "mock";
  const status = STATUS_COPY[connection.status];
  const isConnected = connection.status === "connected";
  /* The simulator has no real arm to protect, so the verification gate only
     applies to a physical link. */
  const allVerified = isMock || JOINT_ORDER.every((joint) => limits[joint].calibrated);

  /**
   * Does the board's own report match what the app asked for?
   *
   * If it does, the link is healthy and the frame was understood, so a
   * machine that is not moving is a mechanical or a power problem, not a
   * protocol one. That distinction is the whole point of the report.
   */
  const commanded = useRobotStore((state) => state.joints);
  const agreesWithBoard = connection.reported
    ? JOINT_NAMES.every(
        (joint) => Math.abs((connection.reported?.[joint] ?? 0) - commanded[joint]) <= 1,
      )
    : true;

  return (
    <section className="panel p-4" aria-labelledby="connection-heading">
      <header className="flex items-center justify-between gap-3">
        <h2 id="connection-heading" className="eyebrow">
          Link
        </h2>
        <span className={`chip ${status.tone}`}>
          <span className={`dot${isConnected ? " dot--live" : ""}`} aria-hidden />
          {status.label}
        </span>
      </header>

      <div className="mt-3 flex flex-col gap-3">
        {!supported ? (
          <p className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11.5px] leading-relaxed text-amber-400">
            <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
            <span>
              This browser has no Web Serial API. Use Chrome or Edge on desktop. The simulator below
              still exercises the whole interface.
            </span>
          </p>
        ) : !secure ? (
          <p className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11.5px] leading-relaxed text-amber-400">
            <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
            <span>
              Web Serial needs a secure context. Serve the app over <code className="mono">http://localhost</code>{" "}
              or HTTPS.
            </span>
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Mode</span>
            <select
              className="mono rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2 text-[12px] text-mist-200 outline-none transition-colors focus:border-signal-500"
              value={isMock ? "mock" : "serial"}
              disabled={isConnected || controller.isBusy}
              onChange={(event) => {
                setConnection({ mode: event.target.value === "mock" ? "mock" : "webserial" });
              }}
            >
              <option value="serial">USB serial</option>
              <option value="mock">Simulator</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Baud</span>
            <select
              className="mono rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-2 text-[12px] text-mist-200 outline-none transition-colors focus:border-signal-500"
              value={connection.baudRate}
              disabled={isConnected || controller.isBusy}
              onChange={(event) => setConnection({ baudRate: Number(event.target.value) })}
            >
              {SERIAL.baudRates.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isConnected ? (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void controller.disconnect()}
            >
              <Unplug size={13} aria-hidden /> Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={controller.isBusy || (!supported && !isMock)}
              onClick={() => {
                if (isMock) void controller.connectMock();
                else void controller.connectSerial();
              }}
            >
              <Cable size={13} aria-hidden />
              {controller.isBusy ? "Connecting…" : isMock ? "Start simulator" : "Select port & connect"}
            </button>
          )}

          {!isConnected && !isMock && connection.grantedPorts > 0 ? (
            <button
              type="button"
              className="btn btn--sm"
              disabled={controller.isBusy}
              onClick={() => void controller.connectGranted()}
            >
              <Usb size={13} aria-hidden /> Reconnect
            </button>
          ) : null}

          {isConnected ? (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => controller.ping()}
              title="Send a ping and wait for the answer"
            >
              <Radio size={13} aria-hidden /> Ping
            </button>
          ) : null}

          {isMock ? (
            <span className="chip text-amber-400">
              <CircleDot size={10} aria-hidden /> Simulation — no hardware
            </span>
          ) : null}
        </div>

        {!isMock ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-750 bg-ink-850 p-2.5 text-[11.5px] leading-relaxed text-mist-300">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-signal-500)]"
              checked={autoConnect}
              onChange={(event) => setAutoConnect(event.target.checked)}
            />
            <span>
              <strong className="font-medium text-mist-100">Reconnect on plug-in.</strong> After you
              grant the board once, the browser keeps that permission — the app then takes the port
              again by itself, exactly like the Arduino IDE picking the board up.
            </span>
          </label>
        ) : null}

        <div className="rounded-lg border border-ink-750 bg-ink-900/60 p-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">Serial traffic</span>
            <span className="mono text-[10.5px] text-mist-500">
              ↑{connection.txCount} ↓{connection.rxCount}
            </span>
          </div>
          <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-ink-750">
            <span
              className="h-full bg-signal-500 transition-[width] duration-200"
              style={{ width: `${Math.min(100, connection.txCount % 100)}%` }}
            />
          </div>
          <p className="mono mt-2 truncate text-[11px] text-mist-400">last: {connection.lastMessage}</p>

          {/*
            The controller's own report. It is the operator's proof that the
            link is alive and that the board understood the frame — the
            servos have no position feedback, so this is the board's
            commanded targets, not where the arm actually is.
          */}
          {connection.reported ? (
            <p className="mono mt-1.5 truncate text-[10.5px] text-mist-500">
              board: {JOINT_NAMES.map((j) => Math.round(connection.reported?.[j] ?? 0)).join(",")}
              {agreesWithBoard ? " — agrees with the app" : " — DIFFERS from the app"}
            </p>
          ) : null}
        </div>

        {connection.error ? (
          <p className="flex gap-2 rounded-lg border border-signal-600/30 bg-signal-600/8 p-2.5 text-[11.5px] leading-relaxed text-signal-400">
            <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
            <span>{connection.error}</span>
          </p>
        ) : null}
        {connection.hint ? (
          <p className="flex gap-2 rounded-lg border border-ink-700 bg-ink-850 p-2.5 text-[11.5px] leading-relaxed text-mist-400">
            <Info size={14} className="mt-px shrink-0" aria-hidden />
            <span>{connection.hint}</span>
          </p>
        ) : null}

        {isConnected && !connection.ready ? (
          <p className="flex gap-2 rounded-lg border border-ink-700 bg-ink-850 p-2.5 text-[11px] leading-relaxed text-mist-400">
            <Radio size={13} className="mt-px shrink-0" aria-hidden />
            <span>
              Port open, waiting for the controller to announce itself with{" "}
              <code className="mono">READY</code>. Opening an Arduino port resets the board, so give it
              a second to boot. If nothing arrives, the sketch is not running or the baud rate is
              wrong.
            </span>
          </p>
        ) : null}

        {isConnected && connection.ready ? (
          <p className="mono flex items-center gap-2 text-[10.5px] text-jade-400">
            <CircleDot size={11} aria-hidden /> Controller ready
          </p>
        ) : null}

        {/* ── arming ── */}
        <div className="flex items-center justify-between gap-3 border-t border-ink-750 pt-3">
          <div className="min-w-0">
            <span className="eyebrow block">Motors</span>
            <span className="mono truncate text-[11px] text-mist-400">
              {hardwareArmed ? "ARMED" : "disarmed"}
            </span>
          </div>
          {hardwareArmed ? (
            <button type="button" className="btn btn--sm" onClick={() => controller.disarm()}>
              <ShieldCheck size={13} aria-hidden /> Disarm
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={!isConnected || !allVerified}
              onClick={() => void controller.arm()}
              title={
                allVerified
                  ? "Sends the home pose first, then accepts motion. Make sure that pose is safe on your machine."
                  : "Verify every joint range first"
              }
            >
              <Zap size={13} aria-hidden /> Arm the motors
            </button>
          )}
        </div>

        {!allVerified ? (
          <p className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5 text-[11px] leading-relaxed text-amber-400">
            <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
            <span>
              The motors stay disarmed until every joint range has been verified in the Calibration
              panel. An unverified limit is how a robot arm drives itself into its own frame.
            </span>
          </p>
        ) : null}

        {!isMock ? (
          <p className="flex gap-2 rounded-lg border border-signal-600/25 bg-signal-600/5 p-2.5 text-[11px] leading-relaxed text-signal-400">
            <Zap size={13} className="mt-px shrink-0" aria-hidden />
            <span>
              <strong className="font-medium">Servo power.</strong> Run the servos from a separate
              5–6 V supply rated for all seven, and join its GND to the Arduino GND. Powering them
              from the board's 5 V pin browns the board out, the port drops and the arm goes dead.
            </span>
          </p>
        ) : null}

        <p className="flex gap-2 text-[10.5px] leading-relaxed text-mist-500">
          <Radio size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            The browser cannot reach a USB device until you pick it in the device dialog. The Arduino
            is opened read/write; the Arduino IDE serial monitor must be closed.
          </span>
        </p>
      </div>
    </section>
  );
}
