import { JOINTS } from "../robot/config";
import { useRobotStore } from "../robot/store";

/**
 * Gripper controls.
 *
 * The end effector is a two-finger servo with no feedback, so the panel
 * reports the **commanded** opening only. Nothing here claims the board is
 * actually gripped.
 */
export function GripperControls() {
  const gripper = useRobotStore((state) => state.joints.gripper);
  const limits = useRobotStore((state) => state.limits.gripper);
  const setJoint = useRobotStore((state) => state.setJoint);
  const spec = JOINTS.gripper;

  const span = limits.max - limits.min || 1;
  const openness = Math.max(0, Math.min(1, (gripper - limits.min) / span));

  return (
    <section className="panel p-4" aria-labelledby="gripper-heading">
      <header className="flex items-center justify-between gap-3">
        <h2 id="gripper-heading" className="eyebrow">
          End effector · commanded
        </h2>
        <span className="mono text-[10.5px] text-mist-500">
          {gripper <= limits.min + 4 ? "closed" : gripper >= limits.max - 4 ? "open" : "partial"}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <span className="absolute inset-0 rounded-full border border-ink-700" />
          <span
            className="absolute left-1/2 top-1/2 h-[3px] w-1/2 origin-left -translate-y-1/2 rounded-full bg-signal-500 transition-transform duration-200"
            style={{ transform: `translateY(-50%) rotate(${-70 + openness * 140}deg)` }}
          />
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mist-100" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-mist-200">Opening</span>
            <span className="mono text-[15px] font-semibold text-mist-100">
              {Math.round(gripper)}
              <span className="text-[11px] text-mist-500">°</span>
            </span>
          </div>
          <input
            type="range"
            className="mt-2 w-full"
            min={limits.min}
            max={limits.max}
            step={0.5}
            value={gripper}
            aria-label="Gripper commanded angle"
            onChange={(event) => setJoint("gripper", Number(event.target.value))}
            style={{
              background: `linear-gradient(to right, var(--color-signal-500) ${openness * 100}%, var(--color-ink-700) ${openness * 100}%)`,
              borderRadius: 99,
              height: 3,
            }}
          />
          <p className="mono mt-1.5 text-[10px] text-mist-500">
            travel {limits.min}° — {limits.max}° · servo D{spec.pin}
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn--sm flex-1"
          onClick={() => setJoint("gripper", limits.max)}
        >
          Open
        </button>
        <button
          type="button"
          className="btn btn--sm flex-1"
          onClick={() => setJoint("gripper", limits.min)}
        >
          Close
        </button>
      </div>
    </section>
  );
}
