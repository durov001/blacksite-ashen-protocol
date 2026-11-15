// BLACKSITE: ASHEN PROTOCOL — boot, wiring, fixed-step loop, screenshot scenes.
// The simulation runs at a fixed 60 Hz, apart from rendering. All game systems
// (player, bots, combat, rounds, objectives, economy) meet here through the
// shared `game` context; main.js owns the camera, the shooting input, the
// viewmodel gun, and the deterministic ?shot= scenes used for screenshots.
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createBrain } from './bot-brain.js';
import { createObjectives } from './objectives.js';
import { createRounds } from './rounds.js';
import { createEconomy } from './economy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

// Deterministic RNG for screenshot scenes (gameplay uses Math.random).
function mulberry32(a) {
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed * 7919 + 13);
const rand = shot ? rng : Math.random;

// ---- shared game context (one place for state; rounds.js owns transitions) ----
const game = {
  phase: 'MENU',
  round: 1,
  maxRounds: 8,
  winRounds: 5,
  score: { vanguard: 0, wraith: 0 },
  playerTeam: 'vanguard',
  timeLeft: 100,
  buyTimeLeft: 15,
  money: 800,
  lossStreak: 0,
  objective: { state: 'idle', site: null, progress: 0, timer: 40, carrier: null, dropPos: null },
  sounds: [],
  kills: [],
  onEvent: handleEvent,
};

// ---- modules ----
const engine = createEngine(document.getElementById('game'));
const { scene, camera } = engine;
const map = createMap(scene);
const hud = createHud();
const audio = createAudio();
const effects = createEffects(scene);
const input = createInput(engine.renderer.domElement, onLockChange);
const player = createPlayer(map.colliders, map.bounds);
const arsenal = createArsenal();
const economy = createEconomy(game);
const objectives = createObjectives({ scene, map, game, audio, effects });
const bots = createBots(scene, map, game);

// The player as a combat target: invisible hit boxes that follow the body,
// shaped like a bot entry so combat.js treats the player like any bot.
const playerEntry = {
  isPlayer: true,
  name: 'YOU',
  get team() {
    return game.playerTeam;
  },
  get alive() {
    return player.alive;
  },
  get health() {
    return player.health;
  },
  hitMeshes: [],
  damage(amount) {
    return player.damage(amount);
  },
};
for (const [part, y0, y1] of [['legs', 0, 0.9], ['torso', 0.9, 1.5], ['head', 1.5, 1.8]]) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, y1 - y0, 0.45),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  mesh.userData = { bot: playerEntry, part };
  mesh.position.y = (y0 + y1) / 2;
  scene.add(mesh);
  playerEntry.hitMeshes.push(mesh);
}

const combat = createCombat({
  scene,
  solidMeshes: map.solidMeshes,
  colliders: map.colliders,
  getBots: () => bots.list.concat([playerEntry]),
  getPlayer: () => ({ pos: player.pos, damage: (a) => player.damage(a) }),
  effects,
  audio,
  // Taking damage cancels a plant/defuse channel.
  onHit: (res) => {
    if (!res || !res.bot) return;
    const ch = objectives.getChannel();
    if (!ch) return;
    if (ch.actor === res.bot || (res.bot.isPlayer && ch.actor === player)) {
      objectives.cancelChannel(ch.actor);
    }
  },
});
const brain = createBrain({ bots, map, combat, game, player });
const rounds = createRounds(game, { bots, player, objectives, economy, arsenal, hud, audio, map });

