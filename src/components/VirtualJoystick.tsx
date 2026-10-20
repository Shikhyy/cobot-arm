import { useCallback, useEffect, useRef, useState } from "react";
import { MoveHorizontal, MoveVertical } from "lucide-react";

import { getJoystickAxes, setJoystickAxes, subscribeJoysticks } from "../robot/joystick";
import { useRobotStore } from "../robot/store";

export interface VirtualJoystickProps {
  id: "A" | "B";
  title: string;
  horizontalLabel: string;
  verticalLabel: string;
  disabled?: boolean;
}

/**
 * A virtual joystick.
 *
 * The stick produces *velocity*, not position: the axes are published to the
 * joystick bus and the control loop integrates them into the commanded joint
 * angles. Releasing the stick zeroes the velocity — it never sends the arm
 * back to a previous or home pose.
 */
export function VirtualJoystick({
  id,
  title,
  horizontalLabel,
  verticalLabel,
  disabled = false,
}: VirtualJoystickProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [values, setValues] = useState({ x: 0, y: 0 });

  const deadZone = useRobotStore((state) => state.deadZone);
  const motionLocked = useRobotStore((state) => state.motionLocked);
  const isDisabled = disabled || motionLocked;

  const radius = () => {
    const pad = padRef.current;
    if (!pad) return 100;
    return pad.clientWidth / 2;
  };

  const paint = useCallback((x: number, y: number) => {
    const knob = knobRef.current;
    if (!knob) return;
    const r = radius() * 0.62;
    knob.style.transform = `translate3d(${x * r}px, ${-y * r}px, 0)`;
  }, []);

  const publish = useCallback(
    (x: number, y: number, isActive: boolean) => {
      setJoystickAxes(id, { x, y, active: isActive });
    },
    [id],
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const r = rect.width / 2;
      let nx = (clientX - cx) / r;
      let ny = -(clientY - cy) / r;
      const magnitude = Math.hypot(nx, ny);
      if (magnitude > 1) {
        nx /= magnitude;
        ny /= magnitude;
      }
      // Visual dead zone: the handle stays put until the pointer clears it.
      const visualX = Math.abs(nx) < deadZone ? 0 : nx;
      const visualY = Math.abs(ny) < deadZone ? 0 : ny;
      paint(visualX, visualY);
      publish(nx, ny, true);
      setValues({ x: nx, y: ny });
    },
    [deadZone, paint, publish],
  );

  const release = useCallback(() => {
    pointerId.current = null;
    setActive(false);
    paint(0, 0);
    publish(0, 0, false);
    setValues({ x: 0, y: 0 });
  }, [paint, publish]);

  useEffect(() => {
    // Keep the visual in sync when something else recentres the stick (STOP).
    return subscribeJoysticks((changed) => {
      if (changed !== id) return;
      const axes = getJoystickAxes(id);
      if (!axes.active) {
        paint(0, 0);
        setValues({ x: 0, y: 0 });
        setActive(false);
      }
    });
  }, [id, paint]);

  /**
   * A stick must never stay stuck on if the pointer is lost — a tab switch,
   * a window blur or a cancelled gesture would otherwise leave the arm
   * driving in one direction for ever.
   */
  useEffect(() => {
    const onBlur = () => {
      if (pointerId.current !== null) release();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
    };
  }, [release]);

  useEffect(() => {
    if (!isDisabled) return;
    release();
  }, [isDisabled, release]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    event.preventDefault();
    pointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is an optimisation; the drag still works without it */
    }
    setActive(true);
    handleMove(event.clientX, event.clientY);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDisabled || pointerId.current !== event.pointerId) return;
    event.preventDefault();
    handleMove(event.clientX, event.clientY);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    event.preventDefault();
    release();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    const step = 0.25;
    const axes = getJoystickAxes(id);
    let { x, y } = axes;
    switch (event.key) {
      case "ArrowLeft":
        x = -step;
        break;
      case "ArrowRight":
        x = step;
        break;
      case "ArrowUp":
        y = step;
        break;
      case "ArrowDown":
        y = -step;
        break;
      default:
        return;
    }
    event.preventDefault();
    paint(x, y);
    publish(x, y, true);
    setValues({ x, y });
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    release();
  };

  return (
    <div className="joystick">
      <div className="joystick__head">
        <span className="eyebrow">{title}</span>
        <span className="chip">{active ? "ACTIVE" : "IDLE"}</span>
      </div>

      <div
        ref={padRef}
        className={`joystick__pad${active ? " is-active" : ""}${isDisabled ? " is-disabled" : ""}`}
        role="slider"
        tabIndex={isDisabled ? -1 : 0}
        aria-label={`${title} joystick. Arrow keys move the virtual stick. ${horizontalLabel} horizontal, ${verticalLabel} vertical.`}
        aria-valuetext={`${horizontalLabel} ${values.x.toFixed(2)}, ${verticalLabel} ${values.y.toFixed(2)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <span className="joystick__guide joystick__guide--h" />
        <span className="joystick__guide joystick__guide--v" />
        <span className="joystick__ring" />
        <span className="joystick__deadzone" style={{ inset: `${deadZone * 100}%` }} />
        <span className="joystick__center" />
        <span className="joystick__knob" ref={knobRef}>
          <span className="joystick__knob-inner" />
        </span>
      </div>

      <div className="joystick__readout">
        <div className="joystick__axis">
          <MoveHorizontal size={12} aria-hidden />
          <span className="joystick__axis-name">{horizontalLabel}</span>
          <span className="mono joystick__axis-value">{values.x >= 0 ? "+" : ""}{values.x.toFixed(2)}</span>
        </div>
        <div className="joystick__axis">
          <MoveVertical size={12} aria-hidden />
          <span className="joystick__axis-name">{verticalLabel}</span>
          <span className="mono joystick__axis-value">{values.y >= 0 ? "+" : ""}{values.y.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
