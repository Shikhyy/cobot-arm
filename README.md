# COBOT / PCB FIXTURE

**Cobot-Assisted PCB Soldering Fixture** — a cinematic 3D landing page and a live,
browser-based joystick controller for a six-axis, 3D-printed robotic arm that holds
a PCB at a workable angle while a person solders it.

The 3D model on the site is **not an illustration**: it is the project's own CAD
export — the twenty printed parts in `Robotic+Arm+with+Servo+&+Arduino/` — welded,
optimised and assembled into six working axes with real joint pivots. The machine
has **seven servos**: the shoulder is driven by a mirrored pair.

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
npm run verify       # check the wire format and the control maths (38 checks)
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
(elbow) → wrist → wrist roll → gripper**, with every pitch axis parallel to the
world Z axis, the yaw axis vertical and the wrist roll about the forearm's own
axis. That is six axes, driven by seven servos.

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
lands square on the bracket instead of hanging off it. The tail drops into the
bracket's slot, and **two full-size servos are bolted to the base on either
side of it**, flanking the tail and driving the pair.

The two servos turn the opposite way to each other, so the app mirrors one onto
the other: `shoulder2 = 180 − shoulder1`, exactly as the machine runs it. The
firmware checks the pair on every frame and answers `ERR,SHOULDER-PAIR` if they
are out of step.

**The shoulder's rest angle is therefore zero.** That is the angle at which
the arm is bolted down, and it is the shoulder's home servo angle (D9 = 0°,
D10 = 180°). Any lean at the shoulder would lift the tail off its bracket and
make the joint read as floating.

`src/three/assembly.ts` is the single place where all of this lives. If the
original assembly file turns up, that one file is all that has to change.

### How the CAD is shaded

The model is the real export, and it has no texture maps: it came out of an
STL, so every surface was one flat colour and the shape disappeared into the
shading. Three things put the detail back:

* **Faceted normals.** The exporter welds the CAD's vertices, which averages
  the normals and rounds off every chamfer, fillet and hole edge. The rig
  splits them again on load, so the hard edges the designer drew come back
  and the small radii read as the band of facets a printed part really has.
* **Procedural surface detail** (`src/three/surface.ts`). The printed parts
  get the layer lines a 3D print leaves behind, a fine grain over the top,
  and darker valleys between the layers — all projected in world space,
  because there are no UVs to project along. The bands fade out as they get
  finer than the pixel grid, so they never turn into moire.
* **A studio lighting rig** (`src/three/Stage.tsx`): a warm key with a tight
  shadow, a hard cool rim from behind-left, a low kicker from behind-right
  that picks out the far edge of the tail, a warm front fill, a grazing light
  at the base so the machine does not float, and a procedural environment for
  the metal parts to reflect.

### Light and dark

The site ships with both themes. The switch lives in the top bar of the landing
page and in the header of the controller, the choice is remembered in local
storage, and the first paint is already in the right theme. The 3D stage
re-lights for the light theme — a brighter, softer key, a pale ground and a
lighter grid — so the machine reads the same way in both.

### Honest caveats

* The **home pose** follows the CAD: the parts are modelled in the pose the
  machine is bolted down in, so the rest offsets in `REST_POSE`
  (`src/three/assembly.ts`) are zero. The servo angles that produce it are the
  real ones — base 90°, shoulder 0° / 180°, elbow 180°, wrist 90°, wrist roll
  150° — so the model at home shows the near-vertical L of the export. If the
  machine on the bench looks different, the Calibration panel's **Zero here**
  lines the model up with it.
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
  are modelled procedurally as standard 40 × 20 mm servos, as the photograph
  shows: the base yaw servo sits **inside** the enclosure, and the pair of
  shoulder servos sits **on the base**, either side of the arm's tail, with
  their outputs on the shoulder axle that runs through both of them.
* Every angle the UI shows is a **commanded** angle. These servos have no
  position feedback, so nothing in this app can tell you where the arm
  physically is.

---

## 4. Flashing the firmware

Flash **`firmware/arm_controller_v2.ino`**. It is the sketch that speaks the
app's seven-channel frame, and it adds the stop verb, the gripper verbs, the
state report and the watchdog.

The original `arm_controller.ino` is kept in the repository untouched, for
reference. It speaks the older five-channel frame on a different pin map, so
it does **not** drive this machine and the app's frames will not parse on it.

1. Install the Arduino IDE (2.x).
2. Open `firmware/arm_controller_v2.ino`.
3. **Check the wiring table at the top of the sketch** against your machine and
   edit `PINS`, `MIN_ANGLE` and `MAX_ANGLE` if they differ. The shipped values
   are the real machine's:

   ```
   base.attach(13);
   shoulder1.attach(9);
   shoulder2.attach(10);
   elbow.attach(5);
   wrist.attach(6);
   wristRotation.attach(7);
   gripper.attach(11);
   ```