// ---- viewmodel: a box-built gun per weapon class, attached to the camera ----
const viewmodel = new THREE.Group();
camera.add(viewmodel);
scene.add(camera);
// A small warm light on the camera keeps the viewmodel readable (the scene's
// dusk lights leave the gun in shadow) and doubles as a subtle tactical light.
const viewLight = new THREE.PointLight(0xffd9a0, 3, 6, 2);
viewLight.position.set(0.3, 0.3, 0.2);
camera.add(viewLight);
const gunMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.45, metalness: 0.75 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.6 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.8, metalness: 0.2 });
function box(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || gunMat);
  m.position.set(x, y, z);
  return m;
}
function buildViewmodel(id) {
  viewmodel.clear();
  const g = new THREE.Group();
  if (id === 'kx45') {
    g.add(box(0.05, 0.07, 0.22, 0, 0, -0.1));
    g.add(box(0.045, 0.11, 0.06, 0, -0.08, 0.02, gripMat));
    g.add(box(0.02, 0.02, 0.05, 0, 0.045, -0.16, accentMat));
  } else if (id === 'vex9') {
    g.add(box(0.055, 0.08, 0.3, 0, 0, -0.14));
    g.add(box(0.04, 0.13, 0.05, 0, -0.1, -0.08, gripMat));
    g.add(box(0.05, 0.06, 0.12, 0, -0.02, -0.28));
    g.add(box(0.02, 0.03, 0.04, 0, 0.055, -0.12, accentMat));
  } else if (id === 'br12') {
    g.add(box(0.07, 0.09, 0.5, 0, 0, -0.24));
    g.add(box(0.06, 0.07, 0.2, 0, -0.01, -0.42));
    g.add(box(0.05, 0.12, 0.07, 0, -0.09, 0.03, gripMat));
    g.add(box(0.05, 0.05, 0.16, 0, 0.01, 0.12));
  } else if (id === 'm40') {
    g.add(box(0.05, 0.07, 0.62, 0, 0, -0.3));
    g.add(box(0.04, 0.05, 0.12, 0, 0.06, -0.18));
    g.add(box(0.045, 0.11, 0.06, 0, -0.08, 0.0, gripMat));
    g.add(box(0.05, 0.09, 0.18, 0, -0.01, 0.1));
    g.add(box(0.02, 0.02, 0.06, 0, 0.05, -0.3, accentMat));
  } else {
    // ar7
    g.add(box(0.055, 0.08, 0.46, 0, 0, -0.22));
    g.add(box(0.04, 0.14, 0.06, 0, -0.1, -0.12, gripMat));
    g.add(box(0.05, 0.07, 0.1, 0, -0.03, -0.36));
    g.add(box(0.045, 0.1, 0.16, 0, -0.01, 0.1));
    g.add(box(0.02, 0.03, 0.05, 0, 0.055, -0.2, accentMat));
  }
  g.position.set(0.22, -0.2, -0.35);
  viewmodel.add(g);
  return g;
}
let gunGroup = buildViewmodel('kx45');
let gunKick = 0;
let bobPhase = 0;

// ---- shooting ----
const aimDir = new THREE.Vector3();
const shootOrigin = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
let lastHp = 100;
let wasAlive = true;
let interactHeld = false;

function spreadFor(cfg) {
  // Stopping to aim pays: spread grows with speed and airtime, shrinks crouched or ADS.
  let s = cfg.spreadHip;
  const speed = player.groundSpeed();
  if (speed > 0.5) s += cfg.spreadMove * Math.min(1, speed / 6);
  if (!player.grounded) s = Math.max(s, cfg.spreadAir);
  if (player.crouched) s = Math.min(s, cfg.spreadCrouch + cfg.spreadMove * Math.min(1, speed / 6));
  if (input.ads) s = cfg.spreadAds + (s - cfg.spreadAds) * 0.25;
  return s;
}

function firePlayerWeapon(now) {
  const cfg = arsenal.currentCfg();
  if (!arsenal.canFire(now)) return;
  if (arsenal.mag[arsenal.current] <= 0) {
    audio.dryFire();
    arsenal.startReload(now);
    return;
  }
  if (!arsenal.consumeRound()) return;
  camera.getWorldDirection(aimDir);
  shootOrigin.copy(camera.position);
  const spread = spreadFor(cfg);
  let anyHit = false;
  let anyKill = false;
  let headHit = false;
  for (let p = 0; p < cfg.pellets; p++) {
    tmpVec.set(
      aimDir.x + (rand() * 2 - 1) * spread,
      aimDir.y + (rand() * 2 - 1) * spread,
      aimDir.z + (rand() * 2 - 1) * spread,
    ).normalize();
    const hit = combat.fireHitscan(shootOrigin, tmpVec, cfg, { isPlayer: true, team: game.playerTeam });
    if (hit && hit.bot) {
      anyHit = true;
      if (hit.part === 'head') headHit = true;
      if (hit.killed) {
        anyKill = true;
        reportKill('YOU', hit.bot, hit.part === 'head', cfg.id);
      }
    }
  }
  // Muzzle flash at the gun tip (combat already draws the tracer), recoil kick.
  tmpVec.copy(shootOrigin).addScaledVector(aimDir, 0.6);
  effects.muzzle(tmpVec, aimDir);
  player.recoil(cfg.recoilPitch * (0.9 + rand() * 0.2), (rand() * 2 - 1) * cfg.recoilYaw);
  gunKick = Math.min(0.09, gunKick + 0.03);
  audio.shot(cfg.id);
  if (anyHit) hud.hitmarker(headHit, anyKill);
  game.sounds.push({ x: player.pos.x, z: player.pos.z, radius: 26 });
  hud.setAmmo(arsenal.mag[arsenal.current], arsenal.reserve[arsenal.current]);
  if (arsenal.mag[arsenal.current] === 0) arsenal.startReload(now);
}

