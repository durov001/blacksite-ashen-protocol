// The objective: attackers plant an energy charge at Site A or B, defenders
// defuse it. Planting and defusing are channels — hold E, stay still, and any
// damage or movement cancels. A planted charge detonates after its fuse.
import * as THREE from 'three';

const PLANT_TIME = 3.5;
const DEFUSE_TIME = 5.0;
const FUSE_TIME = 40;

export function createObjectives({ scene, map, game, audio, effects }) {
  // The charge: a small box with a blinking beacon, hidden until planted.
  const charge = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.7 }),
  );
  body.position.y = 0.15;
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), beaconMat);
  beacon.position.y = 0.38;
  charge.add(body);
  charge.add(beacon);
  charge.visible = false;
  scene.add(charge);

  // Site rings: flat glowing discs marking the plant zones.
  const rings = {};
  for (const key of ['A', 'B']) {
    const site = map.sites[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.03, site.center.z);
    scene.add(ring);
    rings[key] = ring;
  }

  let actor = null; // who is currently channelling
  let channel = null; // 'plant' | 'defuse' | null
  let blink = 0;
  let lastBeep = 0;

  // Player exposes .pos (Vector3); bots expose .group.position — one accessor.
  function posOf(a) {
    return a.pos || a.group.position;
  }

  function inSite(pos, key) {
    const s = map.sites[key];
    const dx = pos.x - s.center.x;
    const dz = pos.z - s.center.z;
    return dx * dx + dz * dz <= s.radius * s.radius;
  }

  function siteOf(pos) {
    if (inSite(pos, 'A')) return 'A';
    if (inSite(pos, 'B')) return 'B';
    return null;
  }

  const obj = {
    get state() {
      return game.objective.state;
    },
    get site() {
      return game.objective.site;
    },
    get progress() {
      return game.objective.progress;
    },
    get timer() {
      return game.objective.timer;
    },
    // Who is currently channelling (for the coordinator to cancel stale channels).
    getChannel() {
      return channel ? { type: channel, actor } : null;
    },
    siteOf,
    // Is this actor allowed to start/continue a channel right now?
    canChannel(actorObj, isPlayer) {
      const team = isPlayer ? game.playerTeam : actorObj.team;
      const attackers = game.round <= 4 ? 'vanguard' : 'wraith';
      if (game.phase !== 'LIVE' || !actorObj.alive) return null;
      // Continue an in-progress channel (state flips to planting/defusing
      // on the first channel tick, so a fresh check would fail).
      if (channel === 'plant' && actor === actorObj && game.objective.state === 'planting') {
        return { type: 'plant', site: siteOf(posOf(actorObj)) };
      }
      if (channel === 'defuse' && actor === actorObj && game.objective.state === 'defusing') {
        return { type: 'defuse', site: game.objective.site };
      }
      if (game.objective.state === 'idle' && team === attackers) {
        const site = siteOf(posOf(actorObj));
        if (site && game.objective.carrier === actorObj) return { type: 'plant', site };
      }
      if (game.objective.state === 'planted' && team !== attackers) {
        const p = posOf(actorObj);
        const dx = p.x - charge.position.x;
        const dz = p.z - charge.position.z;
        if (dx * dx + dz * dz <= 2.2 * 2.2) return { type: 'defuse', site: game.objective.site };
      }
      return null;
    },
    // Advance a channel by dt; returns 'done' when it completes.
    channelStep(actorObj, type, dt) {
      if (channel !== type || actor !== actorObj) {
        channel = type;
        actor = actorObj;
        game.objective.progress = 0;
      }
      const need = type === 'plant' ? PLANT_TIME : DEFUSE_TIME;
      game.objective.progress += dt / need;
      game.objective.state = type === 'plant' ? 'planting' : 'defusing';
      if (game.objective.progress >= 1) {
        game.objective.progress = 1;
        if (type === 'plant') {
          const p = posOf(actorObj);
          const site = siteOf(p);
          game.objective.site = site;
          game.objective.state = 'planted';
          game.objective.timer = FUSE_TIME;
          game.objective.chargePos = { x: p.x, z: p.z };
          charge.position.set(p.x, 0, p.z);
          charge.visible = true;
          game.objective.carrier = null;
          if (audio) audio.plant();
          game.onEvent('plant', { site });
        } else {
          game.objective.state = 'defused';
          charge.visible = false;
          if (audio) audio.defuse();
          game.onEvent('defuse', { site: game.objective.site });
        }
        channel = null;
        actor = null;
        return 'done';
      }
      return 'progress';
    },
    // Damage or movement cancels a channel in progress.
    cancelChannel(actorObj) {
      if (actor !== actorObj) return;
      channel = null;
      actor = null;
      if (game.objective.state === 'planting') game.objective.state = 'idle';
      if (game.objective.state === 'defusing') game.objective.state = 'planted';
      game.objective.progress = 0;
    },
    dropChargeAt(pos) {
      // Carrier died: the charge stays where it fell; nearest attacker picks it up.
      game.objective.carrier = null;
      game.objective.dropPos = { x: pos.x, z: pos.z };
    },
    step(dt) {
      // Planted fuse countdown.
      if (game.objective.state === 'planted') {
        game.objective.timer -= dt;
        blink += dt;
        const fast = game.objective.timer < 10 ? 0.18 : 0.5;
        beaconMat.color.setHex(Math.floor(blink / fast) % 2 === 0 ? 0xff2a1a : 0x330000);
        if (game.objective.timer - lastBeep > (game.objective.timer < 10 ? 0.4 : 1.0)) {
          lastBeep = game.objective.timer;
          if (audio) audio.beep();
        }
        if (game.objective.timer <= 0) {
          game.objective.state = 'detonated';
          charge.visible = false;
          if (effects) effects.explosion(charge.position);
          if (audio) audio.explode();
          game.onEvent('detonate', { site: game.objective.site });
        }
      }
      // Pulse the site ring of the active site.
      for (const key of ['A', 'B']) {
        const active =
          (game.objective.state === 'idle' || game.objective.state === 'planting') &&
          game.objective.site !== key;
        rings[key].material.opacity = active ? 0.4 + 0.25 * Math.sin(performance.now() / 300) : 0.55;
        rings[key].material.color.setHex(
          game.objective.site === key && game.objective.state === 'planted' ? 0xff2a1a : 0xf0a830,
        );
      }
    },
    reset() {
      game.objective.state = 'idle';
      game.objective.site = null;
      game.objective.progress = 0;
      game.objective.timer = FUSE_TIME;
      game.objective.carrier = null;
      game.objective.dropPos = null;
      game.objective.chargePos = null;
      channel = null;
      actor = null;
      charge.visible = false;
      lastBeep = 0;
    },
  };
  return obj;
}
