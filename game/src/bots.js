// bots.js — low-poly humanoid bots + team spawning. Height 1.8.
import * as THREE from 'three';
import {WEAPONS} from './weapons.js';

const TEAM_COLOR = {vanguard: 0xe08a2a, wraith: 0x3a9ad9};
const _box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GEO = {
  leg: _box(0.16, 0.9, 0.2), torso: _box(0.5, 0.6, 0.28), vest: _box(0.54, 0.42, 0.34),
  head: _box(0.32, 0.3, 0.32), visor: _box(0.34, 0.1, 0.06), gun: _box(0.08, 0.12, 0.7),
  pad: _box(0.16, 0.1, 0.26), hood: _box(0.36, 0.09, 0.36),
};
GEO.leg.translate(0, -0.45, 0); // pivot at hip (y=0.9)
const MAT = {
  dark: new THREE.MeshLambertMaterial({color: 0x2b2e33}),
  pants: new THREE.MeshLambertMaterial({color: 0x23262b}),
  head: new THREE.MeshLambertMaterial({color: 0x3a3d42}),
  visor: new THREE.MeshLambertMaterial({color: 0x0d1117, emissive: 0x66ccff, emissiveIntensity: 0.7}),
  gun: new THREE.MeshLambertMaterial({color: 0x1c1e22}),
  vanguard: new THREE.MeshLambertMaterial({color: TEAM_COLOR.vanguard}),
  wraith: new THREE.MeshLambertMaterial({color: TEAM_COLOR.wraith}),
};

export function createBot(scene, o) {
  const g = new THREE.Group();
  const legL = new THREE.Mesh(GEO.leg, MAT.pants); legL.position.set(-0.1, 0.9, 0);
  const legR = new THREE.Mesh(GEO.leg, MAT.pants); legR.position.set(0.1, 0.9, 0);
  const torso = new THREE.Mesh(GEO.torso, MAT.dark); torso.position.y = 1.2;
  const vest = new THREE.Mesh(GEO.vest, MAT[o.team]); vest.position.y = 1.2;
  const head = new THREE.Mesh(GEO.head, MAT.head); head.position.y = 1.65;
  const visor = new THREE.Mesh(GEO.visor, MAT.visor); visor.position.set(0, 1.67, 0.16);
  const gun = new THREE.Mesh(GEO.gun, MAT.gun); gun.position.set(0.2, 1.28, 0.3);
  g.add(legL, legR, torso, vest, head, visor, gun);
  if (o.team === 'vanguard') {
    const p1 = new THREE.Mesh(GEO.pad, MAT.vanguard); p1.position.set(-0.32, 1.5, 0);
    const p2 = new THREE.Mesh(GEO.pad, MAT.vanguard); p2.position.set(0.32, 1.5, 0);
    g.add(p1, p2);
  } else {
    const hood = new THREE.Mesh(GEO.hood, MAT.wraith); hood.position.y = 1.83;
    g.add(hood);
  }
  const bot = {
    id: o.id, team: o.team, name: o.name, health: 100, alive: true,
    group: g, hitMeshes: [head, torso, vest, legL, legR],
    yaw: 0, pitch: 0, weaponId: o.weaponId || 'ar7', mag: 0, reserve: 0,
    state: 'SPAWN', path: [], pathIndex: 0, target: null,
    lastKnown: null, lastKnownTime: 0, reactAt: 0, burstLeft: 0,
    nextShotAt: 0, reloadAt: 0,
    _legL: legL, _legR: legR, _vest: vest, _walk: 0, _fall: 0,
    _lastX: 0, _lastZ: 0, _moving: false,
    setWeapon(id) {
      const cfg = WEAPONS[id] || WEAPONS.ar7;
      this.weaponId = cfg.id; this.mag = cfg.mag; this.reserve = cfg.reserve;
    },
    damage(amount) {
      if (!this.alive) return false;
      this.health -= amount;
      if (this.health <= 0) { this.health = 0; this.kill(); return true; }
      return false;
    },
    kill() {
      if (!this.alive) return;
      this.alive = false; this.state = 'DEAD'; this._fall = 0.0001; this.target = null;
    },
    respawn(spawn, weaponId) {
      this.health = 100; this.alive = true; this.state = 'SPAWN';
      this.group.position.set(spawn.x, 0, spawn.z);
      this.yaw = spawn.yaw || 0; this.pitch = 0;
      this.group.rotation.set(0, this.yaw, 0);
      this.group.visible = true;
      this.path = []; this.pathIndex = 0; this.target = null;
      this.lastKnown = null; this.lastKnownTime = 0;
      this.reactAt = 0; this.burstLeft = 0; this.nextShotAt = 0; this.reloadAt = 0;
      this._fall = 0; this._walk = 0;
      this._lastX = spawn.x; this._lastZ = spawn.z;
      if (weaponId) this.setWeapon(weaponId);
    },
    stepVisual(dt) {
      if (!this.alive) {
        if (this._fall < 1) {
          this._fall = Math.min(1, this._fall + dt * 3.2);
          this.group.rotation.x = -this._fall * Math.PI / 2;
          this.group.position.y = this._fall * 0.25;
        }
        return;
      }
      this.group.rotation.y = this.yaw;
      const dx = this.group.position.x - this._lastX, dz = this.group.position.z - this._lastZ;
      this._lastX = this.group.position.x; this._lastZ = this.group.position.z;
      const spd = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001);
      if (spd > 0.4) {
        this._walk += dt * 9;
        const s = Math.sin(this._walk) * 0.55;
        this._legL.rotation.x = s; this._legR.rotation.x = -s;
        this.group.position.y = Math.abs(Math.cos(this._walk)) * 0.04;
      } else {
        this._legL.rotation.x *= 0.8; this._legR.rotation.x *= 0.8;
        this.group.position.y = 0;
      }
    },
  };
  head.userData = {bot, part: 'head'};
  torso.userData = {bot, part: 'torso'};
  vest.userData = {bot, part: 'torso'};
  legL.userData = {bot, part: 'legs'};
  legR.userData = {bot, part: 'legs'};
  bot.setWeapon(bot.weaponId);
  const sp = o.spawn || {x: 0, z: 0, yaw: 0};
  bot.respawn(sp, bot.weaponId);
  scene.add(g);
  return bot;
}

