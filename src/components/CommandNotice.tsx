import { useEffect, useState } from "react";
import { CircleDot, Radio, ShieldAlert, Zap } from "lucide-react";

import { useRobotStore } from "../robot/store";
import { getJoystickAxes } from "../robot/joystick";
import { JOINT_ORDER } from "../robot/config";

/**
 * Is the app actually talking to the board?
 *
 * The 3D view always shows the commanded pose, whether or not anything is
 * being sent. That is the right behaviour — it lets the operator plan a
 * move — but it is also the easiest way to be fooled: the model moves, the
 * arm does not, and nothing says why.
 *
 * So this strip sits under the viewport and answers the only two questions
 * that matter while driving: is the link up, and are the motors armed?
 */
export function CommandNotice({ onArm }: { onArm: () => void }) {
  const status = useRobotStore((state) => state.connection.status);
  const mode = useRobotStore((state) => state.connection.mode);
  const ready = useRobotStore((state) => state.connection.ready);
  const armed = useRobotStore((state) => state.hardwareArmed);
  const limits = useRobotStore((state) => state.limits);
  const [deflected, setDeflected] = useState(false);

  /**
   * The sticks live outside React state, so the notice polls them. It only
   * needs to know whether the operator is asking for something, not how fast.
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const a = getJoystickAxes("A");
      const b = getJoystickAxes("B");
      setDeflected(
        Math.abs(a.x) + Math.abs(a.y) + Math.abs(b.x) + Math.abs(b.y) > 0.02,
      );
    }, 120);
    return () => window.clearInterval(timer);
  }, []);

  const isMock = mode === "mock";
  const unverified = JOINT_ORDER.filter((joint) => !limits[joint].calibrated);
  const allVerified = unverified.length === 0;

  /* --- the link --- */
  let link: { tone: "amber" | "jade"; text: string };
  if (isMock) {
    link = {
      tone: "amber",
      text: "Simulator — the frames are going to the built-in simulator, not to hardware.",
    };
  } else if (status !== "connected") {
    link = {
      tone: "amber",
      text: "Preview only — no board is connected, so the model is showing a preview.",
    };
  } else if (!ready) {
    link = {
      tone: "amber",
      text: "Waiting for the board to announce itself with READY.",
    };
  } else {
    link = { tone: "jade", text: "Board connected." };
  }

  /* --- the motors --- */
  const motors = armed
    ? {
        tone: "jade" as const,
        text: "Live — every change is going out of the port as it happens. STOP freezes the arm where it is.",
      }
    : {
        tone: (deflected ? "signal" : "amber") as "signal" | "amber",
        text: deflected
          ? "Preview only — the motors are disarmed, so the numbers are moving but nothing is being sent to the board."
          : "The motors are disarmed. The numbers move, but nothing is being sent to the board.",
      };

  const tone = {
    amber: "border-amber-400/25 bg-amber-400/5 text-amber-400",
    signal: "border-signal-500/40 bg-signal-500/10 text-signal-300",
    jade: "border-jade-500/25 bg-jade-500/5 text-jade-400",
  }[link.tone === "jade" && motors.tone === "jade" ? "jade" : motors.tone];

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[11px] ${tone}`}>
      {armed ? <CircleDot size={13} className="shrink-0" aria-hidden /> : <ShieldAlert size={13} className="shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1">
        <strong className="font-medium">{link.text}</strong>{" "}
        <span className={link.tone === motors.tone ? "" : "opacity-80"}>{motors.text}</span>{" "}
        {!armed && !isMock && allVerified ? (
          <span>Press <strong className="font-medium">Arm the motors</strong> to take control.</span>
        ) : null}
        {!armed && !isMock && !allVerified ? (
          <span>
            {unverified.length} of the six joint ranges are still unverified — an unverified limit
            is how a robot arm drives itself into its own frame.
          </span>
        ) : null}
      </span>
      {!armed && !isMock ? (
        <button
          type="button"
          className="btn btn--sm btn--primary shrink-0"
          disabled={!allVerified}
          title={
            allVerified
              ? "Take control of the arm"
              : `Verify the remaining ${unverified.length} joint range(s) first`
          }
          onClick={onArm}
        >
          <Zap size={12} aria-hidden />{" "}
          {allVerified ? "Arm the motors" : `${unverified.length} ranges left`}
        </button>
      ) : null}
      {isMock ? <Radio size={13} className="shrink-0 opacity-60" aria-hidden /> : null}
    </div>
  );
}
