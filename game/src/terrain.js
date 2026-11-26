// The world of Windward Air: two named islands, a lighthouse islet and two bare islets in one
// warm sea. Height is an analytic function (smooth island domes, one volcano cone, runway
// plateaus blended in), so the renderer, the flight model and the minimap all read the same
// ground from heightAt and can never disagree about where the land is.
import { createRandom, range } from './random.js';

/** Island domes: centre, radius and peak height in metres. Profile crosses sea level at the shore. */
const ISLANDS = [
  { name: 'Windward Isle', x: -2300, z: -1900, radius: 1400, peak: 150 },
  { name: 'Ember Isle', x: 2100, z: 1600, radius: 1750, peak: 300 },
  { name: 'Beacon Rock', x: -150, z: 300, radius: 280, peak: 30 },
  { name: 'Gull Islet', x: 950, z: -500, radius: 340, peak: 36 },
  { name: 'South Islet', x: -700, z: 2500, radius: 420, peak: 48 },
];

/** The volcano on Ember Isle: a cone with a dipped crater, standing on the island's dome. */
const VOLCANO = { x: 2400, z: 1400, radius: 800, height: 720, craterRadius: 115, craterDip: 62 };

/** Where the crater's glowing floor sits, for the renderer and the smoke column. */
export const CRATER = { x: VOLCANO.x, z: VOLCANO.z, y: VOLCANO.height - VOLCANO.craterDip + 6 };

/** One island's height at a point: a smooth dome that slips below the sea at its rim. */
function domeHeight(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= island.radius) return -Infinity;
  const s = 1 - (d / island.radius) * (d / island.radius);
  return island.peak * s * s - 10 * (1 - s * s);
}

/** The volcano cone's height at a point, crater included; -Infinity outside its base. */
function volcanoHeight(x, z) {
  const dx = x - VOLCANO.x;
  const dz = z - VOLCANO.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= VOLCANO.radius) return -Infinity;
  let h = VOLCANO.height * (1 - d / VOLCANO.radius) - 10 * (d / VOLCANO.radius);
  if (d < VOLCANO.craterRadius) h -= (VOLCANO.craterRadius - d) * (VOLCANO.craterDip / VOLCANO.craterRadius);
  return h;
}

/**
 * The two airstrips. Heading is the direction of travel on take-off and landing, in degrees
 * (0 north, 90 east). The plateau is the flattened height the strip sits at.
 */
export const RUNWAYS = [
  { id: 'windward', name: 'Windward Field', cx: -1500, cz: -1900, headingDeg: 90, length: 720, width: 34, plateau: 14 },
  { id: 'ember', name: 'Ember Bay Strip', cx: 1250, cz: 2350, headingDeg: 90, length: 760, width: 34, plateau: 16 },
];

/** Unit vectors of a runway: u along the heading, r to the pilot's right when facing along it. */
export function runwayFrame(runway) {
  const h = (runway.headingDeg * Math.PI) / 180;
  const ux = Math.sin(h);
  const uz = -Math.cos(h);
  return { ux, uz, rx: -uz, rz: ux };
}

/** A point in a runway's own frame: along from the centre (threshold at -length/2), cross from the centreline. */
export function runwayLocal(runway, x, z) {
  const { ux, uz, rx, rz } = runwayFrame(runway);
  const dx = x - runway.cx;
  const dz = z - runway.cz;
  return { along: dx * ux + dz * uz, cross: dx * rx + dz * rz };
}

/** The world position of a point given in a runway's frame. */
export function runwayPoint(runway, along, cross) {
  const { ux, uz, rx, rz } = runwayFrame(runway);
  return { x: runway.cx + ux * along + rx * cross, z: runway.cz + uz * along + rz * cross };
}

