// The 3D renderer: a hand-rolled perspective projector on a 2D canvas. The terrain is a
// flat-shaded heightfield mesh in one warm low-poly style; the airstrips, rings, lighthouse,
// villages, trees and boats are world-space polygons; and the Kestrel itself is a small
// polygon model flown in chase view. Everything is depth-sorted and painted far to near.
import { PALETTE } from './config.js';
import { createRandom } from './random.js';
import {
  BOATS, CLOUDS, CRATER, HOUSES, LIGHTHOUSE, RINGS, RUNWAYS, TREES,
  heightAt, runwayPoint,
} from './terrain.js';
import { APPROACH_GATE } from './flight.js';

/** Direction toward the sun (unit, world space): high in the north-west. */
const SUN = normalize3([-0.48, 0.74, -0.42]);
/** Vertical field of view, radians. */
const FOV = (62 * Math.PI) / 180;
/** Terrain mesh: cell size and half-extent in metres; colours are baked once at load. */
const CELL = 120;
const HALF = 4200;
const GRID = Math.round((HALF * 2) / CELL); // cells per side
/** How far terrain is drawn, and where the fog completes, in metres from the camera. */
const VIEW_FAR = 3800;
const FOG_START = 1500;
const FOG_END = 3700;
const FOG_RGB = [247, 201, 139];

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbString(rgb) {
  return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
}

/** The ground's colour at a height and slope, before sun shading: the game's one style. */
function groundColour(h, slope, x, z) {
  const deep = hexRgb(PALETTE.seaDeep);
  const shallow = hexRgb(PALETTE.seaShallow);
  if (h < 0.2) {
    const t = Math.min(1, Math.max(0, (h + 9) / 9));
    return mixRgb(deep, shallow, t * t);
  }
  const sand = hexRgb(PALETTE.sand);
  if (h < 2.4) return sand;
  let colour = mixRgb(hexRgb(PALETTE.grassLow), hexRgb(PALETTE.grassHigh), Math.min(1, (h - 2.4) / 90));
  if (h > 95) colour = mixRgb(colour, hexRgb(PALETTE.rock), Math.min(1, (h - 95) / 110));
  if (slope > 0.42) colour = mixRgb(colour, hexRgb(PALETTE.rock), Math.min(0.85, (slope - 0.42) * 1.6));
  const volcanoDist = Math.hypot(x - CRATER.x, z - CRATER.z);
  if (volcanoDist < 950) colour = mixRgb(colour, hexRgb(PALETTE.volcanoRock), (1 - volcanoDist / 950) * 0.75);
  return colour;
}

/** Bake the terrain mesh: corner heights and one flat colour per quad. */
function buildTerrain() {
  const vertsPerSide = GRID + 1;
  const heights = new Float32Array(vertsPerSide * vertsPerSide);
  for (let iz = 0; iz < vertsPerSide; iz += 1) {
    for (let ix = 0; ix < vertsPerSide; ix += 1) {
      heights[iz * vertsPerSide + ix] = heightAt(-HALF + ix * CELL, -HALF + iz * CELL);
    }
  }
  const quads = [];
  for (let iz = 0; iz < GRID; iz += 1) {
    for (let ix = 0; ix < GRID; ix += 1) {
      const cx = -HALF + (ix + 0.5) * CELL;
      const cz = -HALF + (iz + 0.5) * CELL;
      const h = heightAt(cx, cz);
      const e = CELL * 0.75;
      const nx = heightAt(cx - e, cz) - heightAt(cx + e, cz);
      const nz = heightAt(cx, cz - e) - heightAt(cx, cz + e);
      const normal = normalize3([nx / (2 * e), 1, nz / (2 * e)]);
      const slope = Math.sqrt(nx * nx + nz * nz) / (2 * e);
      const lit = 0.68 + 0.32 * Math.max(0, normal[0] * SUN[0] + normal[1] * SUN[1] + normal[2] * SUN[2]);
      const jitter = 0.96 + ((ix * 73856093) ^ (iz * 19349663)) % 7 * 0.011;
      const base = groundColour(h, slope, cx, cz);
      quads.push({
        ix, iz, cx, cz,
        r: base[0] * lit * jitter, g: base[1] * lit * jitter, b: base[2] * lit * jitter,
      });
    }
  }
  return { heights, quads, vertsPerSide };
}

