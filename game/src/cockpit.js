// The cockpit layer, painted over the 3D view: a dash panel with a working artificial
// horizon, airspeed and altimeter gauges, throttle and fuel bars, and the always-on HUD —
// altitude, speed and heading readouts, a compass tape with a bug for the next target, a
// target marker in the world, the score block and a minimap of the island circuit.
import { RING_COUNT } from './config.js';
import { RINGS, RUNWAYS, heightAt } from './terrain.js';
import { currentTarget, headingDelta } from './flight.js';

const MAP_WORLD = 4200;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function headingDeg(state) {
  return ((state.heading * 180) / Math.PI % 360 + 360) % 360;
}

/** Pre-render the minimap's land: the whole archipelago sampled once from heightAt. */
function buildMapBase(size) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const g = off.getContext('2d');
  const step = 84;
  const cell = size / ((MAP_WORLD * 2) / step);
  for (let iz = 0; iz < (MAP_WORLD * 2) / step; iz += 1) {
    for (let ix = 0; ix < (MAP_WORLD * 2) / step; ix += 1) {
      const x = -MAP_WORLD + (ix + 0.5) * step;
      const z = -MAP_WORLD + (iz + 0.5) * step;
      const h = heightAt(x, z);
      g.fillStyle = h < 0.2 ? '#1d6f8c' : h < 2.4 ? '#ecd9a0' : h < 95 ? '#4c9450' : h < 200 ? '#7d7268' : '#6e5a4e';
      g.fillRect(ix * cell, iz * cell, cell + 0.6, cell + 0.6);
    }
  }
  return off;
}