4. Board: **Arduino Uno**, Processor: **ATmega328P (old bootloader)** if your
   board has one.
5. Upload.

The controller answers `READY,7` on the serial monitor at 115200 baud, 8N1 —
the `7` is the number of servo channels it speaks, which is how the app
knows it is talking to the right firmware.

### Powering the servos

* **Never** power the servos from the Arduino's 5 V pin. Use a separate 5–6 V
  supply rated for the stall current of all seven servos.
* Join the supply's **GND** to the Arduino's GND. Without a common ground the
  serial link drops as soon as a servo stalls.
* Do not hot-plug the servos.

---

## 5. How to use it — start to finish

### The five things that have to be true

The arm only moves when **all** of these hold. Each has one failure mode that
is easy to hit and hard to guess, so they are listed in the order you should
check them.

| # | Must be true | Symptom if it is not |
| --- | --- | --- |
| 1 | The servos run off a **separate 5–6 V supply**, with its GND joined to the Arduino | The board browns out, the USB link drops, the app holds the motion |
| 2 | The Arduino IDE's **serial monitor is closed** | The browser cannot open the port — "could not be opened" |
| 3 | The link is **connected and READY** | The traffic counter stays at zero |
| 4 | Every joint range is **verified** | “Arm the motors” stays greyed out |
| 5 | The motors are **armed** | The numbers move, the arm does not |

### The bring-up order — do it in this order

The app cannot tell you where the arm physically is, so the first contact with
the real machine is a bench exercise, not a test of the app. The steps below
are ordered so that a mistake can only ever be a small one.

| # | Step | What to watch for |
| --- | --- | --- |
| 1 | Flash **v2** and leave the servo supply **off** | The original sketch has the wrong pin map and the wrong frame |
| 2 | Connect over USB, wait for `READY`, then try the **simulator** first | The interface works before the hardware is involved |
| 3 | **Pose the arm by hand at the home pose** — base 90°, shoulder 0°/180°, elbow 180°, wrist 90°, wrist roll 150°, gripper open | The firmware attaches the servos at the home angle on the first frame, so anything else is a snap |
| 4 | Power the servos from the limited supply, **arm unloaded**, and nudge **one axis at a time** with the ±2° buttons | Watch the real arm against the 3D view; use **INV** if an axis runs the wrong way |
| 5 | Walk each axis to its mechanical stop and record it with **Min** / **Max**, then **Verify** | This is what stops the arm driving into its own frame |
| 6 | Check the **shoulder pair** on its own, at a low supply voltage | The two sides are commanded as exact opposites; if they are not geared to each other, they will fight |
| 7 | Only then use the **sticks**, with a finger on **STOP MOTION** | |
| 8 | Only then put a board in the gripper | |

A browser button is not an emergency stop. Keep a physical power cut within
reach for the first run.

### 1. Wire the power

```
Arduino 5V  ─────────────┐
Arduino GND ───┬─────────┼── supply GND
               │         │
             servo 1..7  └── supply +5..6V   (rated for all seven, stalling)
```

The Arduino's 5 V pin cannot supply seven servos. Without a common ground the
serial link also drops under load, which looks exactly like a browser bug.
Never hot-plug the servos.

### 2. Flash the firmware

Flash `firmware/arm_controller_v2.ino` if you can. The original
`arm_controller.ino` also works for the joint frames, but it **snaps** the
servos onto the very first angle it is given, so your first slider move becomes
a jump. v2 attaches the servos at the home pose and ramps there at 3°/20 ms.

```
Arduino IDE → open firmware/arm_controller_v2.ino
             → Board: Arduino Uno
             → check PINS / MIN_ANGLE / MAX_ANGLE against your machine
             → Upload
```

It answers `READY,7` at 115200 baud — the channel count is the protocol
version. The app compares it with its own frame, so a board still running
the original five-channel sketch is reported as a mismatch instead of
looking like a dead arm. (The original sketch answers a bare `READY`, and
the app says so too.)

### 3. Connect

1. Plug the Arduino in, close the IDE's serial monitor.
2. Open **/control** in Chrome or Edge (Web Serial needs a secure context:
   `http://localhost` or HTTPS).
3. **Mode** → *USB serial*, **Baud** → *115200*.
4. **Select port & connect** → pick the Arduino in the device dialog.
   The browser cannot see a USB device until you do this — that is the
   browser's security boundary, not a bug.
5. Wait for **Controller ready** (the `READY` line). Opening the port resets
   the board, so give it a second.
6. From now on the browser remembers the grant: unplug and plug back in and
   the link returns on its own.

### 4. Calibrate, one joint at a time

Open **Calibration** in the right-hand column.

1. Press **Enable**. The arm is brought to its **home pose** first — that is
   the one pose both the app and the firmware agree on.
