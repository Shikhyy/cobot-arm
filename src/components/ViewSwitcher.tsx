import { Scan, Target } from "lucide-react";

import { VIEWS } from "../three/director";

export interface ViewSwitcherProps {
  value: string;
  onChange: (view: string) => void;
}

/** Quick camera presets for inspecting a subsystem of the arm. */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Scan size={12} className="mr-1 text-mist-500" aria-hidden />
      {Object.entries(VIEWS).map(([key, shot]) => (
        <button
          key={key}
          type="button"
          className={`btn btn--sm ${value === key ? "btn--primary" : ""}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          <Target size={11} aria-hidden />
          {shot.name}
        </button>
      ))}
    </div>
  );
}
