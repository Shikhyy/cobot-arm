import { Minus, Plus, RotateCcw } from "lucide-react";

import { JOINTS, JOINT_ORDER, type JointName } from "../robot/config";
import { useRobotStore } from "../robot/store";

/**
 * Per-joint controls.
 *
 * The servos have no position feedback, so the number shown is the
 * **commanded** angle — what the controller has been told to do — and not a
 * measured position.
 */
export function JointControls() {
  const joints = useRobotStore((state) => state.joints);
  const limits = useRobotStore((state) => state.limits);
  const inverted = useRobotStore((state) => state.inverted);
  const increment = useRobotStore((state) => state.increment);
  const setJoint = useRobotStore((state) => state.setJoint);
  const setInverted = useRobotStore((state) => state.setInverted);
  const motionLocked = useRobotStore((state) => state.motionLocked);

  const nudge = (joint: JointName, direction: 1 | -1) => {
    const sign = inverted[joint] ? -1 : 1;
    setJoint(joint, joints[joint] + direction * increment * sign);
  };

  return (
    <section className="panel p-4" aria-labelledby="joints-heading">
      <header className="flex items-center justify-between gap-3">
        <h2 id="joints-heading" className="eyebrow">
          Joints · commanded
        </h2>
        <span className="mono text-[10.5px] text-mist-500">
          step {increment}°{motionLocked ? " · locked" : ""}
        </span>
      </header>

      <div className="mt-3 flex flex-col divide-y divide-ink-750">
        {JOINT_ORDER.map((joint) => {
          const spec = JOINTS[joint];
          const limit = limits[joint];
          const value = joints[joint];
          const span = limit.max - limit.min || 1;
          const filled = ((value - limit.min) / span) * 100;
          const calibrated = limit.calibrated;

          return (
            <div key={joint} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[13px] font-medium text-mist-100">{spec.label}</span>
                  <span className="mono text-[10px] text-mist-500">D{spec.pin}</span>
                  {inverted[joint] ? (
                    <span className="chip text-mist-400">INV</span>
                  ) : null}
                  {!calibrated ? (
                    <span className="chip text-amber-400" title="Limits are the shipped firmware defaults and have not been calibrated on this machine.">
                      UNCAL
                    </span>
                  ) : null}
                </div>
                <span className="mono text-[15px] font-semibold text-mist-100">
                  {Math.round(value)}
                  <span className="text-[11px] text-mist-500">°</span>
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost !px-2"
                  aria-label={`Decrease ${spec.label} by ${increment} degrees`}
                  onClick={() => nudge(joint, -1)}
                >
                  <Minus size={13} aria-hidden />
                </button>

                <div className="relative flex-1">
                  <input
                    type="range"
                    className="w-full"
                    min={limit.min}
                    max={limit.max}
                    step={0.5}
                    value={value}
                    aria-label={`${spec.label} commanded angle`}
                    onChange={(event) => setJoint(joint, Number(event.target.value))}
                    style={{
                      background: `linear-gradient(to right, var(--color-signal-500) ${filled}%, var(--color-ink-700) ${filled}%)`,
                      borderRadius: 99,
                      height: 3,
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn--sm btn--ghost !px-2"
                  aria-label={`Increase ${spec.label} by ${increment} degrees`}
                  onClick={() => nudge(joint, 1)}
                >
                  <Plus size={13} aria-hidden />
                </button>

                <button
                  type="button"
                  className="btn btn--sm btn--ghost !px-2"
                  aria-label={`Invert ${spec.label} axis`}
                  title={inverted[joint] ? "Axis inverted" : "Axis normal"}
                  onClick={() => setInverted(joint, !inverted[joint])}
                >
                  <RotateCcw size={12} aria-hidden />
                </button>
              </div>

              <p className="mono mt-1.5 flex justify-between text-[10px] text-mist-500">
                <span>
                  {limit.min}° — {limit.max}°
                </span>
                <span>{spec.description}</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
