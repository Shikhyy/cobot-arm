# COBOT / PCB FIXTURE

**Cobot-Assisted PCB Soldering Fixture** — a cinematic 3D landing page and a live,
browser-based joystick controller for a five-axis, 3D-printed robotic arm that holds
a PCB at a workable angle while a person solders it.

The 3D model on the site is **not an illustration**: it is the project's own CAD
export — the twenty printed parts in `Robotic+Arm+with+Servo+&+Arduino/` — welded,
optimised and assembled into five working axes with real joint pivots.

---

## 1. Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm run build        # type-check + production bundle into dist/
npm run preview      # serve the production build locally
npm run typecheck    # TypeScript only
npm run verify       # check the wire format and the control maths (27 checks)
```

The **Live Control** dashboard lives at `/control`. It needs a Chromium browser
(Chrome or Edge) served from `http://localhost` for the Web Serial API to be
available.

---

## 2. What is in the repository

| Path | What it is |
| --- | --- |
| `Robotic+Arm+with+Servo+&+Arduino/` | **The original CAD export** — 20 `.stl` files, untouched. |
| `arm_controller.ino` | **The original firmware**, untouched. Still works with this app. |
| `firmware/arm_controller_v2.ino` | A backwards-compatible superset of that firmware (stop verb, gripper verbs, ping, state report, watchdog). |
| `arm_console.html` | The original single-file console, kept for reference. |
| `scripts/build_model.py` | Turns the STLs into `public/models/cobot-arm.glb`. |
| `scripts/measure_bores.py` | Measures the joint bores in the CAD — this is how the assembly was recovered. |
| `scripts/inspect_*.py` | Offline STL renderers used to work out the assembly. |
| `scripts/verify-control.mts` | Automated check of the wire format and the control maths. |
| `src/three/assembly.ts` | **The authored assembly**: which part belongs to which link, and every joint pivot. |
| `src/robot/` | The controller: transports, protocol, state, joysticks. |
| `src/components/` | The UI. |
| `public/models/cobot-arm.glb` | The optimised browser model (one node per printed part). |

### Rebuilding the 3D model

```bash
python3 -m pip install trimesh numpy
python3 scripts/build_model.py
```

Output: `public/models/cobot-arm.glb` (≈1 MB, 60 k triangles) and
`public/models/cobot-arm.manifest.json`.

---

## 3. How the 3D assembly was reconstructed

No `.step`, `.FCStd` or other assembly file was provided — only the individual
STL parts. The kinematic chain was therefore recovered **from the geometry
itself** by slicing each part and locating its through-holes
(`scripts/measure_bores.py`):

| Part | Measurement | Meaning |
| --- | --- | --- |
| `On_Kol` | Ø10.5 bore on its own origin | one end of the forearm pivots here |
| `On_Kol` | Ø7 bore 140 mm away | the other end of the forearm |
| `Alt_Kol` | two Ø10 bores exactly 200 mm apart | the upper arm's two joints |
| `Mil_1` | Ø9.8 × 40 | axle that fits the Ø10.5 bore |
| `Mil_2` | Ø6.8 × 28 | axle that fits the Ø7 bore |
| `El` / `El_Ust` | 50 × 48 with a servo hole pattern | the elbow servo plate |
| `Bilek` | Ø5.5 bore + two Ø2.2 screw holes | the gripper palm |
| `Alt_Kasa` | Ø110 vertical bore | the collar the turret turns inside |
| `Alt_Kapak` | Ø40 bore, four screws on a Ø100 circle | the base plate and its socket |

From that: **base (static) → turret (yaw) → upper arm (shoulder) → forearm
(elbow) → wrist → gripper**, with every pitch axis parallel to the world Z axis
and the yaw axis vertical.

### The base, from the reference photograph

The prototype's base is a closed box with a rotating drum on top of it:

| Part | Role |
| --- | --- |
| `Alt_Kapak` | the bottom tray, turned over on the spot so its socket faces the desk |
| `Alt_Kasa` | the vented electronics enclosure, bolted on top of the tray |
| `Alt_Govde` | the base drum, whose spigot turns inside the enclosure's Ø110 collar |
| `Mil_3` | the printed yaw column, driven by the servo in the tray |
| `Tabla_Alt` | the spoked cable ring, lying on the enclosure |

