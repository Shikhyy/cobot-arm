import { ShieldAlert, Octagon } from "lucide-react";

import { useRobotStore } from "../robot/store";
import type { ControllerApi } from "../robot/useRobotController";

/**
 * STOP MOTION.
 *
 * The browser button is a *command*, not an independent safety device. It
 * stops the app generating new commands and asks the controller to hold. Real
 * emergency stopping needs a hardware switch or power isolation.
 */
export function StopButton({
  controller,
  variant = "panel",
}: {
  controller: ControllerApi;
  variant?: "panel" | "bar";
}) {
  const motionLocked = useRobotStore((state) => state.motionLocked);
  const connection = useRobotStore((state) => state.connection);
  const setMotionLocked = useRobotStore((state) => state.setMotionLocked);

  const isLive = connection.status === "connected";

  return (
    <div
      className={
        variant === "bar"
          ? "flex items-center gap-3 rounded-xl border border-signal-600/40 bg-signal-600/10 px-3 py-2"
          : "panel border-signal-600/35 bg-signal-600/[0.06] p-4"
      }
    >
      <button
        type="button"
        className="btn btn--danger flex-1 !py-3 !text-[13px] !font-semibold !tracking-[0.08em] uppercase"
        onClick={() => {
          void controller.stop();
          setMotionLocked(true);
        }}
        title="Stop generating motion and hold the arm where it is"
      >
        <Octagon size={16} aria-hidden />
        Stop motion
      </button>

      {variant === "panel" ? (
        <>
          <p className="mt-3 flex gap-2 text-[10.5px] leading-relaxed text-mist-500">
            <ShieldAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Stop halts command generation, clears pending motion, recentres the sticks and sends the
              hold command. It never zeroes the joints and never returns the arm home — the board
              stays where it is. A browser button is not a guaranteed emergency stop: use a physical
              power cut or switch for that.
            </span>
          </p>
          {motionLocked ? (
            <p className="mono mt-2 text-[10.5px] text-amber-400">
              Motion held · re-arm the motors to resume
            </p>
          ) : isLive ? (
            <p className="mono mt-2 text-[10.5px] text-jade-400">Motion armed · commands are live</p>
          ) : (
            <p className="mono mt-2 text-[10.5px] text-mist-500">No device connected</p>
          )}
        </>
      ) : null}
    </div>
  );
}