function throwGrenade() {
  if (arsenal.grenades <= 0 || game.phase !== 'LIVE' || !player.alive) return;
  arsenal.grenades -= 1;
  camera.getWorldDirection(aimDir);
  shootOrigin.copy(camera.position);
  combat.throwGrenade(shootOrigin, aimDir, { isPlayer: true, team: game.playerTeam });
  audio.click();
  hud.setWeapon(arsenal.currentCfg().name, arsenal.grenades);
}

function reportKill(killerName, victim, head, weaponId) {
  const killerTeam = killerName === 'YOU' ? game.playerTeam : victim.team === 'vanguard' ? 'wraith' : 'vanguard';
  game.kills.push({ killer: killerName, victim: victim.name, head, weapon: weaponId });
  hud.killfeed({
    killer: killerName,
    killerTeam,
    victim: victim.name,
    victimTeam: victim.team,
    head,
    weapon: WEAPONS[weaponId] ? WEAPONS[weaponId].name : weaponId,
  });
  if (killerName === 'YOU') {
    economy.awardKill();
    audio.kill();
    hud.setMoney(game.money);
  }
  if (game.objective.carrier === victim) {
    objectives.dropChargeAt(victim.pos || victim.group.position);
  }
  if (victim.isPlayer) {
    hud.banner('YOU DIED', 'Wait for the next round');
  }
}

function handleEvent(name, data) {
  if (name === 'kill') {
    reportKill(data.killer.name, data.victim, data.head, data.weapon);
  } else if (name === 'plant') {
    hud.banner('CHARGE PLANTED', `Site ${data.site} — ${FUSE_SECONDS}s to detonation`);
    if (game.objective.carrier === player) {
      // Player planted: handled by channel completion; reward here.
    }
  } else if (name === 'defuse') {
    hud.banner('CHARGE DEFUSED', `Site ${data.site} secured`);
  } else if (name === 'detonate') {
    hud.banner('CHARGE DETONATED', `Site ${data.site} destroyed`);
  } else if (name === 'roundEnd') {
    hud.setScore(game.score.vanguard, game.score.wraith, game.round);
  }
}
const FUSE_SECONDS = 40;

// ---- input actions (edge-triggered, drained each step) ----
function handleActions(now) {
  if (game.phase !== 'LIVE' && game.phase !== 'BUY') return;
  if (input.consumeKey('KeyR') && game.phase === 'LIVE') {
    arsenal.startReload(now);
    audio.reload();
  }
  if (input.consumeKey('KeyG') || input.consumeKey('KeyQ')) throwGrenade();
  if (input.consumeKey('KeyB') && game.phase === 'BUY') {
    if (hud.isBuyOpen()) {
      if (input.locked) {
        input.releaseLock(); // menu is open but the mouse is captured: free it to shop
      } else {
        hud.showBuy(false);
        input.requestLock();
      }
    } else {
      hud.showBuy(true);
      hud.refreshBuy(game.money, arsenal.owned);
      input.releaseLock();
    }
  }
  if (input.consumeKey('KeyM')) audio.setMuted(!audio.muted);
  const switchKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
  for (let i = 0; i < switchKeys.length; i++) {
    if (input.consumeKey(switchKeys[i])) {
      const id = arsenal.owned[i];
      if (id && arsenal.switchTo(id)) {
        gunGroup = buildViewmodel(id);
        audio.click();
        hud.setWeapon(arsenal.currentCfg().name, arsenal.grenades);
        hud.setAmmo(arsenal.mag[id], arsenal.reserve[id]);
      }
    }
  }
}

// Interact (E): plant/defuse channel. Holding E channels; moving or taking
// damage cancels — objectives.js owns the channel state.
function handleInteract(dt) {
  const want = input.keys.has('KeyE');
  if (!want || game.phase !== 'LIVE' || !player.alive) {
    if (interactHeld) {
      objectives.cancelChannel(player);
      interactHeld = false;
    }
    return;
  }
  const ch = objectives.canChannel(player, true);
  if (!ch) {
    if (interactHeld) {
      objectives.cancelChannel(player);
      interactHeld = false;
    }
    return;
  }
  // Moving breaks the channel.
  if (player.groundSpeed() > 0.4) {
    objectives.cancelChannel(player);
    interactHeld = false;
    return;
  }
  interactHeld = true;
  const done = objectives.channelStep(player, ch.type, dt);
  if (done === 'done') {
    interactHeld = false;
    if (ch.type === 'plant') {
      economy.awardPlant();
      hud.setMoney(game.money);
    }
  }
}

