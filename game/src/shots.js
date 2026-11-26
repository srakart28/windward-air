// The screenshot scenes behind ?shot=start|play|land|end. Each one flies the real flight
// model forward from a fresh sortie under the autopilot, so the frame is what the game
// honestly looks like at that moment — the same seed always stages the same frame.
import { STEP } from './config.js';
import { createFlight, stepFlight } from './flight.js';
import { createAutopilot, autopilotControl } from './autopilot.js';
import { RUNWAYS, runwayPoint } from './terrain.js';

/** How long the play scene flies before its frame: out over the sea, lighthouse ahead. */
const PLAY_SECONDS = 71;
/** The landing scene stops this far from the Ember threshold, on final over the bay. */
const LAND_STOP_DISTANCE = 640;

function flyAutopilot(state, pilot, seconds, stopWhen) {
  let t = 0;
  while (t < seconds) {
    const control = autopilotControl(state, pilot, STEP);
    stepFlight(state, control, STEP);
    t += STEP;
    if (stopWhen && stopWhen(state)) break;
    if (state.status === 'landed' || state.status === 'down' || state.status === 'crashed') break;
  }
  return t;
}

/**
 * Stage the named scene and return {state, screen, time}: the flight state to draw, the
 * overlay to draw over it ('title', 'play' or 'over') and the scene's clock for pulses.
 */
export function stageShot(name) {
  const state = createFlight();
  const pilot = createAutopilot();
  if (name === 'play') {
    const time = flyAutopilot(state, pilot, PLAY_SECONDS, null);
    return { state, screen: 'play', time };
  }
  if (name === 'land') {
    const threshold = runwayPoint(RUNWAYS[1], -RUNWAYS[1].length / 2, 0);
    const time = flyAutopilot(state, pilot, 420, (s) =>
      s.approachPassed && Math.hypot(s.x - threshold.x, s.z - threshold.z) < LAND_STOP_DISTANCE);
    return { state, screen: 'play', time };
  }
  if (name === 'end') {
    const time = flyAutopilot(state, pilot, 420, null);
    return { state, screen: 'over', time };
  }
  // start: the parked Kestrel idling at the Windward threshold, title card over it.
  for (let t = 0; t < 2.5; t += STEP) {
    stepFlight(state, { pitch: 0, roll: 0, throttle: 0, brake: true, flaps: false }, STEP);
  }
  return { state, screen: 'title', time: 2.5 };
}
