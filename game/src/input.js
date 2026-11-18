// Keyboard and pointer input. Held keys give two movement axes (the same keys walk the
// player and, once he is in a car, drive it: W/Up is throttle, A/D steer). One-shot
// presses — confirm, pause, interact, horn — are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_HORN = 8;
export const ACTION_ATTACK = 16;
export const ACTION_FIRE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE', 'KeyF']);
const HORN = new Set(['KeyH']);
const ATTACK = new Set(['KeyJ']);
const FIRE = new Set(['KeyK']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;

  function setKey(event, down) {
    const code = event.code;
    if (UP.has(code)) held.up = down;
    else if (DOWN.has(code)) held.down = down;
    else if (LEFT.has(code)) held.left = down;
    else if (RIGHT.has(code)) held.right = down;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') held.run = down;
    else if (down && !event.repeat) {
      if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
      else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
      else if (INTERACT.has(code)) actions |= ACTION_INTERACT;
      else if (HORN.has(code)) actions |= ACTION_HORN;
      else if (ATTACK.has(code)) actions |= ACTION_ATTACK;
      else if (FIRE.has(code)) actions |= ACTION_FIRE;
      else return;
    } else return;
    event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Horizontal axis: -1 left, 1 right, 0 for neither or both. */
    axisX() {
      return (held.right ? 1 : 0) - (held.left ? 1 : 0);
    },
    /** Vertical axis: -1 up, 1 down. */
    axisY() {
      return (held.down ? 1 : 0) - (held.up ? 1 : 0);
    },
    /** Throttle for driving: 1 forward, -1 brake/reverse. */
    throttle() {
      return (held.up ? 1 : 0) - (held.down ? 1 : 0);
    },
    sprint() {
      return held.run;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
