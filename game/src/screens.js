// The full-screen overlays: the title card the sortie starts behind, the pause veil, and the
// results board that closes a sortie — landed, put down or crashed — with its score broken
// into the parts it was earned in. Pure drawing; the shell owns the state machine.
import { RING_COUNT, SCORE } from './config.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function panel(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The title screen: the game's name and route over the parked Kestrel, controls, best score. */
export function drawTitle(ctx, w, h, best) {
  const s = clamp(h / 800, 0.72, 1.25);
  const grad = ctx.createLinearGradient(0, 0, w * 0.72, 0);
  grad.addColorStop(0, 'rgba(7,12,20,0.78)');
  grad.addColorStop(1, 'rgba(7,12,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const x = 54 * s;
  let y = 92 * s;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb02e';
  ctx.font = `bold ${19 * s}px system-ui, sans-serif`;
  ctx.fillText('W I N D W A R D   A I R', x, y);
  y += 74 * s;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${64 * s}px system-ui, sans-serif`;
  ctx.fillText('Island Circuit', x, y);
  y += 34 * s;
  ctx.fillStyle = '#cfe3f2';
  ctx.font = `${19 * s}px system-ui, sans-serif`;
  ctx.fillText('Windward Field → Ember Bay Strip · six rings · one tank of fuel', x, y);

  y += 52 * s;
  ctx.font = `${16.5 * s}px system-ui, sans-serif`;
  const lines = [
    'Take off east, thread the six amber rings past the lighthouse',
    'and up the volcano shoulder, then land on the bay strip.',
    '',
    'Steer — Arrow keys or mouse        Throttle — W / S or wheel',
    'Flaps — F (slower, steeper)        Brake — B or hold Space',
    'Pause — P        Restart — R        Camera — chase, always behind you',
  ];
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += 25 * s;
  }

  y += 26 * s;
  ctx.fillStyle = '#ffb02e';
  ctx.font = `bold ${23 * s}px system-ui, sans-serif`;
  ctx.fillText('PRESS ENTER OR CLICK TO FLY', x, y);
  if (best > 0) {
    y += 36 * s;
    ctx.fillStyle = '#9fc3e0';
    ctx.font = `${16 * s}px system-ui, sans-serif`;
    ctx.fillText(`Best circuit: ${best} points`, x, y);
  }
}

/** The pause veil. */
export function drawPaused(ctx, w, h) {
  const s = clamp(h / 800, 0.72, 1.25);
  ctx.fillStyle = 'rgba(7,12,20,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${44 * s}px system-ui, sans-serif`;
  ctx.fillText('PAUSED', w / 2, h / 2 - 10 * s);
  ctx.fillStyle = '#cfe3f2';
  ctx.font = `${17 * s}px system-ui, sans-serif`;
  ctx.fillText('P or Enter to fly on · R to start the circuit again', w / 2, h / 2 + 28 * s);
}

/** A verdict line for a finished sortie, from its score and how it ended. */
function verdict(state) {
  if (state.status === 'crashed') return 'The Kestrel is in the hands of the salvage crew.';
  if (state.status === 'down') return 'Down in one piece — but the circuit goes unfinished.';
  const total = state.score.total;
  if (total >= 3300) return 'Textbook flying, Captain. The bay crew is applauding.';
  if (total >= 2600) return 'A fine circuit — clean rings and a greaser at the bay.';
  if (total >= 1800) return 'Down safe at Ember Bay. The logbook wants polish.';
  return 'Down at last. The instructor says: again, with feeling.';
}

/** The results board: how the sortie ended and every point it earned, itemised. */
export function drawResults(ctx, w, h, state, best) {
  const s = clamp(h / 800, 0.72, 1.25);
  ctx.fillStyle = 'rgba(7,12,20,0.45)';
  ctx.fillRect(0, 0, w, h);
  const pw = Math.min(560 * s, w * 0.86);
  const ph = 468 * s;
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 - 30 * s;
  panel(ctx, px, py, pw, ph, 14 * s);
  ctx.fillStyle = 'rgba(11,18,28,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,176,46,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  let y = py + 52 * s;
  ctx.textAlign = 'center';
  ctx.fillStyle = state.status === 'landed' ? '#7be495' : state.status === 'down' ? '#ffd88a' : '#ff7a70';
  ctx.font = `bold ${32 * s}px system-ui, sans-serif`;
  const heading = state.status === 'landed' ? 'CIRCUIT COMPLETE' : state.status === 'down' ? 'SORTIE OVER' : 'AIRCRAFT DOWN';
  ctx.fillText(heading, w / 2, y);
  y += 28 * s;
  ctx.fillStyle = '#cfe3f2';
  ctx.font = `${15.5 * s}px system-ui, sans-serif`;
  ctx.fillText(state.endReason, w / 2, y);

  const hits = state.ringResults.filter((r) => r === 'hit').length;
  const rows = [
    [`Rings threaded — ${hits} of ${RING_COUNT}`, state.score.ringPoints],
  ];
  if (state.touchdown) {
    const sinkFpm = Math.abs(Math.round(state.touchdown.sink * 196.85));
    rows.push([`Landing at ${state.touchdown.runwayName} — sink ${sinkFpm} fpm, ${Math.round(state.touchdown.speedKt)} kt`, state.score.landingPoints]);
  }
  if (state.status === 'landed') {
    rows.push([`Time bonus — ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')} against par ${Math.floor(SCORE.parSeconds / 60)}:${String(SCORE.parSeconds % 60).padStart(2, '0')}`, state.score.timeBonus]);
    rows.push([`Fuel bonus — ${Math.round(state.fuel)} left in the tank`, state.score.fuelBonus]);
  }
  y += 34 * s;
  ctx.font = `${16.5 * s}px system-ui, sans-serif`;
  for (const [label, points] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8f2fa';
    ctx.fillText(label, px + 34 * s, y);
    ctx.textAlign = 'right';
    ctx.font = `bold ${16.5 * s}px ui-monospace, monospace`;
    ctx.fillText(String(points), px + pw - 34 * s, y);
    ctx.font = `${16.5 * s}px system-ui, sans-serif`;
    y += 30 * s;
  }
  y += 8 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(px + 34 * s, y - 14 * s);
  ctx.lineTo(px + pw - 34 * s, y - 14 * s);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${21 * s}px system-ui, sans-serif`;
  ctx.fillText('TOTAL', px + 34 * s, y + 14 * s);
  ctx.textAlign = 'right';
  ctx.font = `bold ${25 * s}px ui-monospace, monospace`;
  ctx.fillStyle = '#ffb02e';
  ctx.fillText(String(state.score.total), px + pw - 34 * s, y + 14 * s);

  y += 58 * s;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cfe3f2';
  ctx.font = `italic ${16 * s}px system-ui, sans-serif`;
  ctx.fillText(verdict(state), w / 2, y);
  y += 34 * s;
  ctx.fillStyle = '#9fc3e0';
  ctx.font = `${14.5 * s}px system-ui, sans-serif`;
  ctx.fillText(`Best circuit: ${Math.max(best, state.score.total)} points · Damage ${Math.round(state.damage)}% · Fuel left ${Math.round(state.fuel)}`, w / 2, y);
  y += 40 * s;
  ctx.fillStyle = '#ffb02e';
  ctx.font = `bold ${18 * s}px system-ui, sans-serif`;
  ctx.fillText('PRESS ENTER TO FLY THE CIRCUIT AGAIN', w / 2, y);
}
