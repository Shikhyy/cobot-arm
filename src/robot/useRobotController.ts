/**
 * The robot controller.
 *
 * Owns the transport, runs the command loop, and is the only place that
 * decides what goes on the wire. Nothing else in the app may write to the
 * serial port.
 *
 * Safety rules enforced here:
 *  - Nothing moves until the user explicitly connects and arms the hardware.
 *  - The app never sends a home pose on its own.
 *  - STOP halts command generation, clears pending motion and sends the
 *    stop/hold verb. It never zeroes the joints.
 *  - A lost connection invalidates pending commands; nothing is replayed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_TICK_MS, JOINT_NAMES } from "./config";
import {
  encodeJointFrame,
  encodePing,
  encodeStop,
  parseLine,
} from "./protocol";
import { centerJoysticks, getJoystickAxes } from "./joystick";
import { integrateJoystick, posesDiffer } from "./motion";
import { useRobotStore, type JointAngles } from "./store";
import { JOINTS } from "./config";
import { MockRobotTransport } from "./transport/MockRobotTransport";
import { WebSerialTransport } from "./transport/WebSerialTransport";
import {
  isWebSerialSupported,
  type RobotTransport,
  type TransportStatus,
} from "./transport/RobotTransport";

/** Which joystick axis drives which joint. */
export interface ControllerApi {
  status: TransportStatus;
  connectSerial: () => Promise<void>;
  connectMock: () => Promise<void>;
  /** Reconnect to a port the browser has already been granted. */
  connectGranted: (port?: unknown) => Promise<boolean>;
  arm: () => Promise<void>;
  disarm: () => void;
  disconnect: () => Promise<void>;
  stop: () => Promise<void>;
  sendPose: (angles: Partial<JointAngles>) => void;
  ping: () => void;
  isBusy: boolean;
}

/** The pose the controller is brought to when the motors are armed. */
const HOME_POSE: JointAngles = {
  base: JOINTS.base.home,
  shoulder1: JOINTS.shoulder1.home,
  shoulder2: JOINTS.shoulder2.home,
  elbow: JOINTS.elbow.home,
  wrist: JOINTS.wrist.home,
  wristRotation: JOINTS.wristRotation.home,
  gripper: JOINTS.gripper.home,
};

