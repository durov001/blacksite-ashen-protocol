// effects.js — pooled particles, tracers, muzzle flash. No per-frame allocation in step().
import * as THREE from 'three';

const MAX_P = 40, MAX_T = 8;

export function createEffects(scene) {
  // --- particle pool: one THREE.Points, per-particle velocity/life/color arrays ---
  const pos = new Float32Array(MAX_P * 3);
  const col = new Float32Array(MAX_P * 3);
  const vel = new Float32Array(MAX_P * 3);
  const life = new Float32Array(MAX_P);
  const maxLife = new Float32Array(MAX_P);
  const grav = new Float32Array(MAX_P);
  for (let i = 0; i < MAX_P; i++) { pos[i * 3 + 1] = -999; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;

  const _c = new THREE.Color();
  function spawn(x, y, z, vx, vy, vz, t, color, g) {
    const i = cursor; cursor = (cursor + 1) % MAX_P;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    _c.set(color);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    life[i] = maxLife[i] = t; grav[i] = g;
  }
  function burst(p, n, speed, t, color, g) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      spawn(p.x, p.y, p.z,
        Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + speed * 0.3, Math.sin(a) * Math.cos(b) * s,
        t * (0.6 + Math.random() * 0.7), color, g);
    }
  }

  // --- muzzle flash: additive sprite, recycled ---
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d');
  const grad = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,240,190,1)');
  grad.addColorStop(0.35, 'rgba(255,180,60,0.9)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  cx.fillStyle = grad; cx.fillRect(0, 0, 64, 64);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true,
  }));
  flash.scale.set(0.55, 0.55, 1); flash.visible = false;
  scene.add(flash);
  let flashLife = 0;

  // --- tracer pool: 8 recycled line segments ---
  const tracers = [];
  for (let i = 0; i < MAX_T; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false,
    }));
    line.frustumCulled = false; line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tCursor = 0;

  return {
    muzzle(p, dir) {
      flash.position.copy(p).addScaledVector(dir, 0.15);
      flash.visible = true; flashLife = 0.06;
      burst(p, 2, 1.2, 0.08, 0xffc860, 0);
    },
    impact(p, normal) {
      const n = normal || { x: 0, y: 1, z: 0 };
      burst(p, 5, 2.2, 0.35, 0xffc860, 6);
      spawn(p.x, p.y, p.z, n.x * 1.5, n.y * 1.5 + 1, n.z * 1.5, 0.3, 0x9aa4ac, 2);
    },
    blood(p) { burst(p, 6, 1.6, 0.4, 0xc01818, 7); },
    explosion(p) {
      burst(p, 14, 5.5, 0.7, 0xff8a20, 3);
      burst(p, 6, 2.5, 1.0, 0x60686e, 1);
      flash.position.copy(p); flash.scale.set(3.2, 3.2, 1);
      flash.visible = true; flashLife = 0.18;
    },
    tracer(from, to, color) {
      const t = tracers[tCursor]; tCursor = (tCursor + 1) % MAX_T;
      const a = t.line.geometry.attributes.position.array;
      a[0] = from.x; a[1] = from.y; a[2] = from.z;
      a[3] = to.x; a[4] = to.y; a[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.set(color || 0xffd27a);
      t.line.material.opacity = 0.9;
      t.line.visible = true; t.life = 0.07;
    },
    step(dt) {
      for (let i = 0; i < MAX_P; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
        vel[i * 3 + 1] -= grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) { flash.visible = false; flash.scale.set(0.55, 0.55, 1); }
      }
      for (let i = 0; i < MAX_T; i++) {
        const t = tracers[i];
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
        else t.line.material.opacity = t.life / 0.07 * 0.9;
      }
    },
  };
}
