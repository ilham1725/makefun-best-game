// Keyboard and mouse, read once a frame. Keys are tracked by their code (so WASD and the
// arrows both steer), the mouse is converted into logical arena coordinates through the
// canvas's letterbox, and one-shot presses (confirm, pause, mute, card picks) are queued
// and consumed by the loop so a single tap never fires twice.

import { FIELD } from './config.js';

/** One-shot actions the loop consumes. */
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_CARD_1 = 8;
export const ACTION_CARD_2 = 16;
export const ACTION_CARD_3 = 32;

const KEY_ACTIONS = {
  Space: ACTION_CONFIRM,
  Enter: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  Digit1: ACTION_CARD_1,
  Digit2: ACTION_CARD_2,
  Digit3: ACTION_CARD_3,
  Numpad1: ACTION_CARD_1,
  Numpad2: ACTION_CARD_2,
  Numpad3: ACTION_CARD_3,
};

/**
 * Track the keys and the pointer over a canvas. `layout` converts client pixels to logical
 * arena pixels; it is refreshed every frame because the window can resize at any time.
 */
export function createInput(canvas) {
  const down = new Set();
  let actions = 0;
  let mouseX = FIELD.width / 2;
  let mouseY = FIELD.height / 2;
  let mouseDown = false;
  let click = null;
  let unlocks = 0;

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    down.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) actions |= action;
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    unlocks += 1;
  }

  function onKeyUp(event) {
    down.delete(event.code);
  }

  function onMouseMove(event) {
    const p = toLogical(event.clientX, event.clientY);
    mouseX = p.x;
    mouseY = p.y;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    const p = toLogical(event.clientX, event.clientY);
    click = { x: p.x, y: p.y };
    unlocks += 1;
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  function onBlur() {
    down.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** The movement vector from the keys, normalised, or zero when idle. */
    direction() {
      let x = 0;
      let y = 0;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    /** The pointer in logical arena coordinates. */
    aim() {
      return { x: mouseX, y: mouseY };
    },
    /** True while the left button or Space is held. */
    firing() {
      return mouseDown || down.has('Space');
    },
    /** One-shot actions since the last call; the queue clears as it is read. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The most recent click in logical coordinates, or null; consumed on read. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    /** How many gestures have happened (the audio layer unlocks on the first). */
    gestureCount() {
      return unlocks;
    },
  };
}
