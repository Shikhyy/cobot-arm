import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Cpu,
  Grid3x3,
  Layers,
  Move3d,
  Ruler,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Navigation } from "../components/Navigation";
import { Explorer } from "../components/Explorer";
import { RobotViewport } from "../three/RobotViewport";
import { RobotModel } from "../three/RobotModel";
import { useLenis, scrollTo } from "../motion/useLenis";
import { useRevealAnimations } from "../motion/useRevealAnimations";
import { useScrollDirector } from "../motion/useScrollDirector";
import { gsap } from "../motion/useLenis";
import { useReducedMotion } from "../three/useMotionPreference";
import { useRobotStore } from "../robot/store";

/* ────────────────────────────── content ────────────────────────────── */

const ANATOMY = [
  {
    index: "01",
    title: "Rotating base",
    body: "A printed drum turns inside the Ø110 collar of the electronics enclosure, carrying the whole arm around the work area. The yaw column is a printed spindle rather than a metal post, and the servo that drives it lives down in the base tray.",
    joint: "Axis 1 · yaw",
  },
  {
    index: "02",
    title: "Shoulder",
    body: "A hobby servo drives the upper arm through a printed axle. The link is a 200 mm plate with a long slot milled out of its middle — the same slot that the forearm is cut from.",
    joint: "Axis 2 · pitch",
  },
  {
    index: "03",
    title: "Elbow",
    body: "The forearm ends in a clevis that straddles the elbow servo, so the servo body sits inside the joint rather than behind it. Two Ø10 bores 200 mm apart define the arm's real length.",
    joint: "Axis 3 · pitch",
  },
  {
    index: "04",
    title: "Wrist",
    body: "A small servo and a printed gear set the final angle. This is the axis that decides how steeply a board is presented to the iron, so it carries the finest increments of the five.",
    joint: "Axis 4 · pitch",
  },
  {
    index: "05",
    title: "Gripper",
    body: "Two printed blades pivot on a common pin and open into a V. The servo is 30° to 120°: the same channel as every other axis, and the only one that touches the workpiece.",
    joint: "Axis 5 · open / close",
  },
];

const TECH_SPECS = [
  { label: "Axes", value: "5 — yaw, shoulder, elbow, wrist, gripper" },
  { label: "Structure", value: "FDM printed, PETG, 3 mm walls" },
  { label: "Links", value: "Topology-optimised printed plate, slotted" },
  { label: "Actuation", value: "5 × hobby servo, external 5–6 V supply" },
  { label: "Controller", value: "Arduino Uno, USB serial, 115200 baud" },
  { label: "Feedback", value: "None — the app shows commanded angles" },
  { label: "Reach", value: "≈ 340 mm from the shoulder axis" },
  { label: "Mass", value: "Not yet measured" },
];

const DOCUMENTED = [
  "Five servo channels on Arduino pins 3, 5, 6, 9 and 10.",
  "A newline-delimited joint frame: A,<base>,<shoulder>,<elbow>,<wrist>,<gripper>.",
  "The printed part set and the bore positions measured from it.",
  "The fixture holds a board still — the soldering itself is still done by a person.",
];

const ASSUMED = [
  "The direction of each axis, and the physical end stops of every joint.",
  "Which of the five channels drives which joint, until the wiring is confirmed.",
  "The mass and balance of the arm, and therefore the safe working envelope.",
  "The servo voltage, current draw and the rating of the external supply.",
];

/* ────────────────────────────── page ────────────────────────────── */

