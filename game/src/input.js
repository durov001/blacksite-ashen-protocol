// Keyboard + mouse input with pointer lock. Owns no game logic: it just reports
// what the player is doing. main.js reads keys/look/firing each fixed step.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  const pressed = new Set(); // keys pressed since last drain (edge-triggered actions)
  let locked = false;
  let firing = false;
  let ads = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked) return;
    look.x += e.movementX || 0;
    look.y += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) ads = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) firing = false;
    if (e.button === 2) ads = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      firing = false;
      ads = false;
      keys.clear();
    }
    if (onLockChange) onLockChange(locked);
  }
  function onContextMenu(e) {
    e.preventDefault();
  }
  function onBlur() {
    keys.clear();
    firing = false;
    ads = false;
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  document.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('blur', onBlur);

  return {
    keys,
    get firing() {
      return firing;
    },
    get ads() {
      return ads;
    },
    get locked() {
      return locked;
    },
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return out;
    },
    // Edge trigger: true once per physical press, then consumed.
    consumeKey(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    drainPressed() {
      pressed.clear();
    },
    requestLock() {
      if (!locked) canvas.requestPointerLock();
    },
    releaseLock() {
      if (locked) document.exitPointerLock();
    },
  };
}
