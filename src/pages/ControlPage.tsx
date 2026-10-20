import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Layers, Move3d, RotateCcw, Crosshair } from "lucide-react";

import { RobotViewport } from "../three/RobotViewport";
import { RobotModel } from "../three/RobotModel";
import { ConnectionPanel } from "../components/ConnectionPanel";
import { StopButton } from "../components/StopButton";
import { VirtualJoystick } from "../components/VirtualJoystick";
import { JointControls } from "../components/JointControls";
import { GripperControls } from "../components/GripperControls";
import { MotionPresets } from "../components/MotionPresets";
import { MotionSettings } from "../components/MotionSettings";
import { CalibrationPanel } from "../components/CalibrationPanel";
import { RobotStatus } from "../components/RobotStatus";
import { ViewSwitcher } from "../components/ViewSwitcher";
import { ThemeToggle } from "../components/ThemeToggle";
import { useRobotController } from "../robot/useRobotController";
import { useRobotStore } from "../robot/store";

/**
 * The live controller.
 *
 * Desktop puts the 3D viewport on the left and the controls on the right.
 * On narrow screens everything stacks, with the connection and stop controls
 * kept at the top where a thumb can reach them.
 */
export function ControlPage() {
  const controller = useRobotController();
  const [resetSignal, setResetSignal] = useState(0);
  const [view, setView] = useState("full");
  const exploded = useRobotStore((state) => state.exploded);
  const setExploded = useRobotStore((state) => state.setExploded);
  const showLabels = useRobotStore((state) => state.showLabels);
  const setShowLabels = useRobotStore((state) => state.setShowLabels);
  const connection = useRobotStore((state) => state.connection);

  return (
    <div className="flex min-h-[100svh] flex-col bg-ink-950">
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--nav-h)] w-full max-w-[1680px] items-center gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 text-[12px] text-mist-400 transition-colors hover:text-mist-100"
          >
            <ArrowLeft size={14} aria-hidden />
            <span className="hidden sm:inline">Back to site</span>
          </Link>
          <span className="mono text-[12px] font-semibold tracking-[0.16em] text-mist-100">
            COBOT <span className="text-mist-500">/</span> CONTROL
          </span>
          <div className="ml-auto flex items-center gap-2">
            {connection.mode === "mock" ? (
              <span className="chip text-amber-400">SIMULATOR — no hardware</span>
            ) : null}
            <ThemeToggle />
            <span className="hidden sm:block">
              <StopButton controller={controller} variant="bar" />
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
        <RobotStatus />

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)] xl:grid-cols-[minmax(0,1.7fr)_minmax(400px,0.9fr)]">
          {/* ── viewport ── */}
          <section className="flex flex-col gap-3">
            <div className="panel relative overflow-hidden">
              <div className="h-[clamp(320px,52vh,720px)] w-full">
                <RobotViewport
                  home={{ position: [7.3, 4.35, 9.1], target: [0.4, 2.3, 0], fov: 34 }}
                  resetSignal={resetSignal}
                  view={view}
                >
                  <RobotModel showReadouts />
                </RobotViewport>
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                <div className="pointer-events-auto flex flex-wrap gap-2">
                  <ViewSwitcher value={view} onChange={setView} />
                  <button
                    type="button"
                    className={`btn btn--sm ${exploded ? "btn--primary" : ""}`}
                    aria-pressed={exploded}
                    onClick={() => setExploded(!exploded)}
                  >
                    <Layers size={12} aria-hidden /> Exploded
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm ${showLabels ? "btn--primary" : ""}`}
                    aria-pressed={showLabels}
                    onClick={() => setShowLabels(!showLabels)}
                  >
                    <Crosshair size={12} aria-hidden /> Labels
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn--sm pointer-events-auto"
                  onClick={() => setResetSignal((value) => value + 1)}
                >
                  <RotateCcw size={12} aria-hidden /> Reset view
                </button>
              </div>
            </div>

            <p className="flex items-center gap-2 text-[11px] text-mist-500">
              <Move3d size={12} aria-hidden />
              Drag to orbit · scroll to zoom · the view shows the commanded pose, not a measured one.
            </p>
          </section>

          {/* ── controls ── */}
          <section className="flex flex-col gap-4">
            <div className="sm:hidden">
              <StopButton controller={controller} />
            </div>

            <ConnectionPanel controller={controller} />

            <div className="panel p-4">
              <header className="flex items-center justify-between gap-3">
                <h2 className="eyebrow">Virtual sticks</h2>
                <span className="chip">velocity control</span>
              </header>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <VirtualJoystick
                  id="A"
                  title="Stick A"
                  horizontalLabel="Base"
                  verticalLabel="Shoulder"
                />
                <VirtualJoystick
                  id="B"
                  title="Stick B"
                  horizontalLabel="Elbow"
                  verticalLabel="Wrist"
                />
              </div>
            </div>

            <JointControls />
            <GripperControls />
            <MotionPresets />
            <MotionSettings />
            <CalibrationPanel />
          </section>
        </div>
      </div>
    </div>
  );
}
