import { JOYSTICK_DEFAULTS } from "../robot/config";
import { useRobotStore } from "../robot/store";

/**
 * Motion settings.
 *
 * These tune the *input*, never the robot's own limits: the joint limits in
 * the Calibration panel are what actually protect the hardware.
 */
export function MotionSettings() {
  const sensitivity = useRobotStore((state) => state.sensitivity);
  const deadZone = useRobotStore((state) => state.deadZone);
  const maxRate = useRobotStore((state) => state.maxRate);
  const increment = useRobotStore((state) => state.increment);
  const setSensitivity = useRobotStore((state) => state.setSensitivity);
  const setDeadZone = useRobotStore((state) => state.setDeadZone);
  const setMaxRate = useRobotStore((state) => state.setMaxRate);
  const setIncrement = useRobotStore((state) => state.setIncrement);

  return (
    <section className="panel p-4" aria-labelledby="motion-heading">
      <h2 id="motion-heading" className="eyebrow">
        Motion settings
      </h2>

      <div className="mt-3 flex flex-col gap-3.5">
        <Slider
          label="Sensitivity"
          value={sensitivity}
          min={0.2}
          max={2.5}
          step={0.05}
          suffix="×"
          onChange={setSensitivity}
        />
        <Slider
          label="Dead zone"
          value={deadZone}
          min={0}
          max={0.4}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={setDeadZone}
        />
        <Slider
          label="Max rate"
          value={maxRate}
          min={5}
          max={200}
          step={5}
          suffix="°/s"
          onChange={setMaxRate}
        />
        <Slider
          label="Step size"
          value={increment}
          min={0.5}
          max={30}
          step={0.5}
          suffix="°"
          onChange={setIncrement}
        />
      </div>

      <button
        type="button"
        className="btn btn--sm mt-3 w-full"
        onClick={() => {
          setSensitivity(JOYSTICK_DEFAULTS.sensitivity);
          setDeadZone(JOYSTICK_DEFAULTS.deadZone);
          setMaxRate(JOYSTICK_DEFAULTS.maxRate);
        }}
      >
        Restore defaults
      </button>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
  format?: (value: number) => string;
}) {
  const filled = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[12px] text-mist-300">{label}</span>
        <span className="mono text-[11px] text-mist-400">
          {format ? format(value) : `${value}${suffix ?? ""}`}
        </span>
      </span>
      <input
        type="range"
        className="mt-1.5 w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-signal-500) ${filled}%, var(--color-ink-700) ${filled}%)`,
          borderRadius: 99,
          height: 3,
        }}
      />
    </label>
  );
}