/** The Kestrel in local space (x right, y up, z toward the tail): faces as [verts, colour]. */
function buildPlaneModel() {
  const white = '#f4f1e8';
  const accent = '#e8641e';
  const dark = '#2c313a';
  const glass = '#274b63';
  const faces = [];
  const box = (cx, cy, cz, sx, sy, sz, colour) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    faces.push([[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], colour]); // nose-facing
    faces.push([[[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], colour]); // tail-facing
    faces.push([[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], colour]); // top
    faces.push([[[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], colour]); // bottom
    faces.push([[[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], colour]); // right
    faces.push([[[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], colour]); // left
  };
  box(0, 0.1, 0.1, 1.06, 1.06, 6.4, white); // fuselage
  box(0, 0.28, -3.35, 0.92, 0.8, 0.5, accent); // engine cowling
  box(0, 0.62, -0.7, 0.94, 0.5, 1.7, glass); // canopy
  box(0, 0.78, 0.15, 11.2, 0.14, 1.5, accent); // main wing, high on the fuselage
  box(-5.35, 0.78, 0.15, 0.5, 0.16, 1.5, dark); // wing tips
  box(5.35, 0.78, 0.15, 0.5, 0.16, 1.5, dark);
  box(0, 0.32, 3.15, 3.1, 0.12, 1.0, accent); // tailplane
  faces.push([[[0, 0.2, 2.95], [0, 1.55, 3.45], [0, 1.5, 3.95], [0, 0.35, 3.8]], accent]); // fin (right side)
  faces.push([[[0, 1.5, 3.95], [0, 1.55, 3.45], [0, 0.2, 2.95], [0, 0.35, 3.8]], accent]); // fin (left side)
  box(-0.62, -0.72, -1.15, 0.3, 0.52, 0.52, dark); // wheels
  box(0.62, -0.72, -1.15, 0.3, 0.52, 0.52, dark);
  box(0, -0.42, 3.35, 0.2, 0.3, 0.3, dark); // tail wheel
  box(-0.55, -0.28, -1.15, 0.09, 0.55, 0.09, dark); // gear legs
  box(0.55, -0.28, -1.15, 0.09, 0.55, 0.09, dark);
  box(-2.6, 0.28, 0.35, 0.08, 1.05, 0.08, dark); // wing struts
  box(2.6, 0.28, 0.35, 0.08, 1.05, 0.08, dark);
  return faces;
}

/** Ring orientation bases, following the course from waypoint to waypoint. */
function ringBasis(index) {
  const prev = index === 0 ? { x: -1805, z: -1900, y: 60 } : RINGS[index - 1];
  const next = index === RINGS.length - 1 ? APPROACH_GATE : RINGS[index + 1];
  const ring = RINGS[index];
  const n = normalize3([next.x - prev.x, next.y - prev.y, next.z - prev.z]);
  let u = [n[2], 0, -n[0]];
  const ul = Math.hypot(u[0], u[2]);
  if (ul < 0.01) u = [1, 0, 0];
  else u = [u[0] / ul, 0, u[2] / ul];
  const v = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  return { ring, u, v };
}

/** Create the renderer bound to a canvas. draw(state, opts) paints one frame. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const terrain = buildTerrain();
  const planeModel = buildPlaneModel();
  const cloudPuffs = CLOUDS.map((cloud) => {
    const next = createRandom(Math.floor(cloud.seed * 997) + 7);
    const puffs = [];
    for (let i = 0; i < cloud.puffs; i += 1) {
      puffs.push({
        dx: (next() - 0.5) * 1.7,
        dy: (next() - 0.5) * 0.34,
        r: 0.42 + next() * 0.5,
        shade: 0.9 + next() * 0.1,
      });
    }
    return puffs;
  });

  let width = 0;
  let height = 0;
  let focal = 1;
  let camPos = null;
  let camLook = null;
  let basis = null; // {f, r, u} of the last frame, for project()
  let origin = null;

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(240, Math.floor(canvas.clientHeight * dpr));
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w;
      canvas.height = h;
    }
    width = w;
    height = h;
    focal = height / 2 / Math.tan(FOV / 2);
  }

  /** World point to screen, using the last frame's camera; null when behind the near plane. */
  function project(p) {
    if (!basis || !origin) return null;
    const dx = p.x - origin[0];
    const dy = p.y - origin[1];
    const dz = p.z - origin[2];
    const vz = dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2];
    if (vz < 2.5) return null;
    const vx = dx * basis.r[0] + dy * basis.r[1] + dz * basis.r[2];
    const vy = dx * basis.u[0] + dy * basis.u[1] + dz * basis.u[2];
    return { x: width / 2 + (vx / vz) * focal, y: height / 2 - (vy / vz) * focal, depth: vz };
  }

  /** Clip a view-space polygon against the near plane; returns view verts or null. */
  function clipView(viewVerts) {
    const clipped = [];
    for (let i = 0; i < viewVerts.length; i += 1) {
      const a = viewVerts[i];
      const b = viewVerts[(i + 1) % viewVerts.length];
      if (a[2] >= 2.5) clipped.push(a);
      if ((a[2] >= 2.5) !== (b[2] >= 2.5)) {
        const t = (2.5 - a[2]) / (b[2] - a[2]);
        clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 2.5]);
      }
    }
    return clipped.length >= 3 ? clipped : null;
  }

  /** Project clipped view-space verts to screen points. */
  function toScreen(viewVerts) {
    return viewVerts.map((v) => [width / 2 + (v[0] / v[2]) * focal, height / 2 - (v[1] / v[2]) * focal]);
  }

  /**
   * The sort depth of a polygon: the average view depth of its CLIPPED verts.
   * Measuring before clipping would let a polygon that straddles the camera
   * (the terrain cell the camera stands in, say) average in its behind-camera
   * corners and sort in front of nearer objects it does not actually cover.
   */
  function clippedDepth(clipped) {
    let depth = 0;
    for (const v of clipped) depth += v[2];
    return depth / clipped.length;
  }

  /** The frame's draw list: {pts, depth, fill} sorted far to near before painting. */
  let solids = [];
  /** The aircraft's own list, painted after the world: the flown plane is the
   * camera's subject and is never legitimately hidden by the ground it flies
   * over, so it wins every overlap the painter's sort would otherwise fumble. */
  let topSolids = [];
  let topMode = false;

  /**
   * Add one world-space polygon. rgb is its base colour; opts: {noFog, noShade, alpha}.
   * Shading uses the polygon's own normal against the sun, so models read as built objects.
   */
  function addPoly(worldVerts, rgb, opts = {}) {
    const view = worldVerts.map((p) => {
      const dx = p[0] - origin[0];
      const dy = p[1] - origin[1];
      const dz = p[2] - origin[2];
      return [
        dx * basis.r[0] + dy * basis.r[1] + dz * basis.r[2],
        dx * basis.u[0] + dy * basis.u[1] + dz * basis.u[2],
        dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2],
      ];
    });
    const clipped = clipView(view);
    if (!clipped) return;
    const depth = clippedDepth(clipped);
    if (depth > VIEW_FAR + 900) return;
    const pts = toScreen(clipped);
    let colour = rgb;
    if (!opts.noShade && worldVerts.length >= 3) {
      const a = worldVerts[0];
      const b = worldVerts[1];
      const c = worldVerts[2];
      const n = normalize3([
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ]);
      const lit = 0.66 + 0.34 * Math.abs(n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
      colour = [colour[0] * lit, colour[1] * lit, colour[2] * lit];
    }
    if (!opts.noFog) {
      const fog = Math.min(1, Math.max(0, (depth - FOG_START) / (FOG_END - FOG_START)));
      if (fog > 0) colour = mixRgb(colour, FOG_RGB, fog * 0.82);
    }
    (topMode ? topSolids : solids).push({ pts, depth, fill: opts.alpha ? `rgba(${colour[0] | 0},${colour[1] | 0},${colour[2] | 0},${opts.alpha})` : rgbString(colour) });
  }

  /** A box between two corners, all six faces, in one base colour. */
  function addBox(cx, cy, cz, sx, sy, sz, rot, rgb) {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const corner = (lx, ly, lz) => [cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos];
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const v = [
      corner(-x, -y, -z), corner(x, -y, -z), corner(x, -y, z), corner(-x, -y, z),
      corner(-x, y, -z), corner(x, y, -z), corner(x, y, z), corner(-x, y, z),
    ];
    addPoly([v[0], v[1], v[2], v[3]], rgb);
    addPoly([v[4], v[7], v[6], v[5]], rgb);
    addPoly([v[0], v[4], v[5], v[1]], rgb);
    addPoly([v[1], v[5], v[6], v[2]], rgb);
    addPoly([v[2], v[6], v[7], v[3]], rgb);
    addPoly([v[3], v[7], v[4], v[0]], rgb);
  }

  /** A tapered cylinder (lighthouse, smoke-free): bands coloured by a callback per height step. */
  function addCylinder(x, z, yBase, rBottom, rTop, cylHeight, segments, colourAt) {
    const steps = 3;
    for (let s = 0; s < steps; s += 1) {
      const y0 = yBase + (cylHeight * s) / steps;
      const y1 = yBase + (cylHeight * (s + 1)) / steps;
      const r0 = rBottom + (rTop - rBottom) * (s / steps);
      const r1 = rBottom + (rTop - rBottom) * ((s + 1) / steps);
      const rgb = colourAt(s);
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        addPoly([
          [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0],
          [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0],
          [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1],
          [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1],
        ], rgb);
      }
    }
  }

  function drawRunways() {
    const asphalt = hexRgb(PALETTE.runway);
    const mark = hexRgb(PALETTE.runwayMark);
    for (const runway of RUNWAYS) {
      const y = runway.plateau + 0.18;
      const cornerAt = (along, cross) => {
        const p = runwayPoint(runway, along, cross);
        return [p.x, y, p.z];
      };
      const L = runway.length / 2;
      const W = runway.width / 2;
      addPoly([cornerAt(-L, -W), cornerAt(L, -W), cornerAt(L, W), cornerAt(-L, W)], asphalt, { noShade: true });
      for (let d = -L + 34; d < L - 20; d += 46) {
        addPoly([cornerAt(d, -0.8), cornerAt(d + 20, -0.8), cornerAt(d + 20, 0.8), cornerAt(d, 0.8)], mark, { noShade: true });
      }
      for (const endSign of [-1, 1]) {
        for (let b = -3; b <= 3; b += 2) {
          addPoly([
            cornerAt(endSign * (L - 16), b * 3.4 - 1.1), cornerAt(endSign * (L - 4), b * 3.4 - 1.1),
            cornerAt(endSign * (L - 4), b * 3.4 + 1.1), cornerAt(endSign * (L - 16), b * 3.4 + 1.1),
          ], mark, { noShade: true });
        }
      }
      // A windsock by each threshold: pole and a small orange cone.
      const sock = runwayPoint(runway, -L + 26, 34);
      const gy = heightAt(sock.x, sock.z);
      addBox(sock.x, gy + 3.4, sock.z, 0.28, 6.8, 0.28, 0, hexRgb('#d8d8d8'));
      addPoly([
        [sock.x, gy + 6.6, sock.z], [sock.x + 3.4, gy + 6.05, sock.z + 0.5], [sock.x, gy + 5.5, sock.z],
      ], hexRgb('#ff8c1a'), { noShade: true });
    }
  }

  function drawRings(state, time) {
    for (let index = 0; index < RINGS.length; index += 1) {
      const { ring, u, v } = ringBasis(index);
      const result = state.ringResults[index];
      const isNext = index === state.nextRing;
      let rgb;
      let alpha = 1;
      if (result === 'hit') rgb = [46, 204, 113];
      else if (result === 'missed') { rgb = [130, 136, 145]; alpha = 0.55; }
      else if (isNext) {
        const pulse = 0.82 + 0.18 * Math.sin(time * 4);
        rgb = [255 * pulse, 176 * pulse, 46 * pulse];
      } else rgb = [214, 238, 255];
      const segments = 20;
      const rOut = ring.radius + 3.6;
      const rIn = ring.radius - 3.6;
      for (let s = 0; s < segments; s += 1) {
        const a0 = (s / segments) * Math.PI * 2;
        const a1 = ((s + 1) / segments) * Math.PI * 2;
        const point = (a, r) => [
          ring.x + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r,
          ring.y + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r,
          ring.z + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r,
        ];
        addPoly([point(a0, rIn), point(a1, rIn), point(a1, rOut), point(a0, rOut)], rgb, { noShade: true, alpha });
      }
      if (isNext) {
        // A faint glass disc in the next ring, so its hole reads from far off.
        const disc = [];
        for (let s = 0; s < segments; s += 1) {
          const a = (s / segments) * Math.PI * 2;
          disc.push([
            ring.x + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * rIn,
            ring.y + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * rIn,
            ring.z + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * rIn,
          ]);
        }
        addPoly(disc, [255, 190, 80], { noShade: true, alpha: 0.13 });
      }
    }
  }

  function drawVillageAndWild(state) {
    const camX = origin[0];
    const camZ = origin[2];
    for (const house of HOUSES) {
      if (Math.hypot(house.x - camX, house.z - camZ) > 2600) continue;
      addBox(house.x, house.y + house.h / 2, house.z, house.w, house.h, house.d, house.rot, hexRgb(house.wall));
      // Pitched roof: two slabs meeting at a ridge along the house's length.
      const cos = Math.cos(house.rot);
      const sin = Math.sin(house.rot);
      const P = (lx, ly, lz) => [house.x + lx * cos + lz * sin, house.y + ly, house.z - lx * sin + lz * cos];
      const roofRgb = hexRgb(house.roof);
      const hw = house.w / 2 + 0.7;
      const hd = house.d / 2 + 0.7;
      const ridge = house.h + 2.6;
      addPoly([P(-hw, house.h, -hd), P(hw, house.h, -hd), P(hw, ridge, 0), P(-hw, ridge, 0)], roofRgb);
      addPoly([P(hw, house.h, hd), P(-hw, house.h, hd), P(-hw, ridge, 0), P(hw, ridge, 0)], roofRgb);
      addPoly([P(-hw, house.h, -hd), P(-hw, ridge, 0), P(-hw, house.h, hd)], roofRgb);
      addPoly([P(hw, house.h, hd), P(hw, ridge, 0), P(hw, house.h, -hd)], roofRgb);
    }
    const trunk = hexRgb('#6b4a2f');
    const pine = hexRgb('#2c6e3e');
    for (const tree of TREES) {
      if (Math.hypot(tree.x - camX, tree.z - camZ) > 2100) continue;
      addBox(tree.x, tree.y + 1.1 * tree.s, tree.z, 0.5 * tree.s, 2.2 * tree.s, 0.5 * tree.s, 0, trunk);
      const topY = tree.y + (2.2 + 6.4) * tree.s;
      const baseY = tree.y + 1.8 * tree.s;
      const r = 2.6 * tree.s;
      for (let s = 0; s < 5; s += 1) {
        const a0 = (s / 5) * Math.PI * 2;
        const a1 = ((s + 1) / 5) * Math.PI * 2;
        addPoly([
          [tree.x + Math.cos(a0) * r, baseY, tree.z + Math.sin(a0) * r],
          [tree.x + Math.cos(a1) * r, baseY, tree.z + Math.sin(a1) * r],
          [tree.x, topY, tree.z],
        ], pine);
      }
    }
    for (const boat of BOATS) {
      addBox(boat.x, 0.55, boat.z, 2.2, 1.1, 7.2, boat.rot, hexRgb('#7a4a2f'));
      addBox(boat.x, 3.4, boat.z, 0.16, 4.6, 0.16, boat.rot, hexRgb('#4a3826'));
      const cos = Math.cos(boat.rot);
      const sin = Math.sin(boat.rot);
      const P = (lx, ly, lz) => [boat.x + lx * cos + lz * sin, ly, boat.z - lx * sin + lz * cos];
      addPoly([P(0, 1.4, -0.4), P(0, 5.4, -0.4), P(0, 1.4, 2.6)], hexRgb(boat.sail), { noShade: true });
    }
    // The lighthouse on Beacon Rock: banded tower, gallery, lamp and cap.
    const baseY = heightAt(LIGHTHOUSE.x, LIGHTHOUSE.z);
    const bands = [hexRgb('#e33f2e'), hexRgb('#f5f2e8'), hexRgb('#e33f2e')];
    addCylinder(LIGHTHOUSE.x, LIGHTHOUSE.z, baseY, 4.6, 3.1, LIGHTHOUSE.height, 9, (s) => bands[s]);
    addCylinder(LIGHTHOUSE.x, LIGHTHOUSE.z, baseY + LIGHTHOUSE.height, 3.9, 3.9, 1.2, 9, () => hexRgb('#2c313a'));
    addCylinder(LIGHTHOUSE.x, LIGHTHOUSE.z, baseY + LIGHTHOUSE.height + 1.2, 2.2, 2.2, 3.4, 8, () => [255, 226, 130]);
    addCylinder(LIGHTHOUSE.x, LIGHTHOUSE.z, baseY + LIGHTHOUSE.height + 4.6, 2.9, 0.4, 2.2, 8, () => hexRgb('#2c313a'));
    // The crater's lava floor, glowing through the smoke.
    const lava = [];
    const lavaInner = [];
    for (let s = 0; s < 14; s += 1) {
      const a = (s / 14) * Math.PI * 2;
      lava.push([CRATER.x + Math.cos(a) * 92, CRATER.y, CRATER.z + Math.sin(a) * 92]);
      lavaInner.push([CRATER.x + Math.cos(a) * 44, CRATER.y + 0.4, CRATER.z + Math.sin(a) * 44]);
    }
    addPoly(lava, hexRgb(PALETTE.lava), { noShade: true });
    addPoly(lavaInner, [255, 176, 66], { noShade: true });
  }

  function drawPlane(state) {
    topMode = true;
    const h = state.heading;
    const cosPitch = Math.cos(state.pitch);
    const f = [Math.sin(h) * cosPitch, Math.sin(state.pitch), -Math.cos(h) * cosPitch];
    // The heading's right vector, level: (cos h, 0, sin h), recovered from the forward axis.
    const rightBase = normalize3([-f[2], 0, f[0]]);
    const cosR = Math.cos(state.roll);
    const sinR = Math.sin(state.roll);
    // Roll the right vector around the forward axis (Rodrigues).
    const crossFR = [
      f[1] * rightBase[2] - f[2] * rightBase[1],
      f[2] * rightBase[0] - f[0] * rightBase[2],
      f[0] * rightBase[1] - f[1] * rightBase[0],
    ];
    const right = [
      rightBase[0] * cosR + crossFR[0] * sinR,
      rightBase[1] * cosR + crossFR[1] * sinR,
      rightBase[2] * cosR + crossFR[2] * sinR,
    ];
    const up = [
      right[1] * f[2] - right[2] * f[1],
      right[2] * f[0] - right[0] * f[2],
      right[0] * f[1] - right[1] * f[0],
    ];
    const toWorld = (v) => [
      state.x + right[0] * v[0] + up[0] * v[1] - f[0] * v[2],
      state.y + 1.05 + right[1] * v[0] + up[1] * v[1] - f[1] * v[2],
      state.z + right[2] * v[0] + up[2] * v[1] - f[2] * v[2],
    ];
    for (const [verts, colour] of planeModel) {
      addPoly(verts.map(toWorld), hexRgb(colour));
    }
    // The propeller: a blurred disc and two blades turning with propPhase, at the nose.
    const disc = [];
    for (let s = 0; s < 12; s += 1) {
      const a = (s / 12) * Math.PI * 2;
      disc.push(toWorld([Math.cos(a) * 1.22, 0.28 + Math.sin(a) * 1.22, -3.62]));
    }
    addPoly(disc, [28, 28, 34], { noShade: true, alpha: 0.32 });
    for (const flip of [0, Math.PI]) {
      const a = state.propPhase + flip;
      const tip = [Math.cos(a) * 1.18, 0.28 + Math.sin(a) * 1.18, -3.66];
      const tip2 = [Math.cos(a + 0.16) * 1.18, 0.28 + Math.sin(a + 0.16) * 1.18, -3.66];
      addPoly([toWorld([0, 0.28, -3.66]), toWorld(tip), toWorld(tip2)], [24, 24, 28], { noShade: true });
    }
    addPoly([toWorld([-0.2, 0.28, -3.7]), toWorld([0.2, 0.28, -3.7]), toWorld([0.2, 0.28, -3.3]), toWorld([-0.2, 0.28, -3.3])], hexRgb('#e8641e'), { noShade: true });
    topMode = false;
  }

  function drawSkyAndSea(time) {
    const horizonPoint = project({ x: origin[0] + basis.f[0] * 6000, y: origin[1], z: origin[2] + basis.f[2] * 6000 });
    const horizonY = horizonPoint ? horizonPoint.y : height * 0.42;
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.55, PALETTE.skyMid);
    sky.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, Math.max(0, Math.min(height, horizonY + 2)));
    if (horizonY < height) {
      const sea = ctx.createLinearGradient(0, horizonY, 0, height);
      sea.addColorStop(0, PALETTE.seaShallow);
      sea.addColorStop(0.25, '#2b7f9e');
      sea.addColorStop(1, PALETTE.seaDeep);
      ctx.fillStyle = sea;
      ctx.fillRect(0, Math.max(0, horizonY - 2), width, height - horizonY + 2);
    }
    // The sun, low in the north-west, with a soft halo.
    const sunPoint = project({ x: origin[0] + SUN[0] * 5600, y: origin[1] + SUN[1] * 5600, z: origin[2] + SUN[2] * 5600 });
    if (sunPoint && sunPoint.x > -80 && sunPoint.x < width + 80 && sunPoint.y > -80 && sunPoint.y < height + 80) {
      const glow = ctx.createRadialGradient(sunPoint.x, sunPoint.y, 4, sunPoint.x, sunPoint.y, 130);
      glow.addColorStop(0, 'rgba(255,243,196,0.85)');
      glow.addColorStop(0.25, 'rgba(255,220,150,0.35)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunPoint.x - 130, sunPoint.y - 130, 260, 260);
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sunPoint.x, sunPoint.y, 17, 0, Math.PI * 2);
      ctx.fill();
    }
    // Clouds and the volcano's smoke: soft billboards, painted before the land so the
    // islands stand in front of the sky they cross.
    const billboard = (cx, cy, cz, radius, rgb, alpha) => {
      const p = project({ x: cx, y: cy, z: cz });
      if (!p || p.depth > 5600) return;
      const scale = focal / p.depth;
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius * scale, radius * 0.42 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    CLOUDS.forEach((cloud, index) => {
      for (const puff of cloudPuffs[index]) {
        billboard(
          cloud.x + puff.dx * cloud.r, cloud.y + puff.dy * cloud.r, cloud.z + puff.dx * cloud.r * 0.4,
          cloud.r * puff.r, [255 * puff.shade, 255 * puff.shade, 255 * puff.shade], 0.82,
        );
      }
    });
    for (let i = 0; i < 6; i += 1) {
      const rise = (i * 52 + (time * 6) % 52);
      billboard(CRATER.x + rise * 0.35, CRATER.y + 26 + rise, CRATER.z - rise * 0.2, 30 + rise * 0.55, [196, 190, 186], 0.34 - i * 0.04);
    }
  }

  function drawTerrain() {
    const vertsPerSide = terrain.vertsPerSide;
    const viewX = new Float32Array(vertsPerSide * vertsPerSide);
    const viewY = new Float32Array(vertsPerSide * vertsPerSide);
    const viewZ = new Float32Array(vertsPerSide * vertsPerSide);
    for (let iz = 0; iz < vertsPerSide; iz += 1) {
      for (let ix = 0; ix < vertsPerSide; ix += 1) {
        const idx = iz * vertsPerSide + ix;
        const dx = -HALF + ix * CELL - origin[0];
        const dy = terrain.heights[idx] - origin[1];
        const dz = -HALF + iz * CELL - origin[2];
        viewX[idx] = dx * basis.r[0] + dy * basis.r[1] + dz * basis.r[2];
        viewY[idx] = dx * basis.u[0] + dy * basis.u[1] + dz * basis.u[2];
        viewZ[idx] = dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2];
      }
    }
    const camX = origin[0];
    const camZ = origin[2];
    for (const quad of terrain.quads) {
      const distCam = Math.hypot(quad.cx - camX, quad.cz - camZ);
      if (distCam > VIEW_FAR + CELL) continue;
      const i00 = quad.iz * vertsPerSide + quad.ix;
      const corners = [i00, i00 + 1, i00 + 1 + vertsPerSide, i00 + vertsPerSide];
      // Fully submerged quads stay undrawn: the sea gradient paints open water,
      // so the ocean reads smooth instead of meshed. Shore quads still draw.
      let topH = -Infinity;
      for (const ci of corners) topH = Math.max(topH, terrain.heights[ci]);
      if (topH < 0.2) continue;
      const viewVerts = corners.map((ci) => [viewX[ci], viewY[ci], viewZ[ci]]);
      const clipped = clipView(viewVerts);
      if (!clipped) continue;
      const depth = clippedDepth(clipped);
      if (depth > VIEW_FAR + 400) continue;
      const pts = toScreen(clipped);
      let colour = [quad.r, quad.g, quad.b];
      const fog = Math.min(1, Math.max(0, (depth - FOG_START) / (FOG_END - FOG_START)));
      if (fog > 0) colour = mixRgb(colour, FOG_RGB, fog * 0.82);
      solids.push({ pts, depth, fill: rgbString(colour) });
    }
  }

  /**
   * Paint one frame. opts: {dt, snap (jump the camera to its mark), titleView (the parked
   * three-quarter view for the title screen), time (seconds, for pulses and smoke)}.
   */
  function draw(state, opts = {}) {
    resize();
    const time = opts.time ?? 0;
    const planePos = [state.x, state.y + 1.05, state.z];
    const h = state.heading;
    const fwd = [Math.sin(h), 0, -Math.cos(h)];
    let desiredPos;
    let desiredLook;
    if (opts.titleView) {
      desiredPos = [
        planePos[0] + fwd[0] * 17 + -fwd[2] * -15,
        planePos[1] + 5.5,
        planePos[2] + fwd[2] * 17 + fwd[0] * -15,
      ];
      // Aim back at the aircraft (slightly left of it, so it sits right of
      // centre, clear of the title text): the plane is the subject here.
      desiredLook = [
        planePos[0] - fwd[0] * 2 + fwd[2] * -4,
        planePos[1] + 0.8,
        planePos[2] - fwd[2] * 2 - fwd[0] * -4,
      ];
    } else {
      const cosPitch = Math.cos(state.pitch);
      const f3 = [Math.sin(h) * cosPitch, Math.sin(state.pitch), -Math.cos(h) * cosPitch];
      desiredPos = [planePos[0] - f3[0] * 13.5, planePos[1] - f3[1] * 13.5 + 4.4, planePos[2] - f3[2] * 13.5];
      desiredLook = [planePos[0] + f3[0] * 42, planePos[1] + f3[1] * 42 + 1.4, planePos[2] + f3[2] * 42];
      // Never let the chase camera sink into a hillside the plane is skimming.
      const groundCam = heightAt(desiredPos[0], desiredPos[2]) + 2.2;
      if (desiredPos[1] < groundCam) desiredPos[1] = groundCam;
    }
    if (!camPos || opts.snap) {
      camPos = desiredPos;
      camLook = desiredLook;
    } else {
      const dt = Math.min(0.1, opts.dt ?? 1 / 60);
      const kp = 1 - Math.exp(-dt * 5.5);
      const kl = 1 - Math.exp(-dt * 9);
      camPos = camPos.map((v, i) => v + (desiredPos[i] - v) * kp);
      camLook = camLook.map((v, i) => v + (desiredLook[i] - v) * kl);
    }
    origin = camPos;
    const f = normalize3([camLook[0] - camPos[0], camLook[1] - camPos[1], camLook[2] - camPos[2]]);
    // Camera up leans part-way into the plane's bank, so turns feel flown, not fought:
    // rotate the world up around the view axis by a share of the roll.
    let upHint = [0, 1, 0];
    if (!opts.titleView && Math.abs(state.roll) > 0.001) {
      const leanAngle = state.roll * 0.45;
      const rightLevel = normalize3([-f[2], 0, f[0]]); // the view axis's own level right
      upHint = normalize3([
        rightLevel[0] * Math.sin(leanAngle),
        Math.cos(leanAngle),
        rightLevel[2] * Math.sin(leanAngle),
      ]);
    }
    // Right-handed view basis: r = f x up, u = r x f. (Level, facing north: r east, u up.)
    const r = normalize3([
      f[1] * upHint[2] - f[2] * upHint[1],
      f[2] * upHint[0] - f[0] * upHint[2],
      f[0] * upHint[1] - f[1] * upHint[0],
    ]);
    const u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];
    basis = { f, r, u };

    ctx.fillStyle = PALETTE.skyTop;
    ctx.fillRect(0, 0, width, height);
    drawSkyAndSea(time);

    solids = [];
    topSolids = [];
    drawTerrain();
    drawRunways();
    drawRings(state, time);
    drawVillageAndWild(state);
    drawPlane(state);
    solids.sort((a, b) => b.depth - a.depth);
    topSolids.sort((a, b) => b.depth - a.depth);
    for (const solid of [...solids, ...topSolids]) {
      ctx.fillStyle = solid.fill;
      ctx.beginPath();
      ctx.moveTo(solid.pts[0][0], solid.pts[0][1]);
      for (let i = 1; i < solid.pts.length; i += 1) ctx.lineTo(solid.pts[i][0], solid.pts[i][1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  return { draw, project };
}