/** 0 outside the blend, 1 on the strip: how strongly a runway flattens the ground at a point. */
function runwayBlend(runway, x, z) {
  const { along, cross } = runwayLocal(runway, x, z);
  const edgeAlong = runway.length / 2 + 60;
  const edgeCross = runway.width / 2 + 30;
  const blendAlong = 210;
  const blendCross = 170;
  const ax = Math.abs(along);
  const az = Math.abs(cross);
  if (ax > edgeAlong + blendAlong || az > edgeCross + blendCross) return 0;
  const sx = 1 - smoothstep(edgeAlong, edgeAlong + blendAlong, ax);
  const sz = 1 - smoothstep(edgeCross, edgeCross + blendCross, az);
  return sx * sz;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Ground height in metres at a world point; negative under the sea. Every system reads this. */
export function heightAt(x, z) {
  let h = -10;
  for (const island of ISLANDS) h = Math.max(h, domeHeight(island, x, z));
  h = Math.max(h, volcanoHeight(x, z));
  for (const runway of RUNWAYS) {
    const w = runwayBlend(runway, x, z);
    if (w > 0) h = h * (1 - w) + runway.plateau * w;
  }
  return h;
}

/** Ground slope at a point, as rise over run, from finite differences of heightAt. */
export function slopeAt(x, z) {
  const e = 6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.sqrt(dx * dx + dz * dz) / (2 * e);
}

/**
 * The ring course, in the order flown: off Windward's east coast, a sweep south past the
 * lighthouse, then north-east to Ember Isle, up its volcano shoulder and down to the bay.
 * y is the ring centre's height above the sea; radius is the hole the plane must thread.
 */
export const RINGS = [
  { x: -500, z: -1900, y: 95, radius: 55 },
  { x: 250, z: -1450, y: 150, radius: 55 },
  { x: -420, z: 60, y: 105, radius: 55 },
  { x: 750, z: 900, y: 150, radius: 55 },
  { x: 1450, z: 1250, y: 255, radius: 58 },
  { x: 700, z: 2150, y: 135, radius: 55 },
];

/** The lighthouse on Beacon Rock: base point and tower height, drawn by the renderer. */
export const LIGHTHOUSE = { x: -150, z: 300, height: 36 };

/** Seeded decoration, fixed for every run: houses, trees, clouds and moored sailboats. */
function buildDecor() {
  const next = createRandom(20261126);
  const houses = [];
  const villages = [
    { x: -2050, z: -1080, count: 11 },
    { x: 1560, z: 2720, count: 9 },
    { x: -1980, z: -2350, count: 6 },
  ];
  const wallColours = ['#f3e2c7', '#e8b4a0', '#f7f3e8', '#d9e6f2', '#f2d38a'];
  const roofColours = ['#b6502f', '#7a4a8f', '#3f6d8e', '#8f3b34', '#546e7a'];
  for (const village of villages) {
    for (let i = 0; i < village.count; i += 1) {
      const x = village.x + range(next, -170, 170);
      const z = village.z + range(next, -130, 130);
      const y = heightAt(x, z);
      if (y < 3 || y > 120) continue;
      houses.push({
        x, z, y,
        rot: next() * Math.PI,
        w: range(next, 9, 15),
        d: range(next, 8, 13),
        h: range(next, 4.5, 7),
        wall: wallColours[Math.floor(next() * wallColours.length)],
        roof: roofColours[Math.floor(next() * roofColours.length)],
      });
    }
  }
  const trees = [];
  for (let i = 0; i < 260 && trees.length < 110; i += 1) {
    const x = range(next, -3900, 3900);
    const z = range(next, -3900, 3900);
    const y = heightAt(x, z);
    if (y < 4 || y > 175 || slopeAt(x, z) > 0.55) continue;
    let onStrip = false;
    for (const runway of RUNWAYS) {
      const local = runwayLocal(runway, x, z);
      if (Math.abs(local.along) < runway.length / 2 + 90 && Math.abs(local.cross) < 90) onStrip = true;
    }
    if (onStrip) continue;
    trees.push({ x, z, y, s: range(next, 0.75, 1.5) });
  }
  const clouds = [];
  for (let i = 0; i < 44; i += 1) {
    clouds.push({
      x: range(next, -4300, 4300),
      z: range(next, -4300, 4300),
      y: range(next, 500, 840),
      r: range(next, 70, 175),
      puffs: 4 + Math.floor(next() * 4),
      seed: next() * 1000,
    });
  }
  const boats = [];
  for (const spot of [{ x: -1450, z: -980 }, { x: -1330, z: -880 }, { x: 700, z: 2680 }]) {
    boats.push({ x: spot.x, z: spot.z, rot: next() * Math.PI * 2, sail: wallColours[Math.floor(next() * wallColours.length)] });
  }
  return { houses, trees, clouds, boats };
}

const DECOR = buildDecor();

/** Village houses: {x, z, y (ground), rot, w, d, h, wall, roof}. */
export const HOUSES = DECOR.houses;
/** Scrub pines on the island slopes: {x, z, y (ground), s (scale)}. */
export const TREES = DECOR.trees;
/** Fair-weather cumulus: {x, z, y, r, puffs, seed}. */
export const CLOUDS = DECOR.clouds;
/** Moored sailboats in the two harbours: {x, z, rot, sail}. */
export const BOATS = DECOR.boats;
