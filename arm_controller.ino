/*
  Robot arm controller (Arduino Uno) - receives angle commands from the web app.

  Protocol (115200 baud, one line per command):
    A,<base>,<shoulder>,<elbow>,<wrist>,<gripper>\n      e.g.  A,90,100,80,90,60

  The Uno prints "READY" after it boots so the web app knows when to start.
  Servos are only attached when the first command arrives, so they stay
  relaxed (no jitter) until you connect from the app.

  POWER: run the servos from a separate 5-6 V supply (several amps) and join its
  GND to the Arduino GND. Do NOT power them from the Arduino 5V pin.
*/

#include <Servo.h>

const uint8_t NUM_JOINTS = 5;

// ---- EDIT THESE TO MATCH YOUR WIRING -------------------------------------
//                                   base shoulder elbow wrist gripper
const uint8_t PINS[NUM_JOINTS]   = {   3,     5,      6,    9,     10 };

// Hard limits enforced here too (keep them equal to or wider than the app's).
const int MIN_ANGLE[NUM_JOINTS]  = {   0,    20,     20,    0,     30 };
const int MAX_ANGLE[NUM_JOINTS]  = { 180,   160,    160,  180,    120 };
// ---------------------------------------------------------------------------

// Maximum degrees a servo may move every 20 ms (3 deg = 150 deg/s). Lower = gentler.
const float MAX_STEP = 3.0;

Servo servos[NUM_JOINTS];
float current[NUM_JOINTS];
int   target[NUM_JOINTS];
bool  attached = false;

char buf[48];
uint8_t len = 0;

void applyCommand(const char *s) {
  if (s[0] != 'A' || s[1] != ',') return;
  int v[NUM_JOINTS];
  int n = sscanf(s + 2, "%d,%d,%d,%d,%d", &v[0], &v[1], &v[2], &v[3], &v[4]);
  if (n != NUM_JOINTS) return;

  for (uint8_t i = 0; i < NUM_JOINTS; i++) {
    target[i] = constrain(v[i], MIN_ANGLE[i], MAX_ANGLE[i]);
  }

  if (!attached) {                       // first command: start at the commanded pose
    for (uint8_t i = 0; i < NUM_JOINTS; i++) {
      current[i] = target[i];
      servos[i].write(target[i]);
      servos[i].attach(PINS[i]);
    }
    attached = true;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("READY");
}

void loop() {
  // Read serial lines
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      buf[len] = 0;
      applyCommand(buf);
      len = 0;
    } else if (c != '\r') {
      if (len < sizeof(buf) - 1) buf[len++] = c;
      else len = 0;                      // overflow: drop the line
    }
  }

  // Move every servo smoothly toward its target
  static unsigned long last = 0;
  if (attached && millis() - last >= 20) {
    last = millis();
    for (uint8_t i = 0; i < NUM_JOINTS; i++) {
      float d = target[i] - current[i];
      if (d > MAX_STEP) d = MAX_STEP;
      if (d < -MAX_STEP) d = -MAX_STEP;
      if (d != 0) {
        current[i] += d;
        servos[i].write((int)(current[i] + 0.5));
      }
    }
  }
}
