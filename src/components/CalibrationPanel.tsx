import { AlertTriangle, BadgeCheck, Crosshair, RotateCcw } from "lucide-react";

import { JOINTS, JOINT_ORDER, type JointName } from "../robot/config";
import { useRobotStore } from "../robot/store";
import type { ControllerApi } from "../robot/useRobotController";

/**
 * Calibration workflow.
 *
 * Establishes, one joint at a time, which way an axis moves and what the
 * safe end stops are. The shipped firmware limits are only a starting point:
 * the real safe range of every joint depends on the assembly, and a wrong
 * limit is how a robot arm drives itself into its own frame.
 */
export function CalibrationPanel({ controller }: { controller: ControllerApi }) {
  const joints = useRobotStore((state) => state.joints);
  const limits = useRobotStore((state) => state.limits);
  const offsets = useRobotStore((state) => state.offsets);
  const setLimit = useRobotStore((state) => state.setLimit);
  const setJoint = useRobotStore((state) => state.setJoint);
  const setOffset = useRobotStore((state) => state.setOffset);
  const resetCalibration = useRobotStore((state) => state.resetCalibration);
  const connection = useRobotStore((state) => state.connection);
  const inverted = useRobotStore((state) => state.inverted);
  const setInverted = useRobotStore((state) => state.setInverted);
  const hardwareArmed = useRobotStore((state) => state.hardwareArmed);

  const live = connection.status === "connected";
  const allVerified = JOINT_ORDER.every((joint) => limits[joint].calibrated);

  const test = (joint: JointName, direction: 1 | -1) => {
    setJoint(joint, joints[joint] + direction * 2);
  };

  return (
    <section className="panel p-4" aria-labelledby="calibration-heading">
      <header className="flex items-center justify-between gap-3">
        <h2 id="calibration-heading" className="eyebrow">
          Calibration
        </h2>
        <span className={`chip ${allVerified ? "text-jade-400" : "text-amber-400"}`}>
          {allVerified ? "verified" : "required"}
        </span>
      </header>

      <p className="mt-2.5 flex gap-2 text-[11px] leading-relaxed text-mist-500">
        <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
        <span>
          Move one joint at a time until it reaches its mechanical stop, then record that angle as the
          limit. Keep the board and your fingers clear of the arm while testing.{" "}
          <strong className="font-medium text-mist-300">Servo zero</strong> aligns the 3D view with
          the real machine: put the link where the model shows its rest pose and press{" "}
          <em>Zero here</em>.
        </span>
      </p>

      {/* You cannot measure a joint you are not allowed to move, so the
          calibration gets its own arm switch. */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-ink-750 bg-ink-850 p-2.5">
        <span className="text-[11px] leading-relaxed text-mist-300">
          {hardwareArmed ? (
            <>
              <strong className="font-medium text-jade-400">Movement enabled.</strong> The ±2° buttons
              now drive the real arm.
            </>
          ) : (
            <>
              <strong className="font-medium text-mist-100">Enable movement to calibrate.</strong> The
              arm is brought to its home pose first, then the test buttons move one joint at a time.
            </>
          )}
        </span>
        {hardwareArmed ? (
          <button type="button" className="btn btn--sm shrink-0" onClick={() => controller.disarm()}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--sm btn--primary shrink-0"
            disabled={connection.status !== "connected"}
            onClick={() => void controller.arm()}
          >
            Enable
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col divide-y divide-ink-750">
        {JOINT_ORDER.map((joint) => {
          const spec = JOINTS[joint];
          const limit = limits[joint];
          const value = joints[joint];
          return (
            <div key={joint} className="py-3 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-mist-100">{spec.label}</span>
                <span className="mono text-[11.5px] text-mist-300">{Math.round(value)}°</span>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  className="btn btn--sm !px-1"
                  disabled={!live}
                  onClick={() => test(joint, -1)}
                >
                  −2°
                </button>
                <button
                  type="button"
                  className="btn btn--sm !px-1"
                  disabled={!live}
                  onClick={() => test(joint, 1)}
                >
                  +2°
                </button>
                <button
                  type="button"
                  className="btn btn--sm !px-1"
                  title="Record the current angle as the minimum"
                  onClick={() => {
                    setLimit(joint, { min: Math.round(value) });
                    const twin = JOINTS[joint].mirroredBy ?? JOINTS[joint].mirrorOf;
                    if (twin) {
                      setLimit(twin, {
                        min: Math.round(JOINTS[twin].home + (JOINTS[joint].home - value)),
                      });
                    }
                  }}
                >
                  Min
                </button>
                <button
                  type="button"
                  className="btn btn--sm !px-1"
                  title="Record the current angle as the maximum"
                  onClick={() => {
                    setLimit(joint, { max: Math.round(value) });
                    const twin = JOINTS[joint].mirroredBy ?? JOINTS[joint].mirrorOf;
                    if (twin) {
                      setLimit(twin, {
                        max: Math.round(JOINTS[twin].home + (JOINTS[joint].home - value)),
                      });
                    }
                  }}
                >
                  Max
                </button>
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="mono text-[10px] text-mist-500">
                  {Math.round(limit.min)}° — {Math.round(limit.max)}°
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost !px-1.5"
                    title="Flip this axis"
                    onClick={() => setInverted(joint, !inverted[joint])}
                  >
                    <RotateCcw size={11} aria-hidden />
                    {inverted[joint] ? "INV" : "NRM"}
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm !px-1.5 ${limit.calibrated ? "text-jade-400" : ""}`}
                    onClick={() => setLimit(joint, { calibrated: !limit.calibrated })}
                  >
                    {limit.calibrated ? (
                      <>
                        <BadgeCheck size={11} aria-hidden /> Verified
                      </>
                    ) : (
                      <>
                        <Crosshair size={11} aria-hidden /> Verify
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Servo zero: aligns the model with the real machine. */}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="eyebrow w-[62px] shrink-0">Servo zero</span>
                <input
                  type="number"
                  className="mono w-14 rounded-md border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[11px] text-mist-200 outline-none focus:border-signal-500"
                  value={offsets[joint]}
                  min={-90}
                  max={90}
                  step={1}
                  aria-label={`${spec.label} servo zero offset`}
                  onChange={(event) => setOffset(joint, Number(event.target.value))}
                />
                <button
                  type="button"
                  className="btn btn--sm btn--ghost !px-1.5"
                  title="Record the current pose as this joint's zero"
                  onClick={() => setOffset(joint, Math.round(value - JOINTS[joint].home))}
                >
                  Zero here
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn--sm mt-3 w-full"
        onClick={() => {
          JOINT_ORDER.forEach((joint) => setLimit(joint, { calibrated: true }));
        }}
      >
        <BadgeCheck size={12} aria-hidden />
        Mark every range as verified
      </button>
      <button
        type="button"
        className="btn btn--sm btn--ghost mt-1.5 w-full"
        onClick={resetCalibration}
      >
        Reset to firmware defaults
      </button>
    </section>
  );
}
