// First-person player controller: acceleration-based movement with friction,
// gravity and jumping, crouching, and AABB collision with sliding. The camera
// is synced from here by main.js; this module owns the body, not the view.
import * as THREE from 'three';

const WALK = 4.3;
const SPRINT = 6.2;
const CROUCH = 2.2;
const JUMP_VEL = 5.4;
const GRAVITY = 14.5;
const ACCEL_GROUND = 42;
const ACCEL_AIR = 9;
const FRICTION = 11;
const RADIUS = 0.35;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const HEIGHT_STAND = 1.8;
const HEIGHT_CROUCH = 1.25;

export function createPlayer(colliders, bounds) {
  const pos = new THREE.Vector3(0, 0, 17); // feet position
  const vel = new THREE.Vector3();
  const wish = new THREE.Vector3();
  let yaw = Math.PI;
  let pitch = 0;
  let health = 100;
  let alive = true;
  let crouched = false;
  let grounded = true;
  let sprinting = false;
  // Recoil recovery: pitch/yaw offsets decay back toward zero.
  let recoilPitch = 0;
  let recoilYaw = 0;

  function collides(x, z) {
    if (x < bounds.minX + RADIUS || x > bounds.maxX - RADIUS) return true;
    if (z < bounds.minZ + RADIUS || z > bounds.maxZ - RADIUS) return true;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) {
        return true;
      }
    }
    return false;
  }

  // Move one axis at a time so the player slides along walls instead of sticking.
  function moveAxis(dx, dz) {
    const nx = pos.x + dx;
    if (!collides(nx, pos.z)) pos.x = nx;
    const nz = pos.z + dz;
    if (!collides(pos.x, nz)) pos.z = nz;
  }

  return {
    pos,
    vel,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get health() {
      return health;
    },
    get alive() {
      return alive;
    },
    get crouched() {
      return crouched;
    },
    get grounded() {
      return grounded;
    },
    get sprinting() {
      return sprinting;
    },
    get eye() {
      return crouched ? EYE_CROUCH : EYE_STAND;
    },
    get height() {
      return crouched ? HEIGHT_CROUCH : HEIGHT_STAND;
    },
    look(dx, dy) {
      yaw -= dx * 0.0022;
      pitch -= dy * 0.0022;
      const lim = 1.45;
      if (pitch > lim) pitch = lim;
      if (pitch < -lim) pitch = -lim;
    },
    recoil(p, y) {
      recoilPitch += p;
      recoilYaw += y;
      pitch += p;
      yaw += y;
    },
    damage(amount) {
      if (!alive) return false;
      health -= amount;
      if (health <= 0) {
        health = 0;
        alive = false;
        return true;
      }
      return false;
    },
    respawn(spawn) {
      pos.set(spawn.x, 0, spawn.z);
      vel.set(0, 0, 0);
      yaw = spawn.yaw;
      pitch = 0;
      recoilPitch = 0;
      recoilYaw = 0;
      health = 100;
      alive = true;
      crouched = false;
      grounded = true;
    },
    // Horizontal speed, used for spread: moving fast means shooting wild.
    groundSpeed() {
      return Math.hypot(vel.x, vel.z);
    },
    step(dt, keys) {
      // Recoil recovery: the view settles back over ~0.25s.
      const rec = Math.min(1, dt * 6);
      pitch -= recoilPitch * rec;
      yaw -= recoilYaw * rec;
      recoilPitch *= 1 - rec;
      recoilYaw *= 1 - rec;

      crouched = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !crouched && grounded;

      // Wish direction in world space from the camera yaw.
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      let fx = 0;
      let fz = 0;
      if (keys.has('KeyW')) {
        fx -= sin;
        fz -= cos;
      }
      if (keys.has('KeyS')) {
        fx += sin;
        fz += cos;
      }
      if (keys.has('KeyA')) {
        fx -= cos;
        fz += sin;
      }
      if (keys.has('KeyD')) {
        fx += cos;
        fz -= sin;
      }
      const len = Math.hypot(fx, fz);
      if (len > 0) {
        fx /= len;
        fz /= len;
      }
      const speed = crouched ? CROUCH : sprinting ? SPRINT : WALK;
      wish.set(fx * speed, 0, fz * speed);

      // Accelerate toward the wish velocity; friction when no input.
      const accel = grounded ? ACCEL_GROUND : ACCEL_AIR;
      vel.x += (wish.x - vel.x) * Math.min(1, accel * dt);
      vel.z += (wish.z - vel.z) * Math.min(1, accel * dt);
      if (len === 0 && grounded) {
        const f = Math.max(0, 1 - FRICTION * dt);
        vel.x *= f;
        vel.z *= f;
      }

      // Jump.
      if (keys.has('Space') && grounded && !crouched) {
        vel.y = JUMP_VEL;
        grounded = false;
      }
      // Gravity.
      vel.y -= GRAVITY * dt;
      pos.y += vel.y * dt;
      if (pos.y <= 0) {
        pos.y = 0;
        vel.y = 0;
        grounded = true;
      }

      moveAxis(vel.x * dt, vel.z * dt);
    },
  };
}