The drum also carries a raised **bracket** — measured from the CAD it is 76 ×
58 × 30 mm, offset towards +X, and its top face is where the arm's tail lands.

### The shoulder joint

Measured from the STLs, not guessed:

* `Alt_Govde`'s bracket occupies CAD x −18 … 58, y ±29 and rises from z 20 to 50.
* `Alt_Kol` ends in a 55 × 30 mm tail whose Ø10 bore is 27.5 mm from the end.

So the shoulder pivot sits **19.8 mm forward of the turret axis and 27.5 mm
above the bracket's top face** — that is the only position where the tail
lands square on the bracket instead of hanging off it. The micro servo is
bolted to the back of that tail and drives a printed horn on the front, exactly
as the photograph shows.

**The shoulder's rest angle is therefore zero.** That is the angle at which
the arm is bolted down. All of the pose lives in the elbow and the wrist
instead, because any lean at the shoulder would lift the tail off its bracket
and make the joint read as floating.

`src/three/assembly.ts` is the single place where all of this lives. If the
original assembly file turns up, that one file is all that has to change.

### Light and dark

The site ships with both themes. The switch lives in the top bar of the landing
page and in the header of the controller, the choice is remembered in local
storage, and the first paint is already in the right theme. The 3D stage
re-lights for the light theme — a brighter, softer key, a pale ground and a
lighter grid — so the machine reads the same way in both.

### Honest caveats

* The **rest pose** was re-authored so the machine reads as a cobot rather than
  the near-vertical L the parts happen to be modelled in
  (`REST_POSE` in `src/three/assembly.ts`). The Home preset reproduces it exactly.
* The **gripper** is modelled the way the photograph shows it: the wrist folds the
  tool down over the work area, and a pair of thin printed blades pivots on a
  common pin and opens into a V. The lower blade is turned over so that its
  working face points up while the upper blade's working face points down —
  without that flip the pair could only ever meet edge to edge instead of
  gripping. The linkage inside the palm is not visible in the CAD export.
* The **head** of the arm is the prototype's: a small metal-case micro servo
  bolted to the far side of the arm's tail plate, driving a printed horn on
  the near side. The base yaw servo is a full-size one and sits **inside** the
  enclosure, driving the printed column up into the drum.
* The **base** is the closed box the photograph shows: `Alt_Kapak` is the bottom
  tray turned over on the spot, `Alt_Kasa` is the vented enclosure bolted on
  top of it, and `Alt_Govde` is the drum whose spigot turns inside the
  enclosure's Ø110 collar. The upper arm's tail lands on the drum so the
  shoulder reads as bolted to the base.
* The hobby servos, screws and wiring are **not** in the CAD export, so they
  are modelled procedurally as standard 40 × 20 mm servos plus the micro servo
  at the head, as the photograph shows.
* Every angle the UI shows is a **commanded** angle. These servos have no
  position feedback, so nothing in this app can tell you where the arm
  physically is.

---

## 4. Flashing the firmware

The app works with the **original** `arm_controller.ino` unchanged. Flash
`firmware/arm_controller_v2.ino` if you also want the stop verb, the gripper
verbs, the state report and the watchdog.

1. Install the Arduino IDE (2.x).
2. Open `firmware/arm_controller_v2.ino`.
3. **Check the wiring table at the top of the sketch** against your machine and
   edit `PINS`, `MIN_ANGLE` and `MAX_ANGLE` if they differ.
4. Board: **Arduino Uno**, Processor: **ATmega328P (old bootloader)** if your
   board has one.
5. Upload.

The controller answers `READY` on the serial monitor at 115200 baud, 8N1.

### Powering the servos

* **Never** power the servos from the Arduino's 5 V pin. Use a separate 5–6 V
  supply rated for the stall current of all five servos.
* Join the supply's **GND** to the Arduino's GND. Without a common ground the
  serial link drops as soon as a servo stalls.
* Do not hot-plug the servos.

---

## 5. Connecting over USB

1. Plug the Arduino into a USB port and close the Arduino IDE's serial monitor
   (the port can only be opened by one program at a time).
2. Open **/control** in Chrome or Edge.
3. Set **Mode** to *USB serial* and **Baud** to `115200`.
4. Press **Select port & connect** and pick the Arduino in the browser's device
   dialog. The browser will not see a USB device until you choose it.
