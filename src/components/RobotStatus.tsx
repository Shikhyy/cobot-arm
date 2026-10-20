import { Activity, Cpu, Radio, ShieldCheck, Signal } from "lucide-react";

import { JOINTS, JOINT_ORDER } from "../robot/config";
import { useRobotStore } from "../robot/store";

/**
 * Live robot status.
 *
 * Everything here is a *commanded* value or a link statistic. The servos have
 * no feedback channel, so nothing on this panel claims to know where the arm
 * physically is.
 */
export function RobotStatus() {
  const connection = useRobotStore((state) => state.connection);
  const joints = useRobotStore((state) => state.joints);
  const motionLocked = useRobotStore((state) => state.motionLocked);
  const hardwareArmed = useRobotStore((state) => state.hardwareArmed);
  const limits = useRobotStore((state) => state.limits);

  const calibrated = JOINT_ORDER.filter((joint) => limits[joint].calibrated).length;

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-700 bg-ink-700 sm:grid-cols-4">
      <Cell
        icon={<Signal size={12} aria-hidden />}
        label="Link"
        value={
          connection.status === "connected"
            ? connection.mode === "mock"
              ? "SIMULATED"
              : "USB SERIAL"
            : connection.status.toUpperCase()
        }
        tone={connection.status === "connected" ? "jade" : connection.status === "error" ? "signal" : "mist"}
      />
      <Cell
        icon={<Cpu size={12} aria-hidden />}
        label="Commanded"
        value={JOINT_ORDER.map((j) => `${JOINTS[j].label.slice(0, 3).toUpperCase()} ${Math.round(joints[j])}`).join(" · ")}
        mono
        small
      />
      <Cell
        icon={<Activity size={12} aria-hidden />}
        label="Motor state"
        value={!hardwareArmed ? "DISARMED" : motionLocked ? "HELD" : "RUNNING"}
        tone={!hardwareArmed ? "mist" : motionLocked ? "amber" : "jade"}
      />
      <Cell
        icon={<ShieldCheck size={12} aria-hidden />}
        label="Calibration"
        value={`${calibrated} / ${JOINT_ORDER.length} verified`}
        tone={calibrated === JOINT_ORDER.length ? "jade" : "amber"}
      />
    </div>
  );
}

function Cell({
  icon,
  label,
  value,
  tone = "mist",
  mono = true,
  small = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "mist" | "jade" | "amber" | "signal";
  mono?: boolean;
  small?: boolean;
}) {
  const toneClass = {
    mist: "text-mist-200",
    jade: "text-jade-400",
    amber: "text-amber-400",
    signal: "text-signal-400",
  }[tone];
  return (
    <div className="bg-ink-900 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-mist-500">
        {icon}
        <span className="eyebrow">{label}</span>
      </span>
      <span
        className={`mt-1 block truncate ${mono ? "mono" : ""} ${small ? "text-[10.5px]" : "text-[12.5px]"} ${toneClass}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function LinkBadge() {
  const connection = useRobotStore((state) => state.connection);
  const isLive = connection.status === "connected";
  return (
    <span
      className={`chip ${isLive ? "text-jade-400" : connection.status === "error" ? "text-signal-400" : "text-mist-400"}`}
      title={connection.portLabel || "No device"}
    >
      <span className={`dot${isLive ? " dot--live" : ""}`} aria-hidden />
      {connection.mode === "mock" ? "SIM" : isLive ? "LINKED" : connection.status.toUpperCase()}
      {isLive ? <Radio size={10} aria-hidden /> : null}
    </span>
  );
}
