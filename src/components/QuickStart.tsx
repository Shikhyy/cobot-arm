import { useState } from "react";
import { ChevronDown, ChevronUp, ListOrdered } from "lucide-react";

/**
 * A short, practical guide shown on the dashboard.
 *
 * The controller only works if the board is connected, the ranges are
 * verified and the motors are armed, and each of those steps has one failure
 * mode that is easy to hit and hard to guess. The guide says what to do and
 * what to look at when it does not move.
 */
export function QuickStart() {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ListOrdered size={14} className="text-signal-500" aria-hidden />
        <span className="eyebrow">How to drive the arm</span>
        <span className="ml-auto text-mist-500">
          {open ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
        </span>
      </button>

      {open ? (
        <div className="border-t border-ink-750 px-4 py-4">
          <ol className="flex flex-col gap-4">
            {[
              {
                title: "Power the servos separately",
                body: "Five servos on the Arduino's 5 V pin will brown the board out. Use a 5–6 V supply rated for all five, and join its GND to the Arduino GND. A board that browns out drops the USB link, and the app then holds the motion.",
              },
              {
                title: "Close the IDE's serial monitor",
                body: "Only one program can hold the port. Quit the Arduino IDE's Serial Monitor before connecting, otherwise the browser cannot open the port.",
              },
              {
                title: "Connect",
                body: "Set Mode to USB serial, Baud to 115200, press “Select port & connect” and pick the Arduino in the device dialog. Opening the port resets the board, so wait for READY. After the first grant the browser remembers the port and the app reconnects on its own.",
              },
              {
                title: "Calibrate",
                body: "In Calibration, press Enable, then walk one joint at a time to its mechanical stop with the ±2° buttons. Record the ends with Min and Max, press Verify, and set the Servo zero so the 3D view matches the real arm. Use INV if a joint runs the wrong way.",
              },
              {
                title: "Arm",
                body: "Arming sends the home pose first and then accepts motion. Until every range is verified the motors stay disarmed.",
              },
              {
                title: "Drive",
                body: "Stick A drives the base (horizontal) and the shoulder (vertical); Stick B drives the elbow and the wrist. The sticks are velocity controls: release one and the arm stops where it is. The shoulder is driven by two servos in opposition, so one channel mirrors the other — the Joint controls panel shows both.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="mono mt-0.5 shrink-0 text-[11px] text-signal-500">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong className="block text-[12.5px] font-medium text-mist-100">{step.title}</strong>
                  <span className="mt-1 block text-[12px] leading-relaxed text-mist-400">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-lg border border-ink-750 bg-ink-850 p-3">
            <h3 className="eyebrow">If the arm does not move</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {[
                ["The numbers change but the arm is still", "The motors are not armed — press “Arm the motors”, and check that every joint is marked Verified."],
                ["No READY, nothing appears in the traffic counter", "Wrong port, a charge-only USB cable, or the sketch is not running. Try the simulator to prove the interface itself works."],
                ["The board keeps dropping out", "The servo supply is sagging. Give the servos their own supply and share the ground."],
                ["A joint moves the wrong way", "Toggle INV for that joint in Calibration. The app inverts the stick so the model and the machine agree."],
                ["The arm twists instead of turning", "The two shoulder servos are out of step. Check the far-side servo (D11) is on the arm's tail and is not loose — the firmware reports ERR,SHOULDER-PAIR."],
                ["The arm jumps on the first move", "The original firmware snaps the servos onto the first angle it is given. Flash arm_controller_v2.ino, which ramps from the home pose instead."],
              ].map(([symptom, fix]) => (
                <li key={symptom} className="text-[11.5px] leading-relaxed">
                  <span className="text-mist-200">{symptom} — </span>
                  <span className="text-mist-400">{fix}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
