// Keyboard and mouse input: the arrow keys (or the mouse) fly the plane, W and S work the
// throttle, F toggles the flaps, B brakes, and a few keys are one-shot actions the shell
// consumes. Everything is edge-safe: held keys are a set, actions are drained once per frame.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_FLAPS = 8;

/** Create the input reader bound to a canvas (for mouse steering and wheel throttle). */
export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let throttle = 0;
  let flaps = false;
  let brake = false;
  let mouseX = -1;
  let mouseY = -1;
  let mouseSeenAt = -10000;

  const KEY_ACTIONS = {
    Enter: ACTION_CONFIRM,
    Space: ACTION_CONFIRM,
    KeyP: ACTION_PAUSE,
    Escape: ACTION_PAUSE,
    KeyR: ACTION_RESTART,
    KeyF: ACTION_FLAPS,
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      return;
    }
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) actions |= action;
    if (event.code === 'KeyF') flaps = !flaps;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / Math.max(1, rect.width);
    mouseY = (event.clientY - rect.top) / Math.max(1, rect.height);
    mouseSeenAt = performance.now();
  });
  canvas.addEventListener('mousedown', () => {
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    throttle = Math.min(1, Math.max(0, throttle - Math.sign(event.deltaY) * 0.08));
  }, { passive: false });

  return {
    /** Drain the one-shot actions pressed since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Set the throttle directly (the autopilot's scenes and the start of a sortie do). */
    setThrottle(value) {
      throttle = Math.min(1, Math.max(0, value));
    },
    get flaps() {
      return flaps;
    },
    /** The control the flight model consumes this frame, throttle integrated over dt. */
    control(dt) {
      if (held.has('KeyW')) throttle = Math.min(1, throttle + dt * 0.55);
      if (held.has('KeyS')) throttle = Math.max(0, throttle - dt * 0.55);
      brake = held.has('KeyB') || held.has('Space');

      let pitch = 0;
      let roll = 0;
      if (held.has('ArrowUp')) pitch += 1;
      if (held.has('ArrowDown')) pitch -= 1;
      if (held.has('ArrowLeft')) roll -= 1;
      if (held.has('ArrowRight')) roll += 1;

      // The mouse steers when it has moved lately and no arrow key is down: bank and pitch
      // follow how far the pointer sits from the canvas centre.
      if (pitch === 0 && roll === 0 && performance.now() - mouseSeenAt < 5000 && mouseX >= 0) {
        roll = Math.min(1, Math.max(-1, (mouseX - 0.5) / 0.3));
        pitch = Math.min(1, Math.max(-1, (0.5 - mouseY) / 0.3));
      }
      return { pitch, roll, throttle, brake, flaps };
    },
  };
}
