// bot-brain.js — bot AI: staggered perception, BFS nav, FSM, burst fire, objectives.
import * as THREE from 'three';
import {WEAPONS} from './weapons.js';

const _ray = new THREE.Raycaster();
const _eye = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _up2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SPEED = 4.0, CARRIER_SPEED = 5.2, FOV_COS = Math.cos(50 * Math.PI / 180), SIGHT = 70;

export function createBrain(o) {
  const list = o.bots.list || o.bots;
  const map = o.map, combat = o.combat, game = o.game, player = o.player;
  const solids = map.solidMeshes || [];
  const wps = map.waypoints || [];
  const wpById = new Map(wps.map(w => [w.id, w]));
  let now = 0, lastRound = -1, atkTeam = 'vanguard';
  const lastPos = new Map();

  const isAtk = b => b.team === atkTeam;
  const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  function nearestWp(x, z) {
    let best = null, bd = Infinity;
    for (const w of wps) {
      const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
      if (d < bd) { bd = d; best = w; }
    }
    return best;
  }
  function bfsPath(sx, sz, dx, dz) {
    const s = nearestWp(sx, sz), t = nearestWp(dx, dz);
    const direct = [{x: dx, z: dz}];
    if (!s || !t || s === t) return direct;
    const prev = new Map([[s.id, null]]), q = [s];
    while (q.length) {
      const c = q.shift();
      if (c === t) break;
      for (const n of c.neighbors || []) {
        if (!prev.has(n) && wpById.has(n)) { prev.set(n, c.id); q.push(wpById.get(n)); }
      }
    }
    if (!prev.has(t.id)) return direct;
    const out = [];
    let cur = t.id;
    while (cur) { const w = wpById.get(cur); out.unshift({x: w.x, z: w.z}); cur = prev.get(cur); }
    out.push({x: dx, z: dz});
    return out;
  }
  function setPath(bot, dx, dz) {
    const p = bot.group.position;
    bot.path = bfsPath(p.x, p.z, dx, dz);
    bot.pathIndex = 0;
    while (bot.pathIndex < bot.path.length &&
      dist2d(p.x, p.z, bot.path[bot.pathIndex].x, bot.path[bot.pathIndex].z) < 0.6) bot.pathIndex++;
  }
  function faceToward(bot, x, z, dt) {
    const p = bot.group.position;
    const want = Math.atan2(x - p.x, z - p.z);
    let d = want - bot.yaw;
    d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const maxTurn = 6 * dt;
    bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, d));
  }
  function moveAlongPath(bot, dt) {
    const p = bot.group.position;
    // The carrier sprints to its site — planting is a race against the round
    // clock, and the carrier is the one bot that must get there.
    const obj = game.objective || {};
    const speed = (obj.carrier === bot && !obj.site) ? CARRIER_SPEED : SPEED;
    while (bot.pathIndex < bot.path.length) {
      const wp = bot.path[bot.pathIndex];
      const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { bot.pathIndex++; continue; }
      const step = speed * dt;
      if (d <= step) { p.x = wp.x; p.z = wp.z; bot.pathIndex++; }
      else { p.x += dx / d * step; p.z += dz / d * step; faceToward(bot, wp.x, wp.z, dt); }
      return false;
    }
    return true;
  }
  function losClear(from, to, dist) {
    _dir.subVectors(to, from).normalize();
    _ray.set(from, _dir); _ray.far = dist;
    const hits = _ray.intersectObjects(solids, false);
    return hits.length === 0 || hits[0].distance > dist - 0.15;
  }
  function targetFeet(ent) { return ent === player ? player.pos : ent.group.position; }
  function targetSpeed(ent) {
    const tp = targetFeet(ent);
    const prev = lastPos.get(ent);
    let s = 0;
    if (prev) {
      const dt = now - prev.t;
      if (dt > 0.01) s = Math.min(7, Math.hypot(tp.x - prev.x, tp.z - prev.z) / dt);
    }
    lastPos.set(ent, {x: tp.x, z: tp.z, t: now});
    return s;
  }

  function perceive(bot) {
    const p = bot.group.position;
    // hearing: sound events within radius -> last known position
    for (const s of game.sounds || []) {
      if (dist2d(p.x, p.z, s.x, s.z) < (s.radius || 15)) {
        bot.lastKnown = {x: s.x, z: s.z}; bot.lastKnownTime = now;
      }
    }
    if (now - bot.lastKnownTime > 6) bot.lastKnown = null;
    // vision: FOV 100deg + LOS raycast to enemy chest
    _eye.set(p.x, p.y + 1.5, p.z);
    const fx = Math.sin(bot.yaw), fz = Math.cos(bot.yaw);
    let best = null, bestD = Infinity;
    const consider = (ent) => {
      const tp = targetFeet(ent);
      const dx = tp.x - p.x, dz = tp.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > SIGHT || d < 0.01 || d >= bestD) return;
      if ((fx * dx + fz * dz) / d < FOV_COS) return;
      _aim.set(tp.x, tp.y + 1.3, tp.z);
      if (!losClear(_eye, _aim, _eye.distanceTo(_aim))) return;
      best = ent; bestD = d;
    };
    for (const e of list) if (e.alive && e.team !== bot.team) consider(e);
    if (player && player.alive && game.playerTeam !== bot.team) consider(player);
    if (best) {
      if (bot.target !== best) { // first sight: human-like reaction delay
        bot.reactAt = now + 0.25 + Math.random() * 0.2;
        bot.burstLeft = 0; bot.nextShotAt = 0;
      }
      bot.target = best;
      const tp = targetFeet(best);
      bot.lastKnown = {x: tp.x, z: tp.z}; bot.lastKnownTime = now;
    } else if (bot.target && now - bot.lastKnownTime > 1.2) {
      bot.target = null;
    }
  }

  function fireAt(bot) {
    const cfg = WEAPONS[bot.weaponId] || WEAPONS.ar7;
    if (now < bot.reactAt || bot.mag <= 0) return;
    if (bot.burstLeft <= 0) {
      if (now < bot.nextShotAt) return;
      bot.burstLeft = cfg.id === 'm40' ? 1 : 3 + Math.floor(Math.random() * 3);
    }
    if (now < bot.nextShotAt) return;
    const p = bot.group.position;
    const tp = targetFeet(bot.target);
    _eye.set(p.x, p.y + 1.5, p.z);
    _aim.set(tp.x, tp.y + 1.3, tp.z);
    const dist = _eye.distanceTo(_aim);
    // Aim error grows with distance + target speed: bots miss often enough
    // that rounds breathe (~0.25-0.4 hit @ mid) instead of ending in seconds.
    let err = 0.035 + dist * 0.0016 + targetSpeed(bot.target) * 0.012;
    if (cfg.id === 'm40') err *= 0.45;
    if (cfg.pellets > 1) err = Math.max(err, 0.045);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    for (let k = 0; k < cfg.pellets; k++) {
      _dir.subVectors(_aim, _eye).normalize();
      _side.crossVectors(_dir, UP).normalize();
      _up2.crossVectors(_side, _dir);
      _dir.addScaledVector(_side, gauss() * err).addScaledVector(_up2, gauss() * err * 0.7).normalize();
      const res = combat.fireHitscan(_eye, _dir, cfg, bot);
      if (res && res.killed) {
        if (game.onEvent) game.onEvent('kill', {killer: bot, victim: res.bot,
          head: res.part === 'head', weapon: cfg.id});
        bot.target = null;
        break;
      }
    }
    bot.mag--;
    if (game.sounds) game.sounds.push({x: p.x, z: p.z, radius: 22, time: now});
    bot.burstLeft--;
    bot.nextShotAt = now + cfg.fireMs / 1000;
    if (bot.burstLeft <= 0) bot.nextShotAt = now + 0.6 + Math.random() * 0.6;
    if (bot.mag <= 0) { bot.state = 'RELOAD'; bot.reloadAt = 0; }
  }

  function siteCenter(site) {
    const s = map.sites[site];
    return s ? s.center : {x: 0, z: 0};
  }
  function roleDest(bot) {
    if (bot._site === 'A' || bot._site === 'B') return siteCenter(bot._site);
    return isAtk(bot) ? {x: 0, z: 6} : {x: 0, z: -6};
  }
  function atSite(bot, site) {
    const c = siteCenter(site), p = bot.group.position;
    return dist2d(p.x, p.z, c.x, c.z) < 4.5;
  }
  function assignRoles() {
    atkTeam = game.attackers || (game.round <= 4 ? 'vanguard' : 'wraith');
    const pattern = ['A', 'A', 'B', 'B', 'mid'];
    let ai = 0, di = 0;
    list.forEach((b, i) => {
      b._site = isAtk(b) ? pattern[ai++ % 5] : pattern[di++ % 5];
      b._goDefuse = false; b._retreatFor = null;
      b._nextPer = i * 0.013; // stagger perception across ticks
    });
  }
  function goDefuse(bot) {
    // Head for the charge itself (planted wherever the planter stood), not the site centre.
    const cp = game.objective.chargePos;
    const dest = cp ? { x: cp.x, z: cp.z } : siteCenter(game.objective.site);
    if (!bot._goDefuse) { setPath(bot, dest.x, dest.z); bot._goDefuse = true; }
    bot.state = 'MOVE';
  }
  function atCharge(bot) {
    const cp = game.objective.chargePos;
    const dest = cp ? { x: cp.x, z: cp.z } : siteCenter(game.objective.site);
    const p = bot.group.position;
    return dist2d(p.x, p.z, dest.x, dest.z) < 2.2;
  }
  function goRetreat(bot) {
    const c = siteCenter(game.objective.site);
    const key = game.objective.site + ':' + game.round;
    bot._retreatFor = key;
    // cover waypoint 8-16m from the site, biased toward attacker spawn (0,17)
    let best = null, bd = Infinity;
    for (const w of wps) {
      const dSite = dist2d(w.x, w.z, c.x, c.z);
      if (dSite < 8 || dSite > 16) continue;
      const dSpawn = dist2d(w.x, w.z, 0, 17);
      if (dSpawn < bd) { bd = dSpawn; best = w; }
    }
    if (best) setPath(bot, best.x, best.z);
    bot.state = 'RETREAT';
  }
  function maintainCarrier() {
    const obj = game.objective;
    if (!obj || (obj.state !== 'idle' && obj.state !== 'planting')) return;
    const c = obj.carrier;
    if (c && c.alive) return;
    // carrier down (or none): nearest alive attacker bot picks up the charge
    // (nearest to where it was dropped, or mid if it was never carried).
    const drop = obj.dropPos || { x: 0, z: 0 };
    let best = null, bd = Infinity;
    for (const b of list) {
      if (!b.alive || !isAtk(b)) continue;
      const d = dist2d(b.group.position.x, b.group.position.z, drop.x, drop.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      obj.carrier = best;
      // The new carrier heads for the nearest site, whatever its old role was
      // (a mid bot would otherwise never plant — PLANT needs a site role).
      const bp = best.group.position;
      const da = dist2d(bp.x, bp.z, map.sites.A.center.x, map.sites.A.center.z);
      const db = dist2d(bp.x, bp.z, map.sites.B.center.x, map.sites.B.center.z);
      best._site = da <= db ? 'A' : 'B';
      const dest = map.sites[best._site].center;
      setPath(best, dest.x, dest.z);
      best.state = 'MOVE';
    }
  }

  function update(dt) {
    now += dt;
    if (game.round !== lastRound) { lastRound = game.round; assignRoles(); }
    if (game.phase !== 'LIVE') return;
    const obj = game.objective || {state: 'idle'};
    const planted = obj.state === 'planted';
    maintainCarrier();
    for (const bot of list) {
      if (!bot.alive) { bot.state = 'DEAD'; continue; }
      if (now >= (bot._nextPer || 0)) { perceive(bot); bot._nextPer = now + 0.12; }
      const p = bot.group.position;
      switch (bot.state) {
        case 'SPAWN': {
          const d = roleDest(bot);
          setPath(bot, d.x, d.z);
          bot.state = 'MOVE';
          break;
        }
        case 'MOVE': {
          // The carrier pushes to its site instead of stopping to fight —
          // planting is the job; teammates cover. Only a close enemy (<8m)
          // makes the carrier stop and shoot.
          const carrierPushing = !planted && obj.carrier === bot && bot._site !== 'mid' && !atSite(bot, bot._site);
          const closeFoe = bot.target && dist2d(p.x, p.z, targetFeet(bot.target).x, targetFeet(bot.target).z) < 8;
          if (bot.target && (!carrierPushing || closeFoe)) { bot.state = 'ENGAGE'; break; }
          if (planted && !isAtk(bot)) { goDefuse(bot); break; }
          if (planted && isAtk(bot) && bot._retreatFor !== obj.site + ':' + game.round) { goRetreat(bot); break; }
          if (bot._goDefuse && planted && atCharge(bot)) {
            bot.state = 'DEFUSE'; bot._goDefuse = false; bot.path = []; bot._defGrace = 2; break;
          }
          if (!planted && obj.carrier === bot && (bot._site === 'A' || bot._site === 'B') && atSite(bot, bot._site)) {
            bot.state = 'PLANT'; bot.path = []; bot._plantGrace = 2; break;
          }
          if (moveAlongPath(bot, dt)) {
            if (bot._goDefuse && planted) { bot.state = 'DEFUSE'; bot._goDefuse = false; bot._defGrace = 2; }
            else if (!planted && obj.carrier === bot && bot._site !== 'mid' && atSite(bot, bot._site)) { bot.state = 'PLANT'; bot._plantGrace = 2; }
            else bot.state = 'HOLD';
          }
          break;
        }
        case 'HOLD': {
          if (bot.target) { bot.state = 'ENGAGE'; break; }
          if (planted && !isAtk(bot)) { goDefuse(bot); break; }
          if (planted && isAtk(bot) && bot._retreatFor !== obj.site + ':' + game.round) { goRetreat(bot); break; }
          if (!planted && obj.carrier === bot && bot._site !== 'mid' && atSite(bot, bot._site)) { bot.state = 'PLANT'; bot._plantGrace = 2; break; }
          // Carrier holding away from its site (e.g. after a fight diverted
          // it to chase lastKnown): re-path to the site — the objective
          // outranks hunting.
          if (!planted && obj.carrier === bot && bot._site !== 'mid' && !atSite(bot, bot._site)) {
            const dest = siteCenter(bot._site);
            setPath(bot, dest.x, dest.z);
            bot.state = 'MOVE';
            break;
          }
          if (bot.lastKnown && now - bot.lastKnownTime < 6 &&
            dist2d(p.x, p.z, bot.lastKnown.x, bot.lastKnown.z) > 2) {
            setPath(bot, bot.lastKnown.x, bot.lastKnown.z); bot.state = 'MOVE'; break;
          }
          // hold angle: face the enemy spawn side
          faceToward(bot, 0, isAtk(bot) ? -17 : 17, dt);
          break;
        }
        case 'ENGAGE': {
          if (!bot.target) {
            if (bot.lastKnown && now - bot.lastKnownTime < 4) {
              setPath(bot, bot.lastKnown.x, bot.lastKnown.z); bot.state = 'MOVE';
            } else bot.state = 'HOLD';
            break;
          }
          if (bot.mag <= 0) { bot.state = 'RELOAD'; bot.reloadAt = 0; break; }
          const tp = targetFeet(bot.target);
          faceToward(bot, tp.x, tp.z, dt);
          fireAt(bot);
          break;
        }
        case 'RELOAD': {
          const cfg = WEAPONS[bot.weaponId] || WEAPONS.ar7;
          if (bot.reloadAt === 0) bot.reloadAt = now + cfg.reloadMs / 1000;
          if (bot.target) { const tp = targetFeet(bot.target); faceToward(bot, tp.x, tp.z, dt); }
          if (now >= bot.reloadAt) {
            const take = Math.min(cfg.mag - bot.mag, bot.reserve);
            bot.mag += take; bot.reserve -= take; bot.reloadAt = 0;
            bot.state = bot.target ? 'ENGAGE' : (bot.path.length && bot.pathIndex < bot.path.length ? 'MOVE' : 'HOLD');
          }
          break;
        }
        case 'PLANT': {
          // Stand still in the site; main.js drives the plant channel each tick.
          // The grace ticks let the channel start before we judge it: while it
          // runs (state planting) we keep planting even with a foe in sight.
          // Damage cancels the channel (state back to idle) — then fight back.
          if (planted) { goRetreat(bot); break; }
          if (bot._plantGrace > 0) bot._plantGrace--;
          else if (obj.state === 'idle' && bot.target) { bot.state = 'ENGAGE'; break; }
          if (obj.state !== 'idle' && obj.state !== 'planting') bot.state = 'HOLD';
          break;
        }
        case 'DEFUSE': {
          // Stand still at the charge; main.js drives the defuse channel each tick.
          // Same grace logic as PLANT: keep defusing while the channel runs.
          if (!planted) { bot.state = 'HOLD'; break; }
          if (bot._defGrace > 0) bot._defGrace--;
          else if (obj.state === 'planted' && bot.target) { bot.state = 'ENGAGE'; break; }
          break;
        }
        case 'RETREAT': {
          if (bot.target) { bot.state = 'ENGAGE'; break; }
          if (moveAlongPath(bot, dt)) bot.state = 'HOLD';
          break;
        }
      }
    }
    // separation steering: push apart bots within 1m
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.group.position.x - a.group.position.x;
        const dz = b.group.position.z - a.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 1 && d > 0.001) {
          const push = (1 - d) / 2, nx = dx / d, nz = dz / d;
          a.group.position.x -= nx * push; a.group.position.z -= nz * push;
          b.group.position.x += nx * push; b.group.position.z += nz * push;
        }
      }
    }
  }

  return {update};
}