function syncCamera() {
  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  // ADS: narrow the FOV and pull the gun to center.
  const cfg = arsenal.currentCfg();
  const targetFov = input.ads && player.alive ? cfg.adsFov : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  // Viewmodel bob + recoil kick.
  const speed = player.groundSpeed();
  if (speed > 0.5 && player.grounded) bobPhase += 0.09 * Math.min(1, speed / 4);
  gunKick *= 0.82;
  const adsX = input.ads ? 0 : 0.22;
  const adsY = input.ads ? -0.14 : -0.2;
  gunGroup.position.x += (adsX - gunGroup.position.x) * 0.3;
  gunGroup.position.y = adsY + Math.sin(bobPhase * 2) * 0.006 * Math.min(1, speed / 4);
  gunGroup.position.z = -0.35 + gunKick + Math.cos(bobPhase) * 0.004 * Math.min(1, speed / 4);
}

function syncPlayerHitboxes() {
  for (const mesh of playerEntry.hitMeshes) {
    mesh.position.set(player.pos.x, mesh.position.y, player.pos.z);
    // Crouching lowers the hit boxes.
    const scale = player.crouched ? 0.72 : 1;
    mesh.scale.y = scale;
  }
}

function syncHud() {
  hud.setHealth(player.health);
  hud.setAmmo(arsenal.mag[arsenal.current], arsenal.reserve[arsenal.current]);
  hud.setTimer(game.phase === 'BUY' ? game.buyTimeLeft : game.timeLeft, game.phase);
  hud.setScore(game.score.vanguard, game.score.wraith, game.round);
  hud.setMoney(game.money);
  hud.setTeam(game.playerTeam);
  hud.objective(game.objective.state, game.objective.progress, game.objective.timer, game.objective.site);
  // Crosshair spreads with inaccuracy so the player feels the gunplay.
  const spreadPx = 4 + spreadFor(arsenal.currentCfg()) * 900;
  hud.setCrosshairSpread(spreadPx);
  // Interact prompt.
  if (game.phase === 'LIVE' && player.alive) {
    const ch = objectives.canChannel(player, true);
    if (ch) hud.prompt(ch.type === 'plant' ? `[E] PLANT CHARGE @ ${ch.site}` : '[E] DEFUSE CHARGE');
    else if (game.objective.carrier === player && objectives.siteOf(player.pos)) hud.prompt('You carry the charge — [E] to plant');
    else hud.prompt(null);
  } else {
    hud.prompt(null);
  }
  // Damage flash when health drops.
  if (player.health < lastHp) hud.damageFlash();
  lastHp = player.health;
  if (wasAlive && !player.alive) {
    wasAlive = false;
  } else if (!wasAlive && player.alive) {
    wasAlive = true;
    lastHp = 100;
  }
}

