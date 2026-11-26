// Windward Air: Island Circuit — shared constants: timing, physics limits, scoring and palette.
// Everything the other modules agree on lives here so a tune-up touches one file.

/** Fixed simulation step, seconds: the world advances in these and only these. */
export const STEP = 1 / 60;

/** World extent in metres: the sea square the islands sit in, centred on the origin. */
export const WORLD_SIZE = 8400;

/** Gravity, metres per second squared, used for turn rate and sink. */
export const GRAVITY = 9.81;

/** The aircraft, a single-engine bush plane named Kestrel in the game's fiction. */
export const PLANE = {
  /** Full-throttle acceleration at sea level, metres per second squared. */
  thrust: 7.6,
  /** Quadratic drag coefficient; top speed in level flight is sqrt(thrust / drag). */
  drag: 0.0011,
  /** Extra drag multiplier with flaps down. */
  flapDrag: 1.7,
  /** Stall speed, metres per second, flaps up and flaps down. */
  stallClean: 27,
  stallFlaps: 21.5,
  /** Speed at which the nose may come up on the take-off roll. */
  rotateSpeed: 30,
  /** Most bank the controls can ask for, radians. */
  maxBank: 0.96,
  /** Most pitch the controls can ask for, radians, nose up or down. */
  maxPitch: 0.42,
  /** How fast roll and pitch answer the controls, per second. */
  rollRate: 2.4,
  pitchRate: 2.0,
  /** Fuel tank, abstract units; the burn in flight.js empties it in about seven minutes of cruise. */
  fuelStart: 100,
};

/** Scoring: what a sortie is worth, in points. */
export const SCORE = {
  /** Per ring flown through. */
  ring: 250,
  /** Extra for threading a ring near its centre, scaled by closeness. */
  ringCentreBonus: 150,
  /** The most a landing can be worth, before the quality factors scale it. */
  landingMax: 1000,
  /** Points per second under the par time, and the par time itself, seconds. */
  timeBonusPerSecond: 2,
  parSeconds: 330,
  /** Points per unit of fuel left in the tank on a finished sortie. */
  fuelBonusPerUnit: 3,
};

/** Course size: how many rings a sortie flies through. */
export const RING_COUNT = 6;

/** Colours of the world, one late-afternoon style used by terrain, objects and sky alike. */
export const PALETTE = {
  skyTop: '#2b5ea6',
  skyMid: '#7db3dd',
  skyHorizon: '#f7c98b',
  sun: '#fff3c4',
  seaDeep: '#155e75',
  seaShallow: '#3d9db4',
  sand: '#ecd9a0',
  grassLow: '#63a95e',
  grassHigh: '#2e7d46',
  rock: '#8d8175',
  volcanoRock: '#6e5a4e',
  lava: '#ff7a26',
  cloud: '#ffffff',
  runway: '#4a4a4f',
  runwayMark: '#f5f2e8',
};

/** localStorage key for the best score. */
export const BEST_KEY = 'windward-air-best';
