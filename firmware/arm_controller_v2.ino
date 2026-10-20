/*
  Cobot-Assisted PCB Soldering Fixture — robot arm controller
  Arduino Uno (ATmega328P), Servo library, USB serial.

  ────────────────────────────────────────────────────────────────────────────
  PROTOCOL — 115200 baud, 8N1, one command per line, LF terminated.
  ────────────────────────────────────────────────────────────────────────────
  The browser (see src/robot/protocol.ts) speaks exactly this.

    A,<base>,<shoulder>,<elbow>,<wrist>,<gripper>
        Set the target angle of all five joints, in degrees.
        Example:  A,90,110,95,90,75

    G,OPEN | G,CLOSE          Open / close the gripper (v2 only)
    S,0                       Stop: freeze the current position (v2 only)
    HOME                      Move to the home pose (v2 only)
    P                         Ping — the controller answers with PONG
    T                         Report the current targets as T,b,s,e,w,g

  Replies:
    READY                     printed once at boot
    PONG                      answer to P
    T,b,s,e,w,g               the current target angles
    ERR,<code>                the last command was rejected

  The original arm_controller.ino understands ONLY the A,... frame. This
  sketch is a backwards compatible superset: if you flash v1 instead, the
  web app still works, it just will not receive PONG / T / status replies and
  the G, S and HOME commands are ignored.

  ────────────────────────────────────────────────────────────────────────────
  SAFETY
  ────────────────────────────────────────────────────────────────────────────
  • The servos have no position feedback. The app shows COMMANDED angles.
  • Never power the servos from the Arduino's 5 V pin. Use a separate 5-6 V
    supply rated for the stall current of all five servos, and join its GND
    to the Arduino GND, otherwise the serial link drops under load.
  • The watchdog below only freezes the arm. It cannot switch the power off.
    Fit a real switch or a latching relay if you need an emergency stop.
  • If the link is lost the arm holds its last position. It does NOT home.
  ────────────────────────────────────────────────────────────────────────────
*/

#include <Servo.h>

const uint8_t NUM_JOINTS = 5;

// ── WIRING ───────────────────────────────────────────────────────────────────
//                                  base shoulder elbow wrist gripper
const uint8_t PINS[NUM_JOINTS] = {   3,     5,      6,    9,     10 };

// Hard limits enforced on the controller as well as in the app.
// These match the values in src/robot/config.ts. ADJUST THEM to the real
// machine before driving it with anything in the jaws.
const int MIN_ANGLE[NUM_JOINTS]  = {   0,    20,     20,    0,     30 };
const int MAX_ANGLE[NUM_JOINTS]  = { 180,   160,    160,  180,    120 };

// Home pose (also the "HOME" command target).
const int HOME_ANGLE[NUM_JOINTS] = {  90,   110,     95,   90,     75 };

// Gripper travel used by G,OPEN / G,CLOSE.
const int GRIPPER_OPEN  = 120;
const int GRIPPER_CLOSE =  30;

// ── MOTION ───────────────────────────────────────────────────────────────────
// Maximum degrees a servo may move every 20 ms (3 deg = 150 deg/s). Lower =
// gentler. Raise it if the arm is too slow.
const float MAX_STEP = 3.0;

// If no valid command arrives for this long, freeze the arm where it is.
const unsigned long WATCHDOG_MS = 750;

// How often the controller answers T / status requests.
const unsigned long REPORT_MS = 1000;

Servo servos[NUM_JOINTS];
float current[NUM_JOINTS];      // where the servos actually are (commanded)
int   target[NUM_JOINTS];       // where we want them
bool  attached = false;
bool  frozen = false;           // set by S,0
unsigned long lastCommandAt = 0;
unsigned long lastReportAt = 0;

// ── SERIAL PARSING ───────────────────────────────────────────────────────────
char buf[48];
uint8_t len = 0;

// A very small integer parser: returns false on anything that is not a
// plain decimal integer inside the given range.
bool parseInt(const char *s, int lo, int hi, int &out) {
  if (s == nullptr || *s == '\0') return false;
  bool neg = false;
  if (*s == '-') { neg = true; s++; }
  if (*s == '\0') return false;
  long value = 0;
  uint8_t digits = 0;
  while (*s >= '0' && *s <= '9') {
    value = value * 10 + (*s - '0');
    if (value > 100000L) return false;   // runaway digit
    s++;
    digits++;
    if (digits > 4) return false;
  }
  if (*s != '\0' || digits == 0) return false;
  if (neg) value = -value;
  if (value < lo || value > hi) return false;
  out = (int)value;
  return true;
}

// Split "a,b,c" into up to NUM_JOINTS integers. Returns the count parsed.
uint8_t parseJointList(char *payload, int *out) {
  uint8_t count = 0;
  char *token = strtok(payload, ",");
  while (token != nullptr && count < NUM_JOINTS) {
    int value = 0;
    if (!parseInt(token, -1000, 1000, value)) return 0;
    out[count++] = value;
    token = strtok(nullptr, ",");
  }
  return count;
}