export function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const reduced = useReducedMotion();
  const setSelectedPart = useRobotStore((state) => state.setSelectedPart);

  useLenis(true);
  useRevealAnimations(rootRef);
  useScrollDirector(rootRef);

  /* Hero entrance ------------------------------------------------- */
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || reduced) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.fromTo(
        "[data-hero='eyebrow']",
        { autoAlpha: 0, y: 14 },
        { autoAlpha: 1, y: 0, duration: 0.8 },
      )
        .fromTo(
          "[data-hero='title']",
          { autoAlpha: 0, y: 30, filter: "blur(10px)" },
          { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 1.15 },
          "-=0.55",
        )
        .fromTo(
          "[data-hero='copy']",
          { autoAlpha: 0, y: 20 },
          { autoAlpha: 1, y: 0, duration: 0.9 },
          "-=0.7",
        )
        .fromTo(
          "[data-hero='actions'] > *",
          { autoAlpha: 0, y: 16 },
          { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 },
          "-=0.6",
        )
        .fromTo(
          "[data-hero='meta'] > *",
          { autoAlpha: 0, y: 12 },
          { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.06 },
          "-=0.45",
        )
        .fromTo("[data-hero='cue']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, "-=0.3");
    }, hero);
    return () => ctx.revert();
  }, [reduced]);

  const openExplorer = (part?: string) => {
    if (part) setSelectedPart(part);
    setExplorerOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <Navigation />

      {/* The cinematic stage: one fixed canvas for the whole page. */}
      <div
        className="stage-canvas pointer-events-none transition-opacity duration-700"
        style={{ opacity: explorerOpen ? 0 : 1 }}
        aria-hidden
      >
        <div className="pointer-events-auto h-full w-full">
          <RobotViewport scrollDriven interactive={false}>
            <RobotModel />
          </RobotViewport>
        </div>
      </div>

      <Explorer open={explorerOpen} onClose={() => setExplorerOpen(false)} />

      <main className="relative z-10">
        {/* ═══════════════ HERO ═══════════════ */}
        <section
          ref={heroRef}
          className="landing-hero relative flex min-h-[100svh] items-end pb-16 pt-[calc(var(--nav-h)+40px)] lg:items-center lg:pb-0"
          id="overview"
        >
          <div className="landing-scrim absolute inset-0 -z-10" aria-hidden />
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <div className="max-w-[640px]">
              <p data-hero="eyebrow" className="eyebrow text-signal-500">
                Cobot-assisted PCB soldering fixture
              </p>
              <h1
                data-hero="title"
                data-motion-text="words"
                className="mt-5 text-[clamp(2.6rem,7.2vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-mist-100"
              >
                Precision at Every Angle.
              </h1>
              <p
                data-hero="copy"
                className="mt-6 max-w-[52ch] text-[15.5px] leading-[1.75] text-mist-300 sm:text-[17px]"
              >
                A smarter way to position PCBs for soldering. Explore, orient, and control a compact
                robotic fixture engineered for precision electronics work.
              </p>

              <div data-hero="actions" className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/control" className="btn btn--primary !px-6 !py-3 !text-[13.5px]">
                  Launch controller
                  <ArrowRight size={14} aria-hidden />
                </Link>
                <button
                  type="button"
                  className="btn !px-6 !py-3 !text-[13.5px]"
                  onClick={() => openExplorer()}
                >
                  <Move3d size={14} aria-hidden />
                  Explore in 3D
                </button>
              </div>

              <dl
                data-hero="meta"
                className="mt-14 grid max-w-[520px] grid-cols-2 gap-x-6 gap-y-5 border-t border-ink-800 pt-7 sm:grid-cols-4"
              >
                {[
                  ["Axes", "5 DOF"],
                  ["Structure", "Printed"],
                  ["Control", "Arduino + USB"],
                  ["Feedback", "Commanded only"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="eyebrow">{label}</dt>
                    <dd className="mono mt-1.5 text-[13px] text-mist-200">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div
            data-hero="cue"
            className="pointer-events-none absolute inset-x-0 bottom-8 hidden justify-center lg:flex"
          >
            <button
              type="button"
              className="pointer-events-auto flex flex-col items-center gap-2 text-mist-500 transition-colors hover:text-mist-200"
              onClick={() => scrollTo("#explorer")}
              aria-label="Scroll to the 3D Explorer section"
            >
              <span className="eyebrow">Scroll</span>
              <ArrowDown size={15} aria-hidden className="animate-bounce" />
            </button>
          </div>
        </section>

        {/* ═══════════════ THE PROBLEM ═══════════════ */}
        <section className="relative border-t border-ink-850/80 bg-ink-950/88 py-28 backdrop-blur-[2px] sm:py-36">
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
              <div>
                <p className="eyebrow text-signal-500">The problem</p>
                <h2
                  data-motion-text="words"
                  className="mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-mist-100"
                >
                  A third hand for the bench.
                </h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.8] text-mist-400">
                  Soldering a populated board means holding it still, at a workable angle, for a long
                  time. A third hand does that badly. A fixture does it well: clamp once, dial in the
                  angle, and let both hands stay on the iron and the solder.
                </p>
                <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.8] text-mist-400">
                  This robot is not a soldering machine. It is the fixture that a soldering machine
                  would need — a small, printed, five-axis arm that grips the board and holds the
                  angle you asked for.
                </p>
              </div>

              <div data-reveal-group className="grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-3">
                {[
                  {
                    icon: <Sparkles size={16} aria-hidden />,
                    title: "Held, not held",
                    body: "The board is gripped at the edge and stays there. No more balancing a PCB on a third pair of fingers.",
                  },
                  {
                    icon: <Ruler size={16} aria-hidden />,
                    title: "Repeatable angles",
                    body: "Five stored poses return the same board to the same angle, so a second board matches the first.",
                  },
                  {
                    icon: <Wrench size={16} aria-hidden />,
                    title: "Human in the loop",
                    body: "The iron, the solder and the judgement all stay with the operator. The arm only holds.",
                  },
                ].map((card) => (
                  <article
                    key={card.title}
                    data-reveal-item
                    className="bg-ink-900 p-6 transition-colors duration-500 hover:bg-ink-850"
                  >
                    <span className="text-signal-500">{card.icon}</span>
                    <h3 className="mt-4 text-[14.5px] font-semibold text-mist-100">{card.title}</h3>
                    <p className="mt-2.5 text-[13px] leading-[1.7] text-mist-400">{card.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ 3D EXPLORER ═══════════════ */}
        <section id="explorer" className="relative border-t border-ink-850/80 bg-ink-950/92 py-28 backdrop-blur-[2px] sm:py-36">
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20">
              <div>
                <p className="eyebrow text-signal-500">3D Explorer</p>
                <h2
                  data-motion-text="words"
                  className="mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-mist-100"
                >
                  Every printed part, in the open.
                </h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.8] text-mist-400">
                  The model on this site is not an illustration. It is the arm's own CAD export —
                  twenty 3D-printed parts, welded, optimised and assembled into five working axes.
                  Orbit it, pull it apart, and read the joint angles as they move.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn btn--primary !px-6 !py-3 !text-[13.5px]"
                    onClick={() => openExplorer()}
                  >
                    <Boxes size={14} aria-hidden />
                    Open the 3D Explorer
                  </button>
                  <span className="chip self-center">No download · runs in the browser</span>
                </div>
              </div>

              <ul data-reveal-group className="grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-2">
                {[
                  ["Base drum", "Alt_Govde", "turret"],
                  ["Upper arm link", "Alt_Kol", "upperArm"],
                  ["Forearm link", "On_Kol", "forearm"],
                  ["Elbow servo plate", "El · El_Ust", "forearm"],
                  ["Gripper palm", "Bilek", "wrist"],
                  ["Finger blade", "Parmak 2 X 2", "gripper"],
                ].map(([label, files, group]) => (
                  <li key={label} data-reveal-item className="bg-ink-900">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-850"
                      onClick={() => openExplorer()}
                    >
                      <span>
                        <span className="block text-[13.5px] font-medium text-mist-100">{label}</span>
                        <span className="mono mt-1 block text-[10px] text-mist-500">{files}</span>
                      </span>
                      <span className="chip shrink-0">{group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ═══════════════ ANATOMY / MECHANISM ═══════════════ */}
        <section
          id="mechanism"
          className="relative border-t border-ink-850/80 bg-ink-950/80 py-28 backdrop-blur-[2px] sm:py-36"
        >
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <p className="eyebrow text-signal-500">The mechanism</p>
            <h2
              data-motion-text="words"
              className="mt-5 max-w-[20ch] text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-mist-100"
            >
              Five axes, printed from one kit.
            </h2>

            <ol data-reveal-group className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800">
              {ANATOMY.map((item) => (
                <li
                  key={item.index}
                  data-reveal-item
                  className="group grid gap-4 bg-ink-900 p-6 transition-colors duration-500 hover:bg-ink-850 sm:grid-cols-[64px_1fr_200px] sm:items-baseline sm:gap-8 sm:p-7"
                >
                  <span className="mono text-[12px] text-signal-500">{item.index}</span>
                  <div>
                    <h3 className="text-[16px] font-semibold text-mist-100">{item.title}</h3>
                    <p className="mt-2.5 max-w-[62ch] text-[13.5px] leading-[1.75] text-mist-400">
                      {item.body}
                    </p>
                  </div>
                  <span className="chip self-start justify-self-start sm:justify-self-end">{item.joint}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ═══════════════ TECHNOLOGY ═══════════════ */}
        <section
          id="technology"
          className="relative border-t border-ink-850/80 bg-ink-950/94 py-28 backdrop-blur-[2px] sm:py-36"
        >
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
              <div>
                <p className="eyebrow text-signal-500">Technology</p>
                <h2
                  data-motion-text="words"
                  className="mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-mist-100"
                >
                  Printed for stiffness, slotted for weight.
                </h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.8] text-mist-400">
                  The arm's links are not solid plates. Each one carries a long slot that removes the
                  material where the load path does not need it, keeping the mass down without
                  losing the stiffness the servo torque has to push against.
                </p>
                <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.8] text-mist-400">
                  Below the printed structure sits a very ordinary control stack: an Arduino Uno, five
                  hobby servos, and a separate supply. The browser talks to the Uno over USB serial
                  and nothing else.
                </p>

                <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 sm:grid-cols-3">
                  {[
                    { icon: <Layers size={15} aria-hidden />, title: "Topology", body: "Slotted links cut mass without losing bending stiffness." },
                    { icon: <Grid3x3 size={15} aria-hidden />, title: "Interchangeable", body: "Axles, gears and fingers are printed parts, not bought assemblies." },
                    { icon: <Cpu size={15} aria-hidden />, title: "Open link", body: "One text protocol, readable by any terminal. No vendor tooling." },
                  ].map((card) => (
                    <div key={card.title} className="bg-ink-900 p-5">
                      <span className="text-signal-500">{card.icon}</span>
                      <h3 className="mt-3.5 text-[13.5px] font-semibold text-mist-100">{card.title}</h3>
                      <p className="mt-2 text-[12.5px] leading-[1.7] text-mist-400">{card.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div data-reveal-group>
                <div className="overflow-hidden rounded-2xl border border-ink-800">
                  <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-900 px-5 py-3.5">
                    <span className="dot text-mist-500" aria-hidden />
                    <span className="dot text-mist-500" aria-hidden />
                    <span className="dot text-mist-500" aria-hidden />
                    <span className="mono ml-2 text-[10.5px] text-mist-500">SPECIFICATION</span>
                  </div>
                  <dl className="divide-y divide-ink-850 bg-ink-900/60">
                    {TECH_SPECS.map((spec) => (
                      <div
                        key={spec.label}
                        data-reveal-item
                        className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 px-5 py-3.5"
                      >
                        <dt className="eyebrow pt-0.5">{spec.label}</dt>
                        <dd className="mono text-[12px] leading-relaxed text-mist-200">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
                  Reach and mass are estimates from the CAD geometry. Every other line is read off
                  the hardware or the firmware.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ LIVE CONTROL ═══════════════ */}
        <section
          id="control"
          className="relative border-t border-ink-850/80 bg-ink-950/90 py-28 backdrop-blur-[2px] sm:py-36"
        >
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20">
              <div>
                <p className="eyebrow text-signal-500">Live control</p>
                <h2
                  data-motion-text="words"
                  className="mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-mist-100"
                >
                  The arm, in your hands.
                </h2>
                <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.8] text-mist-400">
                  Plug the Arduino into a USB port, press connect, and pick the port in the browser
                  dialog. From then on the two virtual sticks move the real arm, one axis at a time,
                  with a stop button that is always in reach.
                </p>
                <ul className="mt-8 flex flex-col gap-2.5">
                  {[
                    "Web Serial over USB — no cloud, no account, no driver",
                    "Commanded-angle control with per-joint limits and rate caps",
                    "A simulator mode for the UI, clearly labelled as such",
                    "Calibration workflow that tests one axis at a time",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[13.5px] text-mist-300">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal-500" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link to="/control" className="btn btn--primary !px-6 !py-3 !text-[13.5px]">
                    Launch controller
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                </div>
              </div>

              <ControllerPreview />
            </div>
          </div>
        </section>

        {/* ═══════════════ ABOUT ═══════════════ */}
        <section
          id="about"
          className="relative border-t border-ink-850/80 bg-ink-950/96 py-28 backdrop-blur-[2px] sm:py-36"
        >
          <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <p className="eyebrow text-signal-500">About</p>
                <h2
                  data-motion-text="words"
                  className="mt-5 text-[clamp(1.9rem,4vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-mist-100"
                >
                  An honest picture of what is known.
                </h2>
                <p className="mt-6 text-[15px] leading-[1.8] text-mist-400">
                  This site documents a physical prototype. Some of what you read is measured from
                  the machine; some of it is still an assumption waiting to be checked on the bench.
                  The two are separated below, and the interface never pretends otherwise.
                </p>

                <div className="mt-9 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
                  <p className="text-[12.5px] leading-[1.75] text-amber-400/90">
                    The stop button in this app is a command, not a safety device. It cannot cut
                    servo power. Before the arm carries anything, fit a real switch or power
                    isolation, and run the servos from a supply that is rated for them with a shared
                    signal ground.
                  </p>
                </div>
              </div>

              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="eyebrow text-jade-400">Documented</h3>
                  <ul className="mt-4 flex flex-col gap-3">
                    {DOCUMENTED.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[13px] leading-[1.7] text-mist-300">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-jade-400" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="eyebrow text-amber-400">Assumed</h3>
                  <ul className="mt-4 flex flex-col gap-3">
                    {ASSUMED.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[13px] leading-[1.7] text-mist-300">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <footer className="border-t border-ink-850 bg-ink-950 py-14">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mono text-[12px] font-semibold tracking-[0.16em] text-mist-200">
                COBOT <span className="text-mist-500">/</span> PCB FIXTURE
              </p>
              <p className="mt-3 max-w-[52ch] text-[12.5px] leading-relaxed text-mist-500">
                A five-axis printed fixture for holding PCBs at a workable angle while a person
                solders. Built, modelled and documented in the open.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <button type="button" className="text-[12.5px] text-mist-400 hover:text-mist-100" onClick={() => scrollTo("#overview")}>
                Overview
              </button>
              <button type="button" className="text-[12.5px] text-mist-400 hover:text-mist-100" onClick={() => openExplorer()}>
                3D Explorer
              </button>
              <Link to="/control" className="text-[12.5px] text-mist-400 hover:text-mist-100">
                Live control
              </Link>
            </div>
          </div>
          <div className="mx-auto mt-10 w-full max-w-[1440px] border-t border-ink-850 px-5 pt-6 sm:px-8">
            <p className="mono text-[10.5px] text-mist-500">
              Commanded angles only — these servos have no position feedback. Never leave a board
              unattended in a moving pose.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

/* ────────────────────────── dashboard preview ────────────────────────── */

function ControllerPreview() {
  return (
    <div data-reveal className="relative">
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900 shadow-[0_40px_120px_-40px_rgba(255,74,44,0.25)]">
        <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-3">
          <span className="dot text-jade-400" aria-hidden />
          <span className="mono text-[10px] text-mist-500">LIVE CONTROL · /control</span>
          <span className="mono ml-auto text-[10px] text-mist-500">A,90,110,95,90,75</span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-ink-800 sm:grid-cols-3">
          {[
            ["BASE", "90°", 50],
            ["SHOULDER", "110°", 56],
            ["ELBOW", "95°", 47],
            ["WRIST", "90°", 50],
            ["GRIPPER", "75°", 50],
            ["SERIAL", "115200", 0],
          ].map(([label, value, fill]) => (
            <div key={label as string} className="bg-ink-900 px-4 py-3.5">
              <span className="eyebrow">{label}</span>
              <span className="mono mt-1.5 block text-[14px] text-mist-100">{value}</span>
              <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-ink-750">
                <span
                  className="block h-full bg-signal-500"
                  style={{ width: `${fill as number}%` }}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-ink-800 px-4 py-3.5">
          <span className="btn btn--sm btn--danger !py-1.5">Stop motion</span>
          <span className="chip">JOY A</span>
          <span className="chip">JOY B</span>
          <span className="chip ml-auto text-jade-400">LINKED</span>
        </div>
      </div>
    </div>
  );
}
