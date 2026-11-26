// Boot and the one loop: input is read every frame, the flight advances in fixed 1/60 s
// steps, and the renderer and cockpit paint what is there. The shell moves between four
// screens — title, play, paused and the results board — and turns flight events into
// sounds, messages and announcements.
//
// ?seed=N is accepted for reproducibility. ?shot=start|play|land|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, STEP } from './config.js';
import { createFlight, stepFlight, EVENT_FINISHED, EVENT_RING, EVENT_RING_MISSED, EVENT_TAKEOFF, EVENT_TOUCHDOWN } from './flight.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createCockpit } from './cockpit.js';
import { createAudio } from './audio.js';
import { drawPaused, drawResults, drawTitle } from './screens.js';
import { stageShot } from './shots.js';

const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSED = 'paused';
const SCREEN_OVER = 'over';
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const cockpit = createCockpit(canvas, renderer);
const audio = createAudio();
const ctx = canvas.getContext('2d');

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function drawScene(state, screen, best, snap, time, message) {
  if (screen === SCREEN_TITLE) {
    renderer.draw(state, { snap, titleView: true, time });
    drawTitle(ctx, canvas.width, canvas.height, best);
  } else if (screen === SCREEN_OVER) {
    renderer.draw(state, { snap, time });
    drawResults(ctx, canvas.width, canvas.height, state, best);
  } else {
    renderer.draw(state, { snap, time });
    cockpit.draw(state, message ?? {});
    if (screen === SCREEN_PAUSED) drawPaused(ctx, canvas.width, canvas.height);
  }
}

function runShot(name) {
  const scene = stageShot(name);
  let painted = 0;
  function paint() {
    drawScene(scene.state, scene.screen, scene.state.score.total, true, scene.time, {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let flight = createFlight();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let clock = 0;
  let message = null; // {text, tone, until}
  let prevRingPoints = 0;

  function announce(text) {
    status.textContent = text;
  }

  function showMessage(text, tone, seconds = 2.6) {
    message = { text, tone, until: clock + seconds };
  }

  function startSortie() {
    flight = createFlight();
    input.setThrottle(0);
    prevRingPoints = 0;
    message = null;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Flying the Island Circuit. Full throttle with W, rotate at 58 knots.');
    showMessage('TAKE OFF — FULL THROTTLE (W)', 'info', 3.2);
  }

  function finishSortie() {
    screen = SCREEN_OVER;
    if (flight.score.total > best) {
      best = flight.score.total;
      saveBest(best);
    }
    if (flight.status === 'landed') {
      audio.fanfare();
      announce(`Circuit complete. Score ${flight.score.total}.`);
    } else if (flight.status === 'crashed') {
      audio.crash();
      announce(`Aircraft down. ${flight.endReason} Score ${flight.score.total}.`);
    } else {
      announce(`Sortie over. ${flight.endReason} Score ${flight.score.total}.`);
    }
  }

  function reactToEvents(events) {
    if (events & EVENT_TAKEOFF) showMessage('AIRBORNE — CLIMB TO THE FIRST RING', 'info');
    if (events & EVENT_RING) {
      const gained = flight.score.ringPoints - prevRingPoints;
      audio.ringChime();
      showMessage(`RING ${flight.nextRing} THREADED — +${gained}`, 'good');
      announce(`Ring threaded. ${flight.score.ringPoints} ring points.`);
    }
    if (events & EVENT_RING_MISSED) {
      audio.ringMissed();
      showMessage('RING MISSED', 'bad');
    }
    if (events & EVENT_TOUCHDOWN) {
      const hard = flight.touchdown && flight.touchdown.sink < -4;
      audio.touchdown(hard);
      showMessage(flight.touchdown && flight.touchdown.home ? 'TOUCHDOWN AT EMBER BAY — BRAKE (B)' : 'TOUCHDOWN', hard ? 'bad' : 'good');
    }
    prevRingPoints = flight.score.ringPoints;
    if (events & EVENT_FINISHED) finishSortie();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startSortie();
      return;
    }
    if (screen === SCREEN_TITLE && (actions & ACTION_CONFIRM)) startSortie();
    else if (screen === SCREEN_OVER && (actions & ACTION_CONFIRM)) startSortie();
    else if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    clock += dt;
    handleActions();

    if (screen === SCREEN_PLAY) {
      const control = input.control(dt);
      accumulator += dt;
      let events = 0;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        events |= stepFlight(flight, control, STEP);
        accumulator -= STEP;
      }
      if (events) reactToEvents(events);
    } else {
      accumulator = 0;
      if (screen === SCREEN_TITLE) flight.propPhase += dt * 1.6; // the parked engine idles
    }

    const ui = message && clock < message.until ? { message: message.text, messageTone: message.tone } : {};
    drawScene(flight, screen, best, false, clock, ui);
    audio.update(flight.throttle, flight.speed, screen === SCREEN_PLAY);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('keydown', () => audio.unlock());
  window.addEventListener('mousedown', () => audio.unlock());

  announce('Windward Air: Island Circuit. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