const NAMES = ['HAVOC', 'GHOST', 'FALCON', 'REAPER', 'VIPER', 'JACKAL', 'ORION', 'NOVA', 'WOLF'];
// role loadouts: rifles mostly, 1 sniper + 1 SMG per team
const TEAM_LOADOUT = ['ar7', 'ar7', 'm40', 'vex9'];
const ENEMY_LOADOUT = ['ar7', 'ar7', 'ar7', 'm40', 'vex9'];

export function createBots(scene, map, game) {
  const list = [];
  const playerTeam = game.playerTeam || 'vanguard';
  const enemyTeam = playerTeam === 'vanguard' ? 'wraith' : 'vanguard';
  const mateSpawns = map.spawns[playerTeam];
  const foeSpawns = map.spawns[enemyTeam];
  for (let i = 0; i < 4; i++) {
    list.push(createBot(scene, {id: 'mate' + i, team: playerTeam, name: NAMES[i],
      spawn: mateSpawns[(i + 1) % mateSpawns.length], weaponId: TEAM_LOADOUT[i]}));
  }
  for (let i = 0; i < 5; i++) {
    list.push(createBot(scene, {id: 'foe' + i, team: enemyTeam, name: NAMES[4 + i],
      spawn: foeSpawns[i % foeSpawns.length], weaponId: ENEMY_LOADOUT[i]}));
  }
  function reset(round, playerTeamArg) {
    const pt = playerTeamArg || game.playerTeam || playerTeam;
    const et = pt === 'vanguard' ? 'wraith' : 'vanguard';
    const ms = map.spawns[pt], es = map.spawns[et];
    for (let i = 0; i < 4; i++) {
      const b = list[i];
      b.team = pt; b._vest.material = MAT[pt];
      b.respawn(ms[(i + 1) % ms.length], TEAM_LOADOUT[i]);
    }
    for (let i = 0; i < 5; i++) {
      const b = list[4 + i];
      b.team = et; b._vest.material = MAT[et];
      b.respawn(es[i % es.length], ENEMY_LOADOUT[i]);
    }
    if (game.objective) game.objective.carrier = null;
  }
  return {
    list,
    alive(team) {
      let n = 0;
      for (const b of list) if (b.alive && (!team || b.team === team)) n++;
      return n;
    },
    reset,
  };
}