5. The **Link** indicator turns green and the panel waits for the controller's
   `READY` (opening an Arduino port resets the board, so give it a second).
6. In the **Calibration** panel, test one joint at a time and record the real
   end stops with **Min** / **Max**, then press **Verify**.
7. Only then tick **Arm the motors** in the Link panel. Until the motors are
   armed the app refuses to send anything to the hardware.

There is also a **Simulator** mode, clearly labelled `SIMULATOR — no hardware`.
It exercises the entire interface, including the 3D rig, without moving a motor.

### Plug-and-go, like the IDE

The browser will not let a page open a serial port on its own: the operating
system's device picker *is* the security boundary, and that is deliberate.
What a page **can** do is remember the permission you granted, and the app
takes advantage of that:

* **Reconnect on plug-in** is on by default. Grant the board once and the
  browser keeps that permission for this origin, so from then on the app
  reopens the port by itself — no picker, no clicks. Unplug it and the panel
  says so; plug it back in and the link comes back on its own.
* A **Reconnect** button appears whenever a previously granted port is
  available.
* A reconnect never replays anything: pending commands are dropped and the
  motors stay disarmed until you arm them again.

The one thing a website genuinely cannot do is open a port it has never been
granted, so the *first* connection always asks once.

If you want true zero-click behaviour from the very first plug — including
uploading the sketch — that needs a local process, because the browser cannot
run `arduino-cli`. A small bridge that owns the port and exposes it over
`ws://localhost` does it; the trade-off is that you have to start it.

---

## 6. Using the controller

* **Stick A** — horizontal drives the base (yaw), vertical drives the shoulder.
* **Stick B** — horizontal drives the elbow, vertical drives the wrist.
* The sticks are **velocity** controls. They integrate into the commanded angles
  at the rate set in *Motion settings*. Releasing a stick stops the motion
  where it is; it never sends the arm back to a previous or home pose.
* **Joint sliders** move one joint by a step, with an increment you can change.
* **Poses** run the built-in sample poses, or one you saved from the current
  commanded pose. Saved poses live in this browser's local storage.
* **STOP MOTION** stops command generation, clears pending motion, recentres
  the sticks and sends the stop verb. It never zeroes the joints and never
  homes the arm — if it is holding a board, it keeps holding it.

### Safety

The stop button is a **command, not a safety device**. It cannot cut servo
power. Before the arm carries anything, fit a real switch or a latching relay
in the servo supply, and keep the arm's working envelope clear of anything it
could hit.

---

## 7. The serial protocol

One command per line, LF terminated, 115200 baud 8N1.

```
A,<base>,<shoulder>,<elbow>,<wrist>,<gripper>   set all five targets
G,OPEN | G,CLOSE                                gripper verbs        (v2)
S,0                                             stop / hold         (v2)
HOME                                            home pose           (v2)
P                                               ping                (v2)
T                                               report the targets  (v2)
```

Replies: `READY`, `PONG`, `T,b,s,e,w,g`, `OK,…`, `ERR,…`.

The app **only depends on the `A,…` frame**, so the original firmware works
unchanged. `src/robot/protocol.ts` and `firmware/arm_controller_v2.ino` are the
two halves of the contract and are kept in step with each other.

---

## 8. Does it work with the real robot?

This was audited end to end, and the audit found and fixed three problems that
would have stopped the arm responding at all.

### The bug that mattered

`teardown()` — the function that releases the old transport when you connect —
was also clearing the command loop's `setInterval`. The loop is created once,
when the page mounts, so the first connection permanently killed it. The sticks
moved the numbers on screen and nothing ever reached the serial port.

The command loop now belongs to the page, not to the connection, and the
transport teardown only releases the transport.

### The firmware snap

`arm_controller.ino` (the original) does this on the first command:

```c
current[i] = target[i];
servos[i].write(target[i]);
```

The servos are attached straight onto the commanded angle. Whatever pose the
arm was physically in, the first slider move **snaps** it to that angle — at
full speed, with no ramp. `arm_controller_v2.ino` now attaches the servos at
the **home** pose and lets the normal 3°/20 ms ramp walk the arm there, so
the first move is slow, bounded and predictable. With v1 still flashed, send
the **Home** pose as your first command and keep the arm unloaded.

### The other fixes

* `requestPort()` is now called from inside the click handler, before any
  `await`, so the browser cannot reject it for lacking a user gesture.
