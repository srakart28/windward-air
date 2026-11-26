// The screenshot pilot: a simple control law that flies the real flight model through the
// whole sortie — take-off roll, pure pursuit of each ring, a glide down the approach gate and
// a flare onto the Ember Bay threshold — so the staged scenes are honest frames of the game,
// produced by the same code a player's hands drive. Also handy as the title screen's demo.
import { PLANE } from './config.js';
import { currentTarget, headingDelta } from './flight.js';
import { RUNWAYS, heightAt, runwayLocal, runwayPoint } from './terrain.js';

const HOME = RUNWAYS[1];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Pilot memory carried between steps: the throttle setting it has wound to. */
export function createAutopilot() {
  return { throttle: 0 };
}

/** One step of control for the given flight state; same shape the keyboard produces. */
export function autopilotControl(state, pilot, dt) {
  const control = { pitch: 0, roll: 0, throttle: pilot.throttle, brake: false, flaps: false };

  if (state.onGround) {
    if (state.touchdown) {
      pilot.throttle = 0;
      control.throttle = 0;
      control.brake = true;
      return control;
    }
    // Take-off roll: full power, sit still until rotate speed, then lift the nose.
    pilot.throttle = 1;
    control.throttle = 1;
    control.pitch = state.speed >= PLANE.rotateSpeed - 1 ? 0.6 : 0;
    return control;
  }

  const target = currentTarget(state);
  // On final, aim through the threshold to a roll-out point so the nose stays on the centreline.
  let aimX = target.x;
  let aimZ = target.z;
  let aimY = target.y;
  if (target.kind === 'threshold') {
    const rollOut = runwayPoint(HOME, 190, 0);
    aimX = rollOut.x;
    aimZ = rollOut.z;
    aimY = HOME.plateau;
  }
  const dx = aimX - state.x;
  const dz = aimZ - state.z;
  const distH = Math.hypot(dx, dz);

  // Steering: bank toward the bearing of the aim point. On final, fly the runway's
  // centreline instead: an intercept heading that eats the cross-track error early.
  let desiredHeading = Math.atan2(dx, -dz);
  if (target.kind === 'threshold') {
    const local = runwayLocal(HOME, state.x, state.z);
    const runwayHeading = (HOME.headingDeg * Math.PI) / 180;
    desiredHeading = runwayHeading - Math.atan2(local.cross, 500);
  }
  const error = headingDelta(state.heading, desiredHeading);
  const desiredRoll = clamp(error * 1.5, -0.8, 0.8);
  control.roll = clamp(desiredRoll / PLANE.maxBank, -1, 1);

  // Speed schedule: cruise between rings, slow for the gate, slower still on final.
  let targetSpeed = 54;
  if (target.kind === 'gate') targetSpeed = 44;
  if (target.kind === 'threshold') targetSpeed = 31;
  control.flaps = target.kind === 'threshold' || (target.kind === 'gate' && distH < 1000);

  // Height: chase the aim height; on final, fly a shallow glide to the threshold instead.
  // Whatever the aim, stay a safe margin over the ground here and a few seconds ahead.
  // The glide runs on distance-to-threshold along the strip, so it keeps coming down
  // over the runway instead of floating off the far end.
  let desiredY = aimY;
  let distThreshold = Infinity;
  if (target.kind === 'threshold') {
    const local = runwayLocal(HOME, state.x, state.z);
    distThreshold = -(local.along + HOME.length / 2);
    desiredY = HOME.plateau + Math.max(0, distThreshold) * 0.085;
  }
  if (target.kind !== 'threshold') {
    const aheadX = state.x + Math.sin(state.heading) * 260;
    const aheadZ = state.z - Math.cos(state.heading) * 260;
    const floor = Math.max(heightAt(state.x, state.z), heightAt(aheadX, aheadZ)) + 58;
    desiredY = Math.max(desiredY, floor);
  }
  let desiredVy = clamp((desiredY - state.y) * 0.45, -11, 8);
  if (target.kind === 'threshold') {
    desiredVy = Math.max(desiredVy, distThreshold < 130 ? -2.0 : -4.6);
  }
  control.pitch = clamp((desiredVy - state.vy) * 0.16, -1, 1);

  // Throttle: ease toward whatever holds the scheduled speed.
  pilot.throttle = clamp(pilot.throttle + clamp((targetSpeed - state.speed) * 0.06, -1, 1) * dt * 1.6, 0, 1);
  control.throttle = pilot.throttle;
  return control;
}