// ---- fixed-step simulation ----
let prevPhase = 'MENU';
function step(dt) {
  const now = performance.now();
  // Entering BUY frees the mouse so the player can shop (once per transition).
  if (game.phase !== prevPhase) {
    if (game.phase === 'BUY' && input.locked) input.releaseLock();
    prevPhase = game.phase;
  }
  // LIVE without mouse capture: prompt the player to click.
  if (game.phase === 'LIVE' && !input.locked && !shot) hud.setHint('CLICK TO AIM');
  handleActions(now);
  if (game.phase === 'LIVE' || game.phase === 'BUY') {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (player.alive) player.step(dt, input.keys);
    if (game.phase === 'LIVE' && player.alive) {
      if (input.firing) firePlayerWeapon(now);
      handleInteract(dt);
    }
    if (arsenal.reloadStep(now)) {
      hud.setAmmo(arsenal.mag[arsenal.current], arsenal.reserve[arsenal.current]);
    }
    brain.update(dt);
    // Bot visuals: walk bob, facing (group.rotation.y = yaw), death fall.
    // The brain moves bots but never touches their groups — this is the only
    // place their orientation and fall animation advance.
    for (const bot of bots.list) bot.stepVisual(dt);
    // Drive bot plant/defuse channels: the brain decides WHEN (PLANT/DEFUSE
    // states), objectives.js owns HOW (progress, cancel, completion).
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      if (bot.state === 'PLANT') {
        const ch = objectives.canChannel(bot, false);
        if (ch && ch.type === 'plant') objectives.channelStep(bot, 'plant', dt);
        else objectives.cancelChannel(bot);
      } else if (bot.state === 'DEFUSE') {
        const ch = objectives.canChannel(bot, false);
        if (ch && ch.type === 'defuse') objectives.channelStep(bot, 'defuse', dt);
        else objectives.cancelChannel(bot);
      }
    }
    // A bot that left its channel state (e.g. to fight) drops the channel.
    const ch = objectives.getChannel();
    if (ch && ch.actor !== player) {
      if ((ch.type === 'plant' && ch.actor.state !== 'PLANT') || (ch.type === 'defuse' && ch.actor.state !== 'DEFUSE')) {
        objectives.cancelChannel(ch.actor);
      }
    }
    const gkills = combat.step(dt);
    if (gkills) {
      for (const k of gkills) {
        const name = k.killer && k.killer.isPlayer ? 'YOU' : k.killer ? k.killer.name : 'FRAG';
        reportKill(name, k.victim, false, 'grenade');
      }
    }
    objectives.step(dt);
    // Carrier died without a kill event reaching us: drop the charge.
    const carrier = game.objective.carrier;
    if (carrier && !carrier.alive && game.objective.state === 'idle') {
      objectives.dropChargeAt(carrier.pos || (carrier.group && carrier.group.position) || player.pos);
    }
  }
  rounds.step(dt);
  effects.step(dt);
  game.sounds.length = 0;
  // The result screen needs the cursor: release the pointer lock.
  if (game.phase === 'RESULT' && input.locked) input.releaseLock();
  syncPlayerHitboxes();
  syncCamera();
  syncHud();
}

// ---- main loop ----
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (frozen) {
    engine.render();
    return;
  }
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 8) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 8) accumulator = 0;
  engine.render();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    audio.unlock();
  } else if (game.phase === 'MENU') {
    hud.showOverlay('start');
  } else if (game.phase === 'RESULT') {
    hud.showOverlay('result');
  } else if (game.phase === 'BUY') {
    // Buy phase: the armory is the UI, no pause overlay.
  } else {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (game.phase === 'MENU' || game.phase === 'RESULT') {
    rounds.startMatch();
    hud.hideOverlay();
    // Buy menu is open: leave the pointer free so the player can shop.
    // Clicking the canvas (or B) closes the menu and captures the mouse.
  } else {
    input.requestLock();
  }
});
hud.onBuy((id) => {
  const res = economy.buy(id, arsenal);
  if (res.ok) {
    audio.click();
    if (id !== 'grenade') {
      gunGroup = buildViewmodel(id);
      hud.setWeapon(arsenal.currentCfg().name, arsenal.grenades);
      hud.setAmmo(arsenal.mag[id], arsenal.reserve[id]);
    } else {
      hud.setWeapon(arsenal.currentCfg().name, arsenal.grenades);
    }
    hud.setMoney(game.money);
    hud.refreshBuy(game.money, arsenal.owned);
    hud.setHint(`Bought ${WEAPONS[id].name} — $${res.cost}`);
  } else {
    hud.setHint(res.reason);
    audio.dryFire();
  }
});
hud.onMute(() => {
  audio.setMuted(!audio.muted);
  hud.setMuted(audio.muted);
});
// Clicking the canvas while playing re-locks the pointer and closes the buy menu.
engine.renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if (game.phase === 'LIVE' || game.phase === 'BUY') {
    if (hud.isBuyOpen()) hud.showBuy(false);
    if (!input.locked) input.requestLock();
  }
});

window.addEventListener('resize', () => engine.resize());

