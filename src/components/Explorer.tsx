import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Crosshair, Layers, Maximize2, RotateCcw, X } from "lucide-react";

import { ViewSwitcher } from "./ViewSwitcher";

import { RobotViewport } from "../three/RobotViewport";
import { RobotModel } from "../three/RobotModel";
import { PARTS } from "../three/assembly";
import { JOINTS, JOINT_ORDER } from "../robot/config";
import { useRobotStore } from "../robot/store";

/**
 * The 3D Explorer.
 *
 * A dedicated inspection mode with its own canvas: full orbit, zoom and pan,
 * selectable components with labels, live joint angles and an exploded view.
 * It opens as an overlay so the landing page keeps its scroll behaviour.
 */
export function Explorer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [resetSignal, setResetSignal] = useState(0);
  const [view, setView] = useState("full");
  const selectedPart = useRobotStore((state) => state.selectedPart);
  const setSelectedPart = useRobotStore((state) => state.setSelectedPart);
  const exploded = useRobotStore((state) => state.exploded);
  const setExploded = useRobotStore((state) => state.setExploded);
  const showLabels = useRobotStore((state) => state.showLabels);
  const setShowLabels = useRobotStore((state) => state.setShowLabels);
  const navigate = useNavigate();

  const joints = useRobotStore((state) => state.joints);
  const limits = useRobotStore((state) => state.limits);

  const parts = useMemo(
    () =>
      PARTS.map((part) => ({
        name: part.name,
        label: part.label,
        group: part.group,
      })),
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-ink-950/96 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="3D Explorer"
    >
      <header className="flex h-[var(--nav-h)] shrink-0 items-center gap-4 border-b border-ink-800 px-5 sm:px-8">
        <span className="eyebrow">3D Explorer</span>
        <span className="hidden text-[12px] text-mist-500 sm:block">
          Real CAD assembly · 20 printed parts · 5 axes
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setResetSignal((value) => value + 1)}
          >
            <RotateCcw size={12} aria-hidden /> Reset view
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost !px-2"
            aria-label="Close the 3D Explorer"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[42vh] flex-1 lg:min-h-0">
          <RobotViewport
            home={{ position: [7.3, 4.35, 9.1], target: [0.4, 2.3, 0], fov: 34 }}
            resetSignal={resetSignal}
            view={view}
          >
            <RobotModel showReadouts />
          </RobotViewport>

          <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap gap-2">
            <span className="chip pointer-events-auto">
              <Maximize2 size={10} aria-hidden /> Drag to orbit · scroll to zoom
            </span>
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-ink-800 p-5 lg:w-[360px] lg:border-l lg:border-t-0">
          <ViewSwitcher value={view} onChange={setView} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn btn--sm ${exploded ? "btn--primary" : ""}`}
              aria-pressed={exploded}
              onClick={() => setExploded(!exploded)}
            >
              <Layers size={12} aria-hidden /> Exploded view
            </button>
            <button
              type="button"
              className={`btn btn--sm ${showLabels ? "btn--primary" : ""}`}
              aria-pressed={showLabels}
              onClick={() => setShowLabels(!showLabels)}
            >
              <Crosshair size={12} aria-hidden /> Joint labels
            </button>
          </div>

          <section>
            <h3 className="eyebrow">Components</h3>
            <ul className="mt-2 flex flex-col gap-px overflow-hidden rounded-lg border border-ink-800">
              {parts.map((part) => (
                <li key={part.name}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] transition-colors ${
                      selectedPart === part.name
                        ? "bg-signal-500/15 text-mist-100"
                        : "text-mist-300 hover:bg-ink-850"
                    }`}
                    onClick={() => setSelectedPart(selectedPart === part.name ? null : part.name)}
                  >
                    <span className="truncate">{part.label}</span>
                    <span className="mono shrink-0 text-[9.5px] text-mist-500">{part.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="eyebrow">Joint angles · commanded</h3>
            <div className="mt-2 flex flex-col gap-1.5">
              {JOINT_ORDER.map((joint) => {
                const spec = JOINTS[joint];
                const limit = limits[joint];
                const value = joints[joint];
                const span = limit.max - limit.min || 1;
                const filled = ((value - limit.min) / span) * 100;
                return (
                  <div key={joint} className="rounded-lg border border-ink-800 bg-ink-900/60 p-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-mist-200">{spec.label}</span>
                      <span className="mono text-[12px] font-semibold text-signal-400">
                        {Math.round(value)}°
                      </span>
                    </div>
                    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-ink-750">
                      <div
                        className="h-full bg-signal-500"
                        style={{ width: `${Math.max(0, Math.min(100, filled))}%` }}
                      />
                    </div>
                    <p className="mono mt-1 text-[9.5px] text-mist-500">
                      {Math.round(limit.min)}° — {Math.round(limit.max)}° · D{spec.pin}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <button
            type="button"
            className="btn btn--primary mt-auto w-full"
            onClick={() => {
              onClose();
              navigate("/control");
            }}
          >
            <Boxes size={13} aria-hidden /> Open the live controller
          </button>
        </aside>
      </div>
    </div>
  );
}