void reportState() {
  Serial.print('T');
  for (uint8_t i = 0; i < NUM_JOINTS; i++) {
    Serial.print(',');
    Serial.print((int)lroundf(target[i]));
  }
  Serial.println();
}

void applyTargets(const int *values) {
  for (uint8_t i = 0; i < NUM_JOINTS; i++) {
    target[i] = constrain(values[i], MIN_ANGLE[i], MAX_ANGLE[i]);
  }
  if (!attached) {
    // First command after power-up: the servos are not attached yet, so the
    // arm is wherever its mechanical spring left it and we do not know where.
    // Rather than snapping to the commanded angle (which is how the original
    // arm_controller.ino behaves, and which can slam the arm into a stop),
    // attach the servos at the HOME pose and let the normal 3 deg/20 ms ramp
    // walk the arm there. The move is then slow, bounded and predictable.
    for (uint8_t i = 0; i < NUM_JOINTS; i++) {
      current[i] = (float)HOME_ANGLE[i];
      servos[i].write(HOME_ANGLE[i]);
      servos[i].attach(PINS[i]);
    }
    attached = true;
    Serial.println("OK,ATTACHED");
  }
  frozen = false;
  lastCommandAt = millis();
}

void handleLine(char *line) {
  if (line[0] == '\0') return;

  if (line[0] == 'A' && line[1] == ',') {
    int values[NUM_JOINTS];
    char payload[40];
    strncpy(payload, line + 2, sizeof(payload) - 1);
    payload[sizeof(payload) - 1] = '\0';
    uint8_t count = parseJointList(payload, values);
    if (count != NUM_JOINTS) {
      Serial.println("ERR,JOINTS");
      return;
    }
    applyTargets(values);
    return;
  }

  if (line[0] == 'G' && line[1] == ',') {
    if (strncmp(line + 2, "OPEN", 4) == 0) {
      target[4] = GRIPPER_OPEN;
      frozen = false;
      lastCommandAt = millis();
    } else if (strncmp(line + 2, "CLOSE", 5) == 0) {
      target[4] = GRIPPER_CLOSE;
      frozen = false;
      lastCommandAt = millis();
    } else {
      Serial.println("ERR,GRIPPER");
    }
    return;
  }

  if (line[0] == 'S' && line[1] == ',') {
    int value = 0;
    if (parseInt(line + 2, 0, 1, value)) {
      frozen = true;                 // hold the current position
      Serial.println("OK,STOP");
    } else {
      Serial.println("ERR,STOP");
    }
    return;
  }

  if (strcmp(line, "HOME") == 0) {
    applyTargets(HOME_ANGLE);
    Serial.println("OK,HOME");
    return;
  }

  if (strcmp(line, "P") == 0) {
    Serial.println("PONG");
    return;
  }

  if (strcmp(line, "T") == 0) {
    reportState();
    return;
  }

  Serial.println("ERR,UNKNOWN");
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < NUM_JOINTS; i++) {
    current[i] = (float)HOME_ANGLE[i];
    target[i] = HOME_ANGLE[i];
  }
  Serial.println("READY");
}

void loop() {
  // ── read and split the incoming stream into lines ────────────────────────
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      buf[len] = '\0';
      handleLine(buf);
      len = 0;
    } else if (c != '\r') {
      if (len < sizeof(buf) - 1) {
        buf[len++] = c;
      } else {
        // Overlong line: drop it instead of overflowing the buffer.
        len = 0;
        Serial.println("ERR,LENGTH");
      }
    }
  }

  // ── watchdog ──────────────────────────────────────────────────────────────
  if (attached && !frozen && (millis() - lastCommandAt) > WATCHDOG_MS) {
    // The link died. Freeze the arm where it is; do NOT home and do NOT
    // drive the joints anywhere.
    for (uint8_t i = 0; i < NUM_JOINTS; i++) target[i] = (int)lroundf(current[i]);
    frozen = true;
    Serial.println("ERR,TIMEOUT");
  }

  // ── smooth, non-blocking motion ──────────────────────────────────────────
  static unsigned long last = 0;
  if (attached && millis() - last >= 20) {
    last = millis();
    for (uint8_t i = 0; i < NUM_JOINTS; i++) {
      float d = (float)target[i] - current[i];
      if (d > MAX_STEP) d = MAX_STEP;
      if (d < -MAX_STEP) d = -MAX_STEP;
      if (d != 0.0f) {
        current[i] += d;
        servos[i].write((int)lroundf(current[i]));
      }
    }
  }

  // ── periodic state report ────────────────────────────────────────────────
  if (attached && millis() - lastReportAt > REPORT_MS) {
    lastReportAt = millis();
    reportState();
  }
}