// ---- deterministic screenshot scenes (real game state, no fake backdrop) ----
function settle(steps) {
  for (let i = 0; i < steps; i++) step(FIXED_STEP);
}
function aimAt(point) {
  const dx = point.x - player.pos.x;
  const dy = point.y - (player.pos.y + player.eye);
  const dz = point.z - player.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.look(0, 0);
  // Set yaw/pitch directly via look deltas from current orientation.
  const targetYaw = Math.atan2(-dx, -dz);
  const targetPitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  player.look((player.yaw - targetYaw) / 0.0022, (player.pitch - targetPitch) / 0.0022);
  syncCamera();
}
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    engine.render();
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}
function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    // First impression: menu overlay over the refinery vista from spawn.
    rounds.startMatch();
    game.phase = 'MENU';
    hud.showBuy(false);
    player.respawn(map.spawns.vanguard[0]);
    aimAt(new THREE.Vector3(0, 2, -10));
    settle(10);
    hud.showOverlay('start');
    hud.setHealth(100);
    hud.setAmmo(12, 48);
    hud.setWeapon('KX-45', 0);
    hud.setMoney(800);
    hud.setScore(0, 0, 1);
    hud.setTimer(100, 'LIVE');
  } else if (name === 'combat') {
    // Mid-firefight at the Furnace: player + visible enemies, live HUD.
    rounds.startMatch();
    game.phase = 'LIVE';
    hud.showBuy(false);
    game.timeLeft = 87;
    game.score.vanguard = 2;
    game.score.wraith = 1;
    game.round = 4;
    arsenal.owned.push('ar7');
    arsenal.mag.ar7 = 30;
    arsenal.reserve.ar7 = 90;
    arsenal.switchTo('ar7');
    gunGroup = buildViewmodel('ar7');
    hud.setWeapon(arsenal.currentCfg().name, arsenal.grenades);
    hud.setAmmo(arsenal.mag.ar7, arsenal.reserve.ar7);
    player.respawn({ x: 2, z: 8, yaw: Math.PI });
    // Place two enemies in view, mid-advance through the Furnace.
    const foes = bots.list.filter((b) => b.team === 'wraith');
    if (foes[0]) {
      foes[0].group.position.set(-3, 0, -2);
      foes[0].yaw = 0;
      foes[0].state = 'ENGAGE';
    }
    if (foes[1]) {
      foes[1].group.position.set(4, 0, -6);
      foes[1].yaw = 0.3;
      foes[1].state = 'ENGAGE';
    }
    const mates = bots.list.filter((b) => b.team === 'vanguard');
    if (mates[0]) {
      mates[0].group.position.set(-6, 0, 6);
      mates[0].yaw = Math.PI;
    }
    settle(30);
    aimAt(new THREE.Vector3(-3, 1.4, -2));
    firePlayerWeapon(performance.now());
    settle(2);
    hud.setHealth(78);
    player.damage(22);
  } else if (name === 'objective') {
    // Planting the charge at Site A: channel mid-progress, ring glowing.
    rounds.startMatch();
    game.phase = 'LIVE';
    hud.showBuy(false);
    game.timeLeft = 64;
    game.round = 2;
    game.objective.carrier = player;
    // Stand at the site's south edge, looking across the site toward the
    // reactor so the ring, the tank and the approach lane all read.
    player.respawn({ x: -20, z: -6.5, yaw: Math.PI });
    settle(10);
    objectives.channelStep(player, 'plant', 2.1); // ~60% planted
    game.objective.state = 'planting';
    settle(5);
    aimAt(new THREE.Vector3(-20, 0.6, -14));
  } else if (name === 'botplant') {
    // Bot plant proof: a Vanguard bot carries the charge to Site B and plants
    // it — the same channel the player uses, driven by the bot brain.
    rounds.startMatch();
    game.phase = 'LIVE';
    hud.showBuy(false);
    game.timeLeft = 88;
    game.round = 3;
    const carrier = bots.list.find((b) => b.team === 'vanguard' && b.alive);
    game.objective.carrier = carrier;
    carrier.group.position.set(20, 0, -11);
    carrier.yaw = Math.PI;
    carrier._site = 'B';
    carrier.state = 'PLANT';
    carrier._plantGrace = 2;
    carrier.target = null;
    // Let the 3.5s channel run to completion (5s of sim).
    settle(300);
    // Frame the planted charge from the approach lane.
    player.respawn({ x: 14, z: -2, yaw: Math.PI * 0.85 });
    aimAt(new THREE.Vector3(20, 0.4, -11));
  } else if (name === 'result') {
    // Match result: final scoreboard overlay over the map.
    game.score.vanguard = 5;
    game.score.wraith = 3;
    game.round = 8;
    game.phase = 'RESULT';
    player.respawn(map.spawns.vanguard[0]);
    aimAt(new THREE.Vector3(0, 2, -10));
    settle(10);
    hud.showOverlay('result', 'VICTORY', 'VANGUARD 5 — 3 WRAITH');
  }
  syncHud();
  paintTwiceThenReady();
}

// ---- boot ----
player.respawn(map.spawns.vanguard[0]);
syncCamera();
syncHud();
hud.showOverlay('start');
if (shot) runShot(shot);
else requestAnimationFrame(frame);