* The motors stay **disarmed** until every joint range has been verified.
* The panel now waits for the controller's `READY` before claiming a link —
  opening an Arduino port resets the board, so there is a boot delay.
* A stuck joystick (tab switch, lost pointer capture) can no longer leave the
  arm driving in one direction.
* New **servo zero** offset per joint: a servo's mechanical centre is rarely
  at 90°, so the app's number is the *servo* angle, not the link angle. Set
  the offset once with **Zero here** and the 3D view then shows the pose the
  arm is really in.

### The alignment procedure

1. Flash `firmware/arm_controller_v2.ino`.
2. Connect over USB, wait for `READY`.
3. In **Calibration**, move one joint at a time until it reaches its
   mechanical stop. Record it with **Min** / **Max**, then press **Verify**.
4. Put the link where the model shows its rest pose and press **Zero here** to
   align that joint.
5. Repeat for all five, then tick **Arm the motors**.

### What is verified automatically

`npm run verify` runs `scripts/verify-control.mts`, which checks the parts of
the chain that do not need a robot: the wire format against the firmware's
`sscanf`, the line splitter across partial reads, the rate limiting and
clamping, that a released stick holds the pose instead of returning home, the
dead zone, the sensitivity, the axis inversion and the per-joint rate cap
against the firmware's 150°/s ramp. 27 checks.

### What only the bench can answer

Which servo channel drives which joint · the direction of every axis (use the
**INV** toggle and watch the real arm against the model) · the end stops
(record them with **Min** / **Max**) · the servo zero of each axis (**Zero
here**) · the servo voltage, stall current and the supply rating · the mass
and balance of the arm.

---

## 9. How the app is put together

```
src/
  robot/            hardware layer — no DOM, no three.js
    config.ts       joint table, limits, pin map, presets  (single source of truth)
    protocol.ts     frame encode/decode + the incremental line splitter
    store.ts        zustand store: commanded angles, limits, settings, connection
    joystick.ts     velocity bus, outside React state
    useRobotController.ts   the only thing that writes to the port
    transport/      RobotTransport · WebSerialTransport · MockRobotTransport
  three/
    assembly.ts     the authored CAD assembly  ← edit this to re-pose the robot
    RobotModel.tsx  the articulated rig
    RobotViewport.tsx  canvas, camera rig, orbit controls, loading + error states
    Stage.tsx       studio lighting, procedural environment, ground
    director.ts     scroll-driven camera shots and the inspection views
  motion/           GSAP + Lenis (the only smooth-scroll engine on the site)
  components/       Navigation · VirtualJoystick · ConnectionPanel · JointControls …
  pages/            LandingPage · ControlPage
```

Two rules hold the design together:

1. **One source of truth.** The commanded joint angles live in the store. The 3D
   rig reads them imperatively inside `useFrame`; the wire encoder reads the
   same values. Nothing keeps a second copy of the pose, so the model can never
   disagree with the hardware.
2. **Presentation never touches the control path.** GSAP and Lenis animate the
   landing page only. They cannot move a joint, and they are reverted on
   unmount.

### Performance and accessibility

* One WebGL context per route; the landing page runs a single fixed canvas
  that the scroll narrative drives, and the 3D Explorer opens its own.
* The render loop pauses when the tab is hidden; device pixel ratio is capped
  at 1.75; the model is 60 k triangles in one draw call per material.
* `prefers-reduced-motion` disables Lenis, the split-text reveals and the
  scroll-driven camera; the page renders its final state immediately.
* The stop control is present at every scroll position on the dashboard, and
  the joysticks are operable from the keyboard with the arrow keys.

---

## 10. Known limitations

* The joint **limits and directions are the shipped firmware's defaults**,
  not a calibration of any particular machine. Calibrate before use.
* Which servo channel drives which joint is taken from the firmware's pin map
  and has not been verified against the physical wiring.
* The mass, balance and safe working envelope of the arm are unknown.
* The browser's connection status reflects the **serial link**, not the health
  of the machine: it cannot tell you that a servo is stalled.
* The reference photographs and demonstration video referred to in the brief
  were not present in the repository. One photograph of the prototype was
  supplied during the build and was used to resolve the base assembly and the
  gripper; the visual direction was otherwise derived from the CAD geometry.
