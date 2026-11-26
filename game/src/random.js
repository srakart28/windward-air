// A tiny seeded random number generator (mulberry32): the same seed always grows the same
// villages, clouds and harbour, so a screenshot scene is reproducible frame for frame.

/** Create a generator from a 32-bit seed; call it for floats in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max) from a generator made by createRandom. */
export function range(next, min, max) {
  return min + next() * (max - min);
}

/** Integer in [min, max] from a generator made by createRandom. */
export function intRange(next, min, max) {
  return min + Math.floor(next() * (max - min + 1));
}