export function useRobotController(): ControllerApi {
  const transportRef = useRef<RobotTransport | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastSentRef = useRef<JointAngles | null>(null);
  const hasCommandedRef = useRef(false);
  const keepAliveRef = useRef(0);
  const [status, setStatus] = useState<TransportStatus>("disconnected");
  const [isBusy, setBusy] = useState(false);

  const store = useRobotStore;

  const handleLine = useCallback(
    (line: string) => {
      const parsed = parseLine(line);
      switch (parsed.kind) {
        case "ready":
          /**
           * The board announces its protocol.
           *
           * The v2 sketch answers `READY,7` — seven channels. The original
           * five-channel sketch answers a bare `READY`, and the app's frames
           * would be mis-parsed by it, so the machine would move the wrong
           * joints (or not move at all) while the 3D view looked perfectly
           * happy. Say so here, loudly, instead of leaving the operator to
           * guess.
           */
          if (parsed.channels !== undefined && parsed.channels !== JOINT_NAMES.length) {
            store.getState().setConnection({
              lastMessage: `READY — board speaks ${parsed.channels} channels`,
              ready: true,
              error:
                `This board speaks ${parsed.channels} servo channels, but the app sends ` +
                `${JOINT_NAMES.length}. Flash firmware/arm_controller_v2.ino — the original ` +
                `arm_controller.ino parses a five-channel frame and will drive the wrong joints.`,
            });
            break;
          }
          if (parsed.channels === undefined) {
            store.getState().setConnection({
              lastMessage: "READY — controller booted",
              ready: true,
              hint:
                "The board did not announce its protocol version. If the model moves but the arm " +
                "does not, this board is probably still running the original arm_controller.ino — " +
                "flash firmware/arm_controller_v2.ino, which speaks the seven channels the app sends.",
            });
            break;
          }
          store.getState().setConnection({
            lastMessage: `READY — ${parsed.channels} channels, controller booted`,
            ready: true,
            hint: null,
            error: null,
          });
          break;
        case "pong":
          store.getState().setConnection({ lastMessage: "PONG" });
          break;
        case "joints":
          // The controller reporting its own targets. We do NOT overwrite the
          // commanded angles: they are ours. We only surface it as telemetry.
          store.getState().setConnection({
            lastMessage: `T ${describeFrame(parsed.frame)}`,
            reported: parsed.frame,
          });
          break;
        case "error":
          store.getState().setConnection({
            lastMessage: `ERR ${parsed.code}`,
            error: parsed.detail ? `${parsed.code}: ${parsed.detail}` : parsed.code,
          });
          break;
        default:
          store.getState().setConnection({ lastMessage: parsed.raw.slice(0, 48) });
      }
    },
    [store],
  );

  const handleStatus = useCallback(
    (next: TransportStatus, message?: string) => {
      setStatus(next);
      const patch: Partial<{
        status: TransportStatus;
        error: string | null;
        hint: string | null;
        lastMessage: string;
      }> = { status: next, lastMessage: message ?? "—" };
      if (next === "error") {
        patch.error = message ?? "Connection error.";
      } else {
        patch.error = null;
      }
      store.getState().setConnection(patch);
    },
    [store],
  );

  const handleDisconnect = useCallback(
    (reason: string) => {
      // A lost link must never replay anything. Drop pending motion and
      // disarm the hardware so nothing is sent on reconnect.
      centerJoysticks();
      /* The last transmitted pose is deliberately KEPT. Nulling it would make
         every later comparison fail, and the arm would never respond again
         until the page was reloaded. Nothing is replayed: the arm is
         disarmed and the operator has to arm it again. */
      hasCommandedRef.current = false;
      store.getState().setMotionLocked(true);
      store.getState().setHardwareArmed(false);
      store.getState().setConnection({
        status: "error",
        error: "The serial connection was lost.",
        hint: `The link dropped (${reason}). Nothing was replayed — re-arm the motors when the board is back.`,
        lastMessage: "LINK LOST",
        ready: false,
      });
    },
    [store],
  );

  const transportEvents = useRef({
    onLine: handleLine,
    onStatus: handleStatus,
    onDisconnect: handleDisconnect,
    onActivity: (direction: "tx" | "rx", bytes: number) =>
      store.getState().noteActivity(direction, bytes),
  });

  transportEvents.current.onLine = handleLine;
  transportEvents.current.onStatus = handleStatus;
  transportEvents.current.onDisconnect = handleDisconnect;

  /* ------------------------------------------------------------------ */
  /* Command loop                                                        */
  /* ------------------------------------------------------------------ */
  /**
   * The command loop lives for as long as the page does, but it must not run
   * before a device is attached. It is started here so that connecting a
   * device always brings the loop back to life.
   */
  useEffect(() => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setInterval(() => {
      const state = store.getState();
      const transport = transportRef.current;
      if (!transport || state.connection.status !== "connected") return;

      const dt = CONTROL_TICK_MS / 1000;

      /* Integrate the stick velocity into the commanded angles. A released
         stick contributes nothing, so the arm simply stays where it is. */
      const next = integrateJoystick(state.joints, {
        axes: {
          A: { ...getJoystickAxes("A") },
          B: { ...getJoystickAxes("B") },
        },
        limits: state.limits,
        inverted: state.inverted,
        deadZone: state.deadZone,
        sensitivity: state.sensitivity,
        maxRate: state.maxRate,
        dt,
      });
      const changed = posesDiffer(state.joints, next);
      if (changed) state.setJoints(next);

      /* The stick is integrated either way, so the readouts show what the
         operator is asking for. Nothing reaches the hardware until the
         motors are armed, though. */
      if (!state.hardwareArmed || state.motionLocked) return;

      /* Only write when something actually changed, plus a slow keepalive so
         the firmware watchdog knows the link is alive.
         IMPORTANT: until the operator has armed the motors we send nothing at
         all. Connecting must never move the arm. */
      const last = lastSentRef.current;
      const moved = last !== null && JOINT_NAMES.some((joint) => Math.abs(last[joint] - next[joint]) > 1e-4);
      const now = Date.now();
      const keepAliveDue = hasCommandedRef.current && now - keepAliveRef.current > 1000;

      if (moved || keepAliveDue) {
        keepAliveRef.current = now;
        lastSentRef.current = { ...next };
        hasCommandedRef.current = true;
        void transport.write(encodeJointFrame(next)).catch(() => undefined);
      }
    }, CONTROL_TICK_MS);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [store]);

  /* ------------------------------------------------------------------ */
  /* Connection management                                               */
  /* ------------------------------------------------------------------ */
  /**
   * Releases the current transport.
   *
   * It deliberately does NOT touch the command loop's interval: that timer
   * belongs to the component's lifetime, not to the connection's. Stopping it
   * here would silently kill the control loop the moment a device is
   * connected, and nothing would ever reach the arm again.
   */
  const teardown = useCallback(async () => {
    const transport = transportRef.current;
    transportRef.current = null;
    lastSentRef.current = null;
    hasCommandedRef.current = false;
    centerJoysticks();
    if (transport) {
      await transport.disconnect();
      transport.dispose();
    }
  }, []);

  const connectSerial = useCallback(async () => {
    setBusy(true);
    try {
      const baudRate = store.getState().connection.baudRate;
      const transport = new WebSerialTransport(baudRate, transportEvents.current);
      // Ask for the port FIRST, while we are still inside the click handler:
      // `requestPort()` needs the user gesture and must not be preceded by an
      // await.
      await transport.requestPort();
      await teardown();
      transportRef.current = transport;
      await transport.connect();
      // Nothing is sent until the operator commands something: connecting
      // must never move the arm.
      lastSentRef.current = { ...store.getState().joints };
      hasCommandedRef.current = false;
      store.getState().setConnection({
        mode: "webserial",
        portLabel: transport.label,
        error: null,
        hint: null,
        ready: false,
      });
    } catch (error) {
      store.getState().setConnection({
        status: "error",
        error: error instanceof Error ? error.message : "Could not connect.",
      });
    } finally {
      setBusy(false);
    }
  }, [store, teardown]);

  const connectMock = useCallback(async () => {
    setBusy(true);
    try {
      await teardown();
      const transport = new MockRobotTransport(transportEvents.current);
      transportRef.current = transport;
      await transport.connect();
      lastSentRef.current = { ...store.getState().joints };
      hasCommandedRef.current = false;
      store.getState().setConnection({
        mode: "mock",
        portLabel: transport.label,
        error: null,
        hint: "Simulated controller. No hardware is attached and no motor is driven.",
        ready: true,
      });
    } catch (error) {
      store.getState().setConnection({
        status: "error",
        error: error instanceof Error ? error.message : "Could not start the simulator.",
      });
    } finally {
      setBusy(false);
    }
  }, [store, teardown]);

  /**
   * Connect to a port the browser has already been granted, without showing
   * the operating system's device picker.
   *
   * This is what makes the controller behave like the Arduino IDE: the first
   * time you connect, the browser asks once. After that the port stays
   * granted, so plugging the board in again reconnects on its own.
   */
  const connectGranted = useCallback(
    async (port?: unknown) => {
      const ports = await WebSerialTransport.listGrantedPorts();
      const target = (port as { port?: unknown })?.port ?? port ?? ports[0];
      if (!target) {
        store.getState().setConnection({
          error: "No previously granted serial port was found.",
          hint: "Press “Select port & connect” once and grant the board access; after that the app reconnects by itself.",
        });
        return false;
      }

      setBusy(true);
      try {
        const transport = new WebSerialTransport(
          store.getState().connection.baudRate,
          transportEvents.current,
        );
        transport.usePort(target as never);
        await teardown();
        transportRef.current = transport;
        await transport.connect();
        lastSentRef.current = { ...store.getState().joints };
        hasCommandedRef.current = false;
        store.getState().setConnection({
          mode: "webserial",
          portLabel: transport.label,
          error: null,
          hint: null,
          ready: false,
        });
        return true;
      } catch (error) {
        store.getState().setConnection({
          status: "error",
          error: error instanceof Error ? error.message : "Could not reconnect.",
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [store, teardown],
  );

  /**
   * Plug-in / unplug detection.
   *
   * The browser fires these for ports the user has already granted, which is
   * exactly the "attach the USB and it just works" behaviour of the IDE.
   */
  useEffect(() => {
    if (!WebSerialTransport.supportsConnectionEvents()) return;
    const serial = (navigator as unknown as { serial: EventTarget }).serial;

    const onConnect = (event: Event) => {
      const state = store.getState();
      if (state.connection.status === "connected") return;
      if (!state.autoConnect) return;
      void connectGranted(event);
    };
    const onDisconnect = () => {
      const state = store.getState();
      if (state.connection.status !== "connected") return;
      state.setConnection({
        status: "error",
        error: "The board was unplugged.",
        hint: "The link dropped. Plug it back in and it reconnects by itself; no queued motion is replayed.",
        lastMessage: "UNPLUGGED",
        ready: false,
      });
    };

    serial.addEventListener("connect", onConnect);
    serial.addEventListener("disconnect", onDisconnect);
    return () => {
      serial.removeEventListener("connect", onConnect);
      serial.removeEventListener("disconnect", onDisconnect);
    };
  }, [store, connectGranted]);

  /**
   * On load, offer (and optionally take) a connection to a port that has
   * already been granted.
   */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ports = await WebSerialTransport.listGrantedPorts();
      if (cancelled || ports.length === 0) return;
      store.getState().setConnection({
        grantedPorts: ports.length,
        hint:
          store.getState().connection.status === "connected"
            ? null
            : "A serial port this browser has already been granted is available.",
      });
      if (store.getState().autoConnect) {
        await connectGranted(ports[0]);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [store, connectGranted]);

  const disconnect = useCallback(async () => {
    await teardown();
    centerJoysticks();
    store.getState().setMotionLocked(true);
    store.getState().setHardwareArmed(false);
    store.getState().setConnection({
      status: "disconnected",
      mode: null,
      portLabel: "",
      lastMessage: "—",
      error: null,
      hint: null,
    });
  }, [store, teardown]);

  /**
   * STOP.
   *
   * 1. Stop generating new commands (the motion lock).
   * 2. Clear pending application commands.
   * 3. Send the stop/hold verb to the controller.
   * 4. Recentre the sticks.
   *
   * It deliberately does NOT send zero or a home pose: the arm may be holding a
   * board, and the last commanded pose is the safest place to stay.
   */
  /**
   * Arm the motors.
   *
   * The first frame sent is the HOME pose. That matters: the original
   * firmware snaps the servos onto the first angle it is given, so handing
   * it a known home pose is the only safe way to take control of a machine
   * whose real position nobody knows yet.
   */
  const arm = useCallback(async () => {
    const state = store.getState();
    if (state.connection.status !== "connected") {
      state.setConnection({ error: "Connect a controller before arming the motors." });
      return;
    }
    const home = HOME_POSE;
    state.setJoints(home);
    state.setHardwareArmed(true);
    state.setMotionLocked(false);
    lastSentRef.current = { ...home };
    hasCommandedRef.current = true;
    keepAliveRef.current = Date.now();
    const transport = transportRef.current;
    if (transport) {
      try {
        await transport.write(encodeJointFrame(home));
        state.setConnection({
          lastMessage: `Armed — home pose sent (${JOINT_NAMES.map((j) => Math.round(home[j])).join(",")})`,
        });
      } catch {
        state.setConnection({ error: "Could not write to the controller." });
      }
    }
  }, [store]);

  /** Disarm: stop sending, keep the link. */
  const disarm = useCallback(() => {
    const state = store.getState();
    state.setHardwareArmed(false);
    state.setMotionLocked(true);
    centerJoysticks();
    state.setConnection({ lastMessage: "Motors disarmed" });
  }, [store]);

  const stop = useCallback(async () => {
    const state = store.getState();
    state.setMotionLocked(true);
    state.setHardwareArmed(false);
    centerJoysticks();
    const transport = transportRef.current;
    if (transport && state.connection.status === "connected") {
      try {
        await transport.write(encodeStop());
        state.setConnection({ lastMessage: "S,0 — stop/hold sent" });
      } catch {
        state.setConnection({ lastMessage: "Stop requested (write failed)" });
      }
    } else {
      state.setConnection({ lastMessage: "STOP — no device connected" });
    }
  }, [store]);

  const sendPose = useCallback(
    (angles: Partial<JointAngles>) => {
      const state = store.getState();
      state.setJoints(angles);
      const transport = transportRef.current;
      if (!transport || state.connection.status !== "connected") return;
      const frame = { ...state.joints, ...angles } as JointAngles;
      lastSentRef.current = { ...frame };
      hasCommandedRef.current = true;
      void transport.write(encodeJointFrame(frame)).catch(() => undefined);
    },
    [store],
  );

  const ping = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    void transport.write(encodePing()).catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  return {
    status,
    connectSerial,
    connectMock,
    connectGranted,
    arm,
    disarm,
    disconnect,
    stop,
    sendPose,
    ping,
    isBusy,
  };
}

function describeFrame(frame: JointAngles): string {
  return JOINT_NAMES.map((joint) => `${joint[0].toUpperCase()}${Math.round(frame[joint])}`).join(" ");
}

export { isWebSerialSupported };