/** Create the cockpit painter bound to the game canvas and the 3D renderer (for markers). */
export function createCockpit(canvas, renderer) {
  const ctx = canvas.getContext('2d');
  let mapBase = null;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCompass(state, target, w, s) {
    const cx = w / 2;
    const y = 14 * s;
    const tapeW = Math.min(430 * s, w * 0.44);
    ctx.save();
    roundRect(cx - tapeW / 2, y, tapeW, 40 * s, 8 * s);
    ctx.fillStyle = 'rgba(10,16,24,0.62)';
    ctx.fill();
    ctx.clip();
    const hdg = headingDeg(state);
    const pxPerDeg = tapeW / 90;
    ctx.fillStyle = '#e8f2fa';
    ctx.font = `${15 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = -60; d <= 420; d += 15) {
      const deg = ((d % 360) + 360) % 360;
      const off = (d - hdg) * pxPerDeg;
      if (Math.abs(off) > tapeW / 2) continue;
      const label = cardinals[deg] ?? String(deg / 10).padStart(2, '0');
      ctx.fillText(label, cx + off, y + 26 * s);
    }
    // The target bug: a diamond on the tape at the target's relative bearing.
    if (target) {
      const bearing = Math.atan2(target.x - state.x, -(target.z - state.z));
      const rel = (headingDelta(state.heading, bearing) * 180) / Math.PI;
      if (Math.abs(rel) < 44) {
        const bx = cx + rel * pxPerDeg;
        ctx.fillStyle = '#ffb02e';
        ctx.beginPath();
        ctx.moveTo(bx, y + 32 * s);
        ctx.lineTo(bx + 6 * s, y + 39 * s);
        ctx.lineTo(bx - 6 * s, y + 39 * s);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(cx, y + 40 * s);
    ctx.lineTo(cx + 6 * s, y + 48 * s);
    ctx.lineTo(cx - 6 * s, y + 48 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${17 * s}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}°`, cx, y + 66 * s);
  }

  function drawReadouts(state, s) {
    const altFt = Math.max(0, Math.round(state.y * 3.281));
    const spdKt = Math.round(state.speed * 1.944);
    const rows = [
      ['ALT', `${altFt.toLocaleString('en-US')} ft`],
      ['SPD', `${spdKt} kt`],
      ['HDG', `${String(Math.round(headingDeg(state))).padStart(3, '0')}°`],
    ];
    ctx.save();
    roundRect(14 * s, 14 * s, 148 * s, rows.length * 31 * s + 12 * s, 9 * s);
    ctx.fillStyle = 'rgba(10,16,24,0.62)';
    ctx.fill();
    ctx.textAlign = 'left';
    rows.forEach(([label, value], i) => {
      const y = 14 * s + 12 * s + i * 31 * s;
      ctx.fillStyle = '#9fc3e0';
      ctx.font = `bold ${13 * s}px system-ui, sans-serif`;
      ctx.fillText(label, 26 * s, y + 15 * s);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${19 * s}px ui-monospace, monospace`;
      ctx.fillText(value, 62 * s, y + 16 * s);
    });
    ctx.restore();
  }

  function drawScoreBlock(state, w, s) {
    const x = w - 196 * s;
    const y = 196 * s;
    ctx.save();
    roundRect(x, y, 182 * s, 96 * s, 9 * s);
    ctx.fillStyle = 'rgba(10,16,24,0.62)';
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fc3e0';
    ctx.font = `bold ${12 * s}px system-ui, sans-serif`;
    ctx.fillText('SCORE', x + 12 * s, y + 20 * s);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${24 * s}px ui-monospace, monospace`;
    ctx.fillText(String(state.score.ringPoints + state.score.landingPoints), x + 12 * s, y + 48 * s);
    // Ring pips: one per ring, amber when next, green when threaded, grey when missed.
    for (let i = 0; i < RING_COUNT; i += 1) {
      const px = x + 14 * s + i * 27 * s;
      const py = y + 72 * s;
      ctx.beginPath();
      ctx.arc(px, py, 8 * s, 0, Math.PI * 2);
      ctx.fillStyle = state.ringResults[i] === 'hit' ? '#2ecc71' : state.ringResults[i] === 'missed' ? '#7d8590' : i === state.nextRing ? '#ffb02e' : '#33506b';
      ctx.fill();
      ctx.fillStyle = '#0b1220';
      ctx.font = `bold ${11 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), px, py + 4 * s);
      ctx.textAlign = 'left';
    }
    const mm = Math.floor(state.time / 60);
    const ss = String(Math.floor(state.time % 60)).padStart(2, '0');
    ctx.fillStyle = '#e8f2fa';
    ctx.font = `${14 * s}px ui-monospace, monospace`;
    ctx.fillText(`${mm}:${ss}`, x + 128 * s, y + 20 * s);
    ctx.restore();
  }

  function drawMinimap(state, target, w, s) {
    if (!mapBase) mapBase = buildMapBase(220);
    const size = 172 * s;
    const x = w - size - 14 * s;
    const y = 14 * s;
    ctx.save();
    roundRect(x, y, size, size, 9 * s);
    ctx.clip();
    ctx.drawImage(mapBase, x, y, size, size);
    const toMap = (wx, wz) => [x + ((wx + MAP_WORLD) / (MAP_WORLD * 2)) * size, y + ((wz + MAP_WORLD) / (MAP_WORLD * 2)) * size];
    // The course: rings joined in order, then the destination strip.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    RINGS.forEach((ring, i) => {
      const [mx, my] = toMap(ring.x, ring.z);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    });
    ctx.stroke();
    RINGS.forEach((ring, i) => {
      const [mx, my] = toMap(ring.x, ring.z);
      ctx.beginPath();
      ctx.arc(mx, my, 5 * s, 0, Math.PI * 2);
      ctx.fillStyle = state.ringResults[i] === 'hit' ? '#2ecc71' : state.ringResults[i] === 'missed' ? '#7d8590' : i === state.nextRing ? '#ffb02e' : '#e8f2fa';
      ctx.fill();
    });
    for (const runway of RUNWAYS) {
      const [mx, my] = toMap(runway.cx, runway.cz);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(mx - 8 * s, my - 1.6 * s, 16 * s, 3.2 * s);
    }
    if (target) {
      const [tx, ty] = toMap(target.x, target.z);
      ctx.strokeStyle = '#ffb02e';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(tx, ty, 9 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The plane, a small arrow at its heading.
    const [px, py] = toMap(state.x, state.z);
    ctx.translate(px, py);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8 * s);
    ctx.lineTo(5 * s, 6 * s);
    ctx.lineTo(0, 3.4 * s);
    ctx.lineTo(-5 * s, 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(x, y, size, size, 9 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetMarker(state, target, w, h, s) {
    if (!target) return;
    const p = renderer.project({ x: target.x, y: target.y, z: target.z });
    const dist = Math.hypot(target.x - state.x, target.z - state.z);
    const label = target.kind === 'ring' ? `RING ${target.index + 1}` : target.kind === 'gate' ? 'APPROACH' : 'EMBER BAY STRIP';
    ctx.save();
    ctx.textAlign = 'center';
    if (p && p.x > 30 && p.x < w - 30 && p.y > 30 && p.y < h - 190 * s) {
      const r = clamp(9000 / Math.max(60, p.depth), 9, 30) * s;
      ctx.strokeStyle = '#ffb02e';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#ffd88a';
      ctx.font = `bold ${14 * s}px system-ui, sans-serif`;
      ctx.fillText(`${label} · ${(dist / 1000).toFixed(1)} km`, p.x, p.y + r + 20 * s);
    }
    ctx.restore();
  }

  function gaugeFrame(cx, cy, r, label, s) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#10151d';
    ctx.fill();
    ctx.lineWidth = 2.4 * s;
    ctx.strokeStyle = '#3d4a5a';
    ctx.stroke();
    ctx.fillStyle = '#8fa9c4';
    ctx.font = `bold ${10.5 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r * 0.62);
  }

  function drawHorizon(state, cx, cy, r, s) {
    gaugeFrame(cx, cy, r, 'HORIZON', s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.roll);
    const pitchPx = clamp(state.pitch, -0.5, 0.5) * r * 1.15;
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#3f7fbf';
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r, -1, r * 2, 2);
    for (const mark of [-0.35, -0.18, 0.18, 0.35]) {
      const wMark = mark % 0.35 === 0 ? r * 0.42 : r * 0.26;
      ctx.fillRect(-wMark / 2, mark * r * 1.15 - 1, wMark, 2);
    }
    ctx.restore();
    // The fixed aircraft symbol and the roll pointer.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#ffb02e';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0);
    ctx.lineTo(-r * 0.18, 0);
    ctx.lineTo(0, r * 0.1);
    ctx.lineTo(r * 0.18, 0);
    ctx.lineTo(r * 0.55, 0);
    ctx.stroke();
    ctx.rotate(-state.roll);
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.92);
    ctx.lineTo(4.5 * s, -r * 0.72);
    ctx.lineTo(-4.5 * s, -r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawDialGauge(cx, cy, r, s, label, value, max, ticks, format) {
    gaugeFrame(cx, cy, r, label, s);
    ctx.save();
    ctx.strokeStyle = '#c8d6e4';
    ctx.fillStyle = '#c8d6e4';
    ctx.lineWidth = 1.6 * s;
    ctx.font = `${10.5 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const startA = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    for (const tick of ticks) {
      const a = startA + (tick.v / max) * sweep;
      const x0 = cx + Math.cos(a) * r * 0.78;
      const y0 = cy + Math.sin(a) * r * 0.78;
      const x1 = cx + Math.cos(a) * r * 0.9;
      const y1 = cy + Math.sin(a) * r * 0.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.fillText(tick.t, cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58 + 3.5 * s);
    }
    const a = startA + (clamp(value, 0, max) / max) * sweep;
    ctx.strokeStyle = '#ffb02e';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8f2fa';
    ctx.font = `bold ${13 * s}px ui-monospace, monospace`;
    ctx.fillText(format(value), cx, cy + r * 0.42);
    ctx.restore();
  }

  function drawBar(x, y, hgt, frac, colour, label, valueText, s) {
    ctx.save();
    roundRect(x, y, 26 * s, hgt, 5 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    const fh = Math.max(0, hgt * clamp(frac, 0, 1));
    if (fh > 1) {
      roundRect(x, y + hgt - fh, 26 * s, fh, 5 * s);
      ctx.fillStyle = colour;
      ctx.fill();
    }
    ctx.fillStyle = '#8fa9c4';
    ctx.font = `bold ${10.5 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + 13 * s, y - 7 * s);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${12 * s}px ui-monospace, monospace`;
    ctx.fillText(valueText, x + 13 * s, y + hgt + 16 * s);
    ctx.restore();
  }

  /**
   * Paint the cockpit over a flown frame. ui: {message, messageTone ('good'|'bad'|'info'),
   * targetVisible} — the target comes from the flight state itself.
   */
  function draw(state, ui = {}) {
    const w = canvas.width;
    const h = canvas.height;
    const s = clamp(h / 800, 0.72, 1.25);
    const target = state.status === 'flying' || state.status === 'ready' ? currentTarget(state) : null;

    drawTargetMarker(state, target, w, h, s);
    drawCompass(state, target, w, s);
    drawReadouts(state, s);
    drawMinimap(state, target, w, s);
    drawScoreBlock(state, w, s);

    // The dash panel along the bottom, with the three flight gauges and the two bars.
    const panelH = 158 * s;
    const panelY = h - panelH;
    const grad = ctx.createLinearGradient(0, panelY, 0, h);
    grad.addColorStop(0, 'rgba(16,21,29,0.88)');
    grad.addColorStop(1, 'rgba(8,11,16,0.94)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, panelY, w, panelH);
    ctx.fillStyle = 'rgba(255,176,46,0.5)';
    ctx.fillRect(0, panelY, w, 2);

    const cy = panelY + panelH / 2 + 6 * s;
    const r = 56 * s;
    drawBar(30 * s, panelY + 34 * s, panelH - 62 * s, state.throttle, '#e8641e', 'THR', `${Math.round(state.throttle * 100)}%`, s);
    drawHorizon(state, w / 2, cy, r, s);
    drawDialGauge(w / 2 - 128 * s, cy, r, s, 'AIRSPEED', state.speed * 1.944, 200,
      [{ v: 0, t: '0' }, { v: 50, t: '50' }, { v: 100, t: '100' }, { v: 150, t: '150' }, { v: 200, t: '200' }],
      (v) => `${Math.round(v)} kt`);
    drawDialGauge(w / 2 + 128 * s, cy, r, s, 'ALTIMETER', state.y * 3.281, 3000,
      [{ v: 0, t: '0' }, { v: 750, t: '75' }, { v: 1500, t: '150' }, { v: 2250, t: '225' }, { v: 3000, t: '300' }],
      (v) => `${Math.round(v)} ft`);
    drawBar(w - 56 * s, panelY + 34 * s, panelH - 62 * s, state.fuel / 100, state.fuel < 22 ? '#e33f2e' : '#39b26b', 'FUEL', `${Math.round(state.fuel)}`, s);

    // Flaps and stall lamps, right of the altimeter.
    const lampX = w / 2 + 216 * s;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = `bold ${12 * s}px system-ui, sans-serif`;
    ctx.fillStyle = state.flaps ? '#39b26b' : '#54677c';
    ctx.fillText(state.flaps ? '● FLAPS DOWN' : '○ FLAPS UP', lampX, cy - 8 * s);
    if (state.stalled) {
      ctx.fillStyle = '#ff5147';
      ctx.font = `bold ${17 * s}px system-ui, sans-serif`;
      ctx.fillText('⚠ STALL', lampX, cy + 20 * s);
    } else if (state.onGround && state.status === 'flying') {
      ctx.fillStyle = '#9fc3e0';
      ctx.fillText('ON GROUND — B TO BRAKE', lampX, cy + 20 * s);
    }
    ctx.restore();

    // The transient centre message (ring scored, warnings, instructions).
    if (ui.message) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `bold ${27 * s}px system-ui, sans-serif`;
      const colours = { good: '#7be495', bad: '#ff7a70', info: '#ffd88a' };
      ctx.fillStyle = colours[ui.messageTone] ?? colours.info;
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 8;
      ctx.fillText(ui.message, w / 2, panelY - 26 * s);
      ctx.restore();
    }
  }

  return { draw };
}