2. Use the **±2°** buttons to walk a joint towards its mechanical stop.
   Keep the board and your fingers out of the way.
3. At the stop, press **Min** or **Max** to record that angle as the limit.
4. Press **Verify** for that joint.
5. If the joint runs the wrong way, press **INV** for it. The app then
   inverts the stick, so the model and the machine agree.
6. **Servo zero**: put the link where the 3D model shows its rest pose and
   press **Zero here**. This is what lines the model up with the real arm —
   a servo's mechanical centre is rarely at 90°.

Repeat for all six axes. Until every axis is verified, the motors stay
disarmed.

### 5. Arm and drive

1. **Arm the motors** in the Link panel. This sends the home pose and then
   accepts motion.
2. **Stick A** — horizontal drives the base (yaw), vertical drives the
   shoulder. **Stick B** — horizontal drives the elbow, vertical drives the
   wrist.
3. The sticks are **velocity** controls: they add to the commanded angle at a
   bounded rate. Release one and the arm stops where it is. It never snaps
   back to a previous or home pose.
4. The **joint sliders** move one joint by a step you can change.
5. **Poses** run a stored pose. The built-in ones are *samples*, not a
   calibration — save your own once the arm is verified.
6. **STOP MOTION** stops command generation, clears pending motion, recentres
   the sticks and sends the hold command. It never zeroes the joints and never
   homes the arm: if it is holding a board, it keeps holding it.

### If the arm does not move

**Start with the strip under the viewport.** It says, in one line, whether
the link is up and whether the motors are armed — the 3D view always shows
the commanded pose, so the model moving tells you nothing about whether a
single byte went out.

| What the strip says | What it means |
| --- | --- |
| *Preview only* — the motors are disarmed | The numbers move, nothing is sent. Press **Arm the motors** (it needs all six joint ranges verified first). |
| *Waiting for the board* | The port is open, the controller has not said `READY` yet. |
| *Live* | The frames are going out. If the arm still does not move, the problem is the board, the wiring or the power, not the app. |
| *Board connected* but a red protocol error | The board speaks a different number of channels — flash `firmware/arm_controller_v2.ino`. |

The **Serial traffic** box shows the board's own report of its targets
(`board: 90,0,180,180,90,150,90 — agrees with the app`). That report is the
end of the line: if the app's numbers and the board's numbers agree, the
frame was understood and the fault is mechanical or electrical.

| Symptom | Cause and fix |
| --- | --- |
| The numbers move, the arm does not | The motors are not armed. Press **Arm the motors**; check every joint says *Verified*. |
| The app says *Live* and the board agrees, but the arm is still | The servos have no power, or they are on the wrong pins. The board's report is of its **targets**, not of where the arm is. |
| No `READY`, traffic counter stuck at 0 | Wrong port, a charge-only USB cable, the IDE still holds the port, or the sketch is not running. Try the simulator to prove the interface itself is fine. |
| The board keeps dropping out mid-move | The servo supply is sagging. Separate supply, shared ground. |
| A joint moves the wrong axis | Your wiring order differs from the firmware's pin map. Either re-order `PINS` in the sketch, or swap the two entries for that joint in `src/robot/config.ts`. |
| The arm twists instead of turning | The shoulder pair is out of step — check the far-side servo (D10) is actually on the arm's tail and is not loose. `ERR,SHOULDER-PAIR` in the traffic log says so. |
| A joint runs backwards | Press **INV** for it in Calibration. |
| The arm jumps on the first move | The original firmware snaps the servos to the first angle. Flash v2, which ramps from home. |
| The arm reaches a stop and keeps pushing | The limit was never recorded. Re-run the calibration for that joint. |

### The simulator

**Mode** → *Simulator* → **Start simulator**. It answers `READY`, reports its
state and accepts the same frames, so the whole interface can be exercised
with no board attached. It is labelled `SIMULATOR — no hardware` everywhere
and never claims to be the real arm.

---

## 6. The serial protocol

One command per line, LF terminated, 115200 baud 8N1.

```
A,<base>,<shoulder1>,<shoulder2>,<elbow>,<wrist>,<wristRot>,<gripper>
                                                set all seven targets
G,OPEN | G,CLOSE                                gripper verbs        (v2)
S,0                                             stop / hold         (v2)
HOME                                            home pose           (v2)
P                                               ping                (v2)
T                                               report the targets  (v2)
```

Replies: `READY`, `PONG`, `T,b,s1,s2,e,w,wr,g`, `OK,…`, `ERR,…`.

The channel order is the order the sketch attaches the servos, so the frame and
the wiring can never drift apart:

