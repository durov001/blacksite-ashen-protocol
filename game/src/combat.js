// combat.js — hitscan raycasts + grenade physics. Reuses raycaster/vectors.
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3(0, 1, 0);

export function createCombat(o) {
  const scene = o.scene, solids = o.solidMeshes || [];
  const getBots = o.getBots || (() => []);
  const fx = o.effects || {}, au = o.audio || {};
  const colliders = o.colliders || [];
  const getPlayer = o.getPlayer || null;
  const onHit = o.onHit || null;
  const grenades = [];
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  const mat = new THREE.MeshBasicMaterial({color: 0x2a2f26});

  function losClear(from, to) {
    _v1.subVectors(to, from);
    const d = _v1.length();
    if (d < 0.01) return true;
    _ray.set(from, _v1.multiplyScalar(1 / d)); _ray.far = d;
    return _ray.intersectObjects(solids, false).length === 0;
  }

  function fireHitscan(origin, dir, cfg, shooter) {
    _ray.set(origin, dir); _ray.far = cfg.range;
    let best = null, bestD = Infinity, bestBot = null, bestPart = null;
    const wh = _ray.intersectObjects(solids, false);
    if (wh.length) { best = wh[0]; bestD = wh[0].distance; }
    const bots = getBots();
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (!b.alive) continue;
      const hits = _ray.intersectObjects(b.hitMeshes, false);
      for (let j = 0; j < hits.length; j++) {
        const hb = hits[j].object.userData.bot;
        // skip the shooter's own hit meshes (ray starts inside own head box)
        if (hb === shooter || (shooter && shooter.isPlayer && hb && hb.isPlayer)) continue;
        if (hits[j].distance < bestD) {
          best = hits[j]; bestD = hits[j].distance;
          bestBot = hb; bestPart = hits[j].object.userData.part;
        }
        break; // hits are distance-sorted: first non-self hit is nearest for this bot
      }
    }
    const end = _v2.copy(dir).multiplyScalar(best ? bestD : cfg.range).add(origin);
    if (fx.tracer) fx.tracer(origin, end, cfg.tracer);
    if (!best) return null;
    if (!bestBot) { // world hit
      if (fx.impact) fx.impact(best.point, best.face ? best.face.normal : _n);
      return null;
    }
    // friendly fire off: bullet stops at the teammate, no damage
    if (shooter && bestBot.team && shooter.team && bestBot.team === shooter.team) {
      if (fx.impact) fx.impact(best.point, _n);
      return {blocked: true, bot: bestBot, part: bestPart, point: best.point.clone()};
    }
    const fall = bestD <= cfg.range * 0.6 ? 1 : 1 - 0.5 * (bestD - cfg.range * 0.6) / (cfg.range * 0.4);
    const mult = bestPart === 'head' ? cfg.headMult : bestPart === 'legs' ? cfg.legMult : 1;
    const dmg = cfg.damage * mult * fall;
    const killed = bestBot.damage(dmg, bestPart);
    if (fx.blood) fx.blood(best.point);
    if (au.hit) au.hit(bestPart === 'head');
    const res = {bot: bestBot, part: bestPart, point: best.point.clone(), damage: dmg, killed, shooter};
    if (onHit) onHit(res, shooter, cfg);
    return res;
  }

  const pendingKills = []; // grenade kills; step(dt) returns + drains them

  function explode(g) {
    const p = g.mesh.position;
    if (fx.explosion) fx.explosion(p);
    if (au.explode) au.explode();
    const R = 6;
    let sawPlayer = false;
    for (const b of getBots()) {
      if (!b.alive || b === g.thrower) continue;
      if (g.thrower && g.thrower.team && b.team === g.thrower.team) continue; // no friendly fire
      // player entry has no group: position comes from getPlayer()
      const pos = b.isPlayer ? (getPlayer ? getPlayer().pos : null) : b.group.position;
      if (!pos) continue;
      if (b.isPlayer) sawPlayer = true;
      _v1.set(pos.x, pos.y + 1.2, pos.z);
      const d = _v1.distanceTo(p);
      if (d > R || !losClear(p, _v1)) continue;
      const dmg = 120 - 100 * (d / R);
      const died = b.damage(dmg, 'torso');
      if (died) {
        const ev = {bot: b, part: 'torso', point: p.clone(), damage: dmg, killed: true, shooter: g.thrower};
        if (onHit) onHit(ev, g.thrower, {id: 'grenade'});
        pendingKills.push({killer: g.thrower, victim: b, head: false, weapon: 'grenade'});
      }
    }
    // fallback: player not present in getBots() but getPlayer() provided
    if (!sawPlayer && getPlayer) {
      const pl = getPlayer();
      if (pl && pl.alive && !(g.thrower && g.thrower.team && pl.team === g.thrower.team)) {
        _v1.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z);
        const d = _v1.distanceTo(p);
        if (d <= R && losClear(p, _v1)) pl.damage(120 - 100 * (d / R));
      }
    }
    scene.remove(g.mesh);
  }

  function throwGrenade(from, dir, thrower) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({mesh, vel: _v1.copy(dir).multiplyScalar(13).add(new THREE.Vector3(0, 3.5, 0)).clone(),
      fuse: 1.6, thrower});
  }

  function step(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      const p = g.mesh.position;
      p.addScaledVector(g.vel, dt);
      // ground bounce / rest
      if (p.y < 0.09) {
        p.y = 0.09;
        if (Math.abs(g.vel.y) > 1.2) { g.vel.y = -g.vel.y * 0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
        else { g.vel.y = 0; g.vel.x *= (1 - 4 * dt); g.vel.z *= (1 - 4 * dt); }
      }
      // AABB bounce (walls full-height): reflect smallest-penetration axis
      for (let j = 0; j < colliders.length; j++) {
        const c = colliders[j];
        if (p.x > c.minX - 0.1 && p.x < c.maxX + 0.1 && p.z > c.minZ - 0.1 && p.z < c.maxZ + 0.1 && p.y < 3.2) {
          const dxl = p.x - (c.minX - 0.1), dxr = (c.maxX + 0.1) - p.x;
          const dzl = p.z - (c.minZ - 0.1), dzr = (c.maxZ + 0.1) - p.z;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) { p.x = c.minX - 0.1; g.vel.x = -Math.abs(g.vel.x) * 0.45; }
          else if (m === dxr) { p.x = c.maxX + 0.1; g.vel.x = Math.abs(g.vel.x) * 0.45; }
          else if (m === dzl) { p.z = c.minZ - 0.1; g.vel.z = -Math.abs(g.vel.z) * 0.45; }
          else { p.z = c.maxZ + 0.1; g.vel.z = Math.abs(g.vel.z) * 0.45; }
        }
      }
      if (g.fuse <= 0) { grenades.splice(i, 1); explode(g); }
    }
    if (!pendingKills.length) return null;
    const out = pendingKills.slice(); pendingKills.length = 0; return out;
  }

  return {fireHitscan, throwGrenade, step, grenades};
}
