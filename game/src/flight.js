// The Kestrel's flight model and the sortie's scoring: an arcade model with real discipline —
// throttle, bank and pitch trade against drag, gravity and the stall — plus take-off and
// touchdown judgement, ring detection and the points a finished sortie is made of.
// Pure simulation: no DOM, no rendering, so the screenshot autopilot flies the very same code.
import { GRAVITY, PLANE, RING_COUNT, SCORE } from './config.js';
import { RINGS, RUNWAYS, heightAt, runwayLocal, runwayPoint, slopeAt } from './terrain.js';

/** The last course gate before the destination threshold: the final approach fix. */
export const APPROACH_GATE = { x: -100, z: 2350, y: 85 };

/** Event names stepFlight can return, so the shell can play sounds and show messages. */
export const EVENT_TAKEOFF = 1;
export const EVENT_RING = 2;
export const EVENT_RING_MISSED = 4;
export const EVENT_TOUCHDOWN = 8;
export const EVENT_FINISHED = 16;
export const EVENT_CRASHED = 32;

const START_RUNWAY = RUNWAYS[0];
const HOME_RUNWAY = RUNWAYS[1];

/** A fresh sortie: parked at the Windward threshold, engine idling, full tank. */
export function createFlight() {
  const start = runwayPoint(START_RUNWAY, -START_RUNWAY.length / 2 + 55, 0);
  return {
    x: start.x,
    y: heightAt(start.x, start.z),
    z: start.z,
    heading: (START_RUNWAY.headingDeg * Math.PI) / 180,
    pitch: 0,
    roll: 0,
    speed: 0,
    vy: 0,
    throttle: 0,
    flaps: false,
    onGround: true,
    started: false,
    status: 'ready', // ready | flying | landed | down | crashed
    endReason: '',
    time: 0,
    fuel: PLANE.fuelStart,
    damage: 0,
    nextRing: 0,
    approachPassed: false,
    ringResults: new Array(RING_COUNT).fill(null),
    prevRingSigned: null,
    landingScored: false,
    touchdown: null, // {sink, cross, speedKt, runwayName} of the scored touchdown
    score: { ringPoints: 0, landingPoints: 0, timeBonus: 0, fuelBonus: 0, total: 0 },
    propPhase: 0,
    stalled: false,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Signed smallest difference between two headings, in (-PI, PI]. */
export function headingDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The runway a point is over, with its local frame, or null. Margin forgiving on both axes. */
function stripAt(x, z) {
  for (const runway of RUNWAYS) {
    const local = runwayLocal(runway, x, z);
    if (Math.abs(local.along) <= runway.length / 2 + 12 && Math.abs(local.cross) <= runway.width / 2 + 7) {
      return { runway, along: local.along, cross: local.cross };
    }
  }
  return null;
}

/** Total the score and close the sortie when it ends, however it ends. */
function finish(state, status, reason) {
  state.status = status;
  state.endReason = reason;
  if (status === 'landed') {
    state.score.timeBonus = Math.max(0, Math.floor(SCORE.parSeconds - state.time)) * SCORE.timeBonusPerSecond;
    state.score.fuelBonus = Math.round(state.fuel) * SCORE.fuelBonusPerUnit;
  }
  state.score.total =
    state.score.ringPoints + state.score.landingPoints + state.score.timeBonus + state.score.fuelBonus;
  return EVENT_FINISHED;
}

/** Judge a touchdown the moment the wheels meet the ground; returns event flags. */
function touchDown(state, groundY) {
  const sink = state.vy;
  const strip = stripAt(state.x, state.z);
  state.y = groundY;
  if (groundY < 0.4) {
    if (sink >= -2.2 && state.speed <= 32) {
      state.onGround = true;
      return finish(state, 'down', 'Ditched in the shallows — wet, but walking away.');
    }
    state.damage = 100;
    return finish(state, 'crashed', 'Went into the sea.') | EVENT_CRASHED;
  }
  if (strip) {
    const runwayHeading = (strip.runway.headingDeg * Math.PI) / 180;
    const diff = Math.abs(headingDelta(state.heading, runwayHeading));
    const align = Math.min(diff, Math.PI - diff);
    if (align < 0.45 && sink >= -6.5 && state.speed <= 64) {
      state.onGround = true;
      state.damage = clamp(state.damage + Math.max(0, -sink - 3.2) * 5, 0, 100);
      if (!state.landingScored) {
        state.landingScored = true;
        const sinkQuality = 1 - clamp(-sink / 6.5, 0, 1);
        const centreQuality = 1 - clamp(Math.abs(strip.cross) / (strip.runway.width / 2 + 7), 0, 1);
        const alignQuality = 1 - clamp(align / 0.45, 0, 1);
        const speedQuality = 1 - clamp(Math.abs(state.speed - 31) / 26, 0, 1);
        state.score.landingPoints = Math.round(
          SCORE.landingMax * (0.4 * sinkQuality + 0.25 * centreQuality + 0.2 * alignQuality + 0.15 * speedQuality),
        );
        state.touchdown = {
          sink,
          cross: strip.cross,
          speedKt: state.speed * 1.944,
          runwayName: strip.runway.name,
          home: strip.runway === HOME_RUNWAY,
        };
      }
      return EVENT_TOUCHDOWN;
    }
  }
  if (sink >= -4.2 && state.speed <= 46 && slopeAt(state.x, state.z) < 0.5) {
    state.onGround = true;
    state.damage = clamp(state.damage + 30, 0, 100);
    if (!state.landingScored) {
      state.landingScored = true;
      state.score.landingPoints = 150;
      state.touchdown = { sink, cross: 0, speedKt: state.speed * 1.944, runwayName: 'an open field', home: false };
    }
    return EVENT_TOUCHDOWN;
  }
  state.damage = 100;
  const reason =
    sink < -8 ? 'Came down far too hard — the airframe gave out.'
    : state.speed > 60 ? 'Hit the ground much too fast.'
    : 'Flew into the ground.';
  return finish(state, 'crashed', reason) | EVENT_CRASHED;
}

/** Ring bookkeeping: crossing the ring's plane near its centre scores; passing it by misses. */
function checkRing(state) {
  if (state.nextRing >= RING_COUNT) return 0;
  const index = state.nextRing;
  const ring = RINGS[index];
  const prev = index === 0 ? { x: state.startX ?? -1805, z: -1900, y: 60 } : RINGS[index - 1];
  const next = index === RING_COUNT - 1 ? APPROACH_GATE : RINGS[index + 1];
  let nx = next.x - prev.x;
  let ny = next.y - prev.y;
  let nz = next.z - prev.z;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const signed = (state.x - ring.x) * nx + (state.y - ring.y) * ny + (state.z - ring.z) * nz;
  let events = 0;
  if (state.prevRingSigned !== null && state.prevRingSigned < 0 && signed >= 0) {
    const lx = state.x - ring.x - nx * signed;
    const ly = state.y - ring.y - ny * signed;
    const lz = state.z - ring.z - nz * signed;
    const lateral = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (lateral <= ring.radius) {
      state.ringResults[index] = 'hit';
      state.score.ringPoints += SCORE.ring + Math.round(SCORE.ringCentreBonus * (1 - lateral / ring.radius));
      state.lastRingLateral = lateral;
      events |= EVENT_RING;
      state.nextRing += 1;
      state.prevRingSigned = null;
      return events;
    }
  }
  if (signed > 150) {
    state.ringResults[index] = 'missed';
    events |= EVENT_RING_MISSED;
    state.nextRing += 1;
    state.prevRingSigned = null;
    return events;
  }
  state.prevRingSigned = signed;
  return events;
}

/**
 * Advance the sortie one step. control: {pitch -1..1 (up is nose up), roll -1..1 (right is
 * bank right), throttle 0..1, brake boolean, flaps boolean}. Returns event flags.
 */
export function stepFlight(state, control, dt) {
  if (state.status === 'landed' || state.status === 'down' || state.status === 'crashed') return 0;
  let events = 0;
  state.throttle = clamp(control.throttle, 0, 1);
  state.flaps = Boolean(control.flaps);
  if (state.startX === undefined) state.startX = state.x;
  if (state.started) state.time += dt;
  state.propPhase += dt * (2 + state.throttle * 38 + state.speed * 0.12);

  const groundY = heightAt(state.x, state.z);

  if (state.onGround) {
    state.y = groundY;
    state.pitch *= Math.max(0, 1 - 6 * dt);
    state.roll *= Math.max(0, 1 - 6 * dt);
    state.vy = 0;
    const strip = stripAt(state.x, state.z);
    let accel = state.throttle * PLANE.thrust - 0.32 - PLANE.drag * state.speed * state.speed;
    if (!strip && groundY > 0.4) accel -= 1.9; // rough grass drags
    if (control.brake) accel -= 5.6;
    state.speed = Math.max(0, state.speed + accel * dt);
    if (state.speed > 1.5 && !state.started) {
      state.started = true;
      state.status = 'flying';
    }
    if (state.speed > 0.4) {
      state.heading += control.roll * dt * clamp(state.speed / 30, 0, 1) * 0.5;
      state.x += Math.sin(state.heading) * state.speed * dt;
      state.z += -Math.cos(state.heading) * state.speed * dt;
      state.y = heightAt(state.x, state.z);
    }
    if (state.speed >= PLANE.rotateSpeed && control.pitch > 0.25 && groundY > 0.4) {
      state.onGround = false;
      state.pitch = 0.15;
      events |= EVENT_TAKEOFF;
    } else if (state.touchdown && state.speed < 0.4) {
      // A scored touchdown that has rolled to a stop ends the sortie.
      if (state.touchdown.home) events |= finish(state, 'landed', 'Down at Ember Bay Strip. The circuit is complete.');
      else events |= finish(state, 'down', `Put down at ${state.touchdown.runwayName} — the circuit unfinished.`);
    } else if (state.status === 'flying' && state.started && state.speed < 0.4 && state.throttle <= 0.02 && !state.touchdown) {
      events |= finish(state, 'down', 'Stopped on the ground, short of the destination.');
    }
    return events;
  }

  // Airborne.
  const stallSpeed = state.flaps ? PLANE.stallFlaps : PLANE.stallClean;
  const lift = clamp((state.speed - stallSpeed * 0.5) / (stallSpeed * 0.6), 0, 1);
  state.stalled = lift < 0.62 && state.y > groundY + 2;

  const targetRoll = control.roll * PLANE.maxBank;
  state.roll += clamp(targetRoll - state.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  state.heading += (GRAVITY * Math.tan(state.roll) / Math.max(state.speed, 16)) * dt;

  let targetPitch = control.pitch * PLANE.maxPitch * (0.3 + 0.7 * lift);
  if (lift < 0.55) targetPitch -= (0.55 - lift) * 0.55;
  state.pitch += clamp(targetPitch - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

  const dragNow = PLANE.drag * state.speed * state.speed * (state.flaps ? PLANE.flapDrag : 1);
  const accel = state.throttle * PLANE.thrust - dragNow - GRAVITY * Math.sin(state.pitch) * 0.9;
  state.speed = Math.max(0, state.speed + accel * dt);

  state.vy = Math.sin(state.pitch) * state.speed * (0.3 + 0.7 * lift) - (1 - lift) * (1 - lift) * 9;
  state.vy = clamp(state.vy, -38, 30);

  const cosPitch = Math.cos(state.pitch);
  state.x += Math.sin(state.heading) * cosPitch * state.speed * dt;
  state.z += -Math.cos(state.heading) * cosPitch * state.speed * dt;
  state.y += state.vy * dt;
  state.x = clamp(state.x, -4150, 4150);
  state.z = clamp(state.z, -4150, 4150);
  state.y = Math.min(state.y, 1500);
  state.fuel = Math.max(0, state.fuel - dt * (0.1 + 0.3 * state.throttle));
  if (state.fuel <= 0) state.throttle = 0;

  events |= checkRing(state);

  // The approach gate latches: once through it the sortie is on final, whatever the drift.
  if (!state.approachPassed && state.nextRing >= RING_COUNT) {
    const gateDistance = Math.hypot(state.x - APPROACH_GATE.x, state.z - APPROACH_GATE.z);
    if (gateDistance < 170) state.approachPassed = true;
  }

  const newGroundY = heightAt(state.x, state.z);
  if (state.y <= newGroundY) events |= touchDown(state, newGroundY);
  return events;
}

/** The waypoint the sortie is flying to now: the next ring, the approach gate, or the threshold. */
export function currentTarget(state) {
  if (state.nextRing < RING_COUNT) {
    const ring = RINGS[state.nextRing];
    return { x: ring.x, y: ring.y, z: ring.z, kind: 'ring', index: state.nextRing };
  }
  if (!state.approachPassed) return { x: APPROACH_GATE.x, y: APPROACH_GATE.y, z: APPROACH_GATE.z, kind: 'gate', index: -1 };
  const threshold = runwayPoint(HOME_RUNWAY, -HOME_RUNWAY.length / 2, 0);
  return { x: threshold.x, y: HOME_RUNWAY.plateau, z: threshold.z, kind: 'threshold', index: -1 };
}