| # | Channel | Arduino pin | Home | Range | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `base` | D13 | 90° | 0–180 | yaw of the whole machine |
| 2 | `shoulder1` | D9 | 0° | 0–180 | the pair's reference servo |
| 3 | `shoulder2` | D10 | 180° | 0–180 | mirrored: `180 − shoulder1` |
| 4 | `elbow` | D5 | 180° | 0–180 | travels towards 0° |
| 5 | `wrist` | D6 | 90° | 0–180 | pitch of the tool |
| 6 | `wristRotation` | D7 | 150° | 0–180 | roll about the forearm axis |
| 7 | `gripper` | D11 | 90° | 0–180 | **0° open, 180° closed** |

The gripper is the one axis that runs the other way round to the others: it is
a linear end effector, so 0° is fully open and 180° is fully closed.

The shoulder pair is mirrored in the app itself (`mirrorAngle` in
`src/robot/config.ts`), so no path through the UI can desynchronise the two
sides. The firmware re-checks the pair on every frame and refuses to drive a
frame whose two shoulder angles do not agree.

### The arming contract

The app sends **nothing** to the hardware until the operator arms the motors.
Arming sends one frame — the home pose — and from then on a frame goes out
whenever the commanded angles change, plus a 1 Hz keepalive so the firmware
watchdog stays happy. Unplugging the board, pressing STOP, or reloading the
page all disarm the app; nothing is ever replayed on reconnect.

`src/robot/protocol.ts` and `firmware/arm_controller_v2.ino` are the two halves
of the contract and are kept in step with each other. `npm run verify` checks
that the frame the app writes is the frame the sketch parses.

---

## 7. Does it work with the real robot?

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
the first move is slow, bounded and predictable.

A servo that has never been written moves the moment it is attached, so the
sketch attaches the seven **one at a time**, 140 ms apart, each written to
its home angle first. One controlled lurch per servo is a very different
thing from the whole machine snapping over at once.

The original sketch is also the wrong pin map for this machine — it drives five
servos on D3, D5, D6, D9 and D10, where the prototype has seven on D13, D9,
D10, D5, D6, D7 and D11. Flash v2 before plugging anything in.

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
5. Repeat for all six axes, then tick **Arm the motors**.

### What is verified automatically

`npm run verify` runs `scripts/verify-control.mts`, which checks the parts of
the chain that do not need a robot: the wire format against the firmware's
`sscanf`, the line splitter across partial reads, the rate limiting and
clamping, that a released stick holds the pose instead of returning home, the
dead zone, the sensitivity, the axis inversion and the per-joint rate cap
against the firmware's 150°/s ramp. 38 checks.

### What only the bench can answer

Which servo channel drives which joint · the direction of every axis (use the
**INV** toggle and watch the real arm against the model) · the end stops
(record them with **Min** / **Max**) · the servo zero of each axis (**Zero
here**) · the servo voltage, stall current and the supply rating · the mass
and balance of the arm.

---

## 8. How the app is put together

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
    surface.ts      procedural print detail: layer lines, grain, edge light
    RobotModel.tsx  the articulated rig
    RobotViewport.tsx  canvas, camera rig, orbit controls, loading + error states
    Stage.tsx       studio lighting, procedural environment, ground
    director.ts     scroll-driven camera shots and the inspection views
    framing.ts      where the tool is, so the camera can keep the arm in shot
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
* The surface detail is a shader patch on the standard material, not a set of
  texture maps: the CAD ships with no UVs, and the detail is projected in
  world space instead.
* `prefers-reduced-motion` disables Lenis, the split-text reveals and the
  scroll-driven camera; the page renders its final state immediately.
* The stop control is present at every scroll position on the dashboard, and
  the joysticks are operable from the keyboard with the arrow keys.
* The dashboard is an operator console: the 3D viewport is **pinned**, so the
  machine never scrolls out of sight, and the wheel over the canvas zooms the
  camera instead of moving the page. The camera also re-frames itself as the
  arm moves — it keeps the base and the tool in shot without ever pushing in
  past the zoom the operator chose.

---

## 9. Known limitations

* The joint **limits and directions are the shipped firmware's defaults**,
  not a calibration of any particular machine. Calibrate before use.
* The channel order and the pin map come from the machine's own sketch, but
  the *directions* of every axis are still an assumption — a servo's zero is
  rarely where the drawing says it is. The Calibration workflow is what turns
  those assumptions into facts.
* The **shoulder pair's** limits are the reflection of each other. If one of
  the two servos is mechanically short of the other, the mirrored pair will
  fight itself near the ends of the travel.
* The mass, balance and safe working envelope of the arm are unknown.
* The browser's connection status reflects the **serial link**, not the health
  of the machine: it cannot tell you that a servo is stalled.
* The reference photographs and demonstration video referred to in the brief
  were not present in the repository. One photograph of the prototype was
  supplied during the build and was used to resolve the base assembly and the
  gripper; the visual direction was otherwise derived from the CAD geometry.
