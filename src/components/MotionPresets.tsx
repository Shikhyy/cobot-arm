import { useState } from "react";
import { Bookmark, Play, Trash2 } from "lucide-react";

import { useRobotStore } from "../robot/store";

/**
 * Pose presets.
 *
 * The built-in angles are *samples*: they place the arm in a sensible shape
 * but they are not a calibration of the real machine. Save a custom pose once
 * the arm has been calibrated and the two numbers stop being guesses.
 */
export function MotionPresets() {
  const presets = useRobotStore((state) => state.presets);
  const applyPreset = useRobotStore((state) => state.applyPreset);
  const savePreset = useRobotStore((state) => state.savePreset);
  const removePreset = useRobotStore((state) => state.removePreset);
  const joints = useRobotStore((state) => state.joints);
  const motionLocked = useRobotStore((state) => state.motionLocked);

  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const run = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    applyPreset(preset);
    setNote(`Commanded ${preset.name}.`);
  };

  return (
    <section className="panel p-4" aria-labelledby="presets-heading">
      <header className="flex items-center justify-between gap-3">
        <h2 id="presets-heading" className="eyebrow">
          Poses
        </h2>
        <span className="chip text-amber-400">sample angles</span>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <div key={preset.id} className="group relative">
            <button
              type="button"
              className="btn btn--sm w-full justify-start"
              disabled={motionLocked}
              title={preset.note}
              onClick={() => run(preset.id)}
            >
              <Play size={12} aria-hidden />
              <span className="truncate">{preset.name}</span>
            </button>
            {!preset.builtin ? (
              <button
                type="button"
                className="absolute -right-1.5 -top-1.5 rounded-full border border-ink-700 bg-ink-900 p-1 text-mist-500 opacity-0 transition-opacity hover:text-signal-500 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => removePreset(preset.id)}
              >
                <Trash2 size={10} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-ink-750 pt-3">
        <label className="eyebrow block" htmlFor="preset-name">
          Save current pose
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="preset-name"
            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-[12px] text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-signal-500"
            placeholder="e.g. Board A, 35°"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="button"
            className="btn btn--sm"
            disabled={!name.trim()}
            onClick={() => {
              savePreset(name, joints);
              setName("");
              setNote("Pose saved to this browser.");
            }}
          >
            <Bookmark size={12} aria-hidden /> Save
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-mist-500">
          Saved poses live in this browser's local storage. They record commanded angles only.
        </p>
        {note ? <p className="mono mt-1.5 text-[10.5px] text-mist-400">{note}</p> : null}
      </div>
    </section>
  );
}
