// HUD: every readout is driven from live game state — nothing here is decorative.
// main.js calls these setters each frame (cheap: text updates only on change).
// Visibility uses the .hidden class (display:none!important in styles.css);
// the overlay's `hidden` attribute would lose to its display:flex rule.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenades: $('grenades'),
    timer: $('timer'),
    scoreV: $('score-v'),
    scoreW: $('score-w'),
    roundNum: $('round-num'),
    money: $('money'),
    buyFunds: $('buy-funds'),
    killfeed: $('killfeed'),
    objState: $('obj-state'),
    objProgressFill: $('obj-progress-fill'),
    objTimer: $('obj-timer'),
    buyMenu: $('buy-menu'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play-btn'),
    banner: $('round-banner'),
    prompt: $('plant-prompt'),
    damage: $('damage-flash'),
    teamTag: $('team-tag'),
    hint: $('hint-bar'),
    muteBtn: $('mute-btn'),
  };
  const cache = {};
  const defaultHint = el.hint ? el.hint.textContent : '';
  let hitTimer = 0;
  let bannerTimer = 0;
  let hintTimer = 0;
  let damageTimer = 0;
  let buyOpen = false;

  function setText(node, key, value) {
    if (!node || cache[key] === value) return;
    cache[key] = value;
    node.textContent = value;
  }

  return {
    setHealth(hp) {
      const v = Math.max(0, Math.ceil(hp));
      setText(el.healthNum, 'hp', String(v));
      if (el.healthFill) el.healthFill.style.width = `${Math.max(0, hp)}%`;
      if (el.healthNum) el.healthNum.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve) {
      setText(el.ammoMag, 'mag', String(mag));
      setText(el.ammoReserve, 'res', String(reserve));
      if (el.ammoMag) el.ammoMag.classList.toggle('empty', mag === 0);
    },
    setWeapon(name, grenades) {
      setText(el.weaponName, 'wpn', name);
      setText(el.grenades, 'grn', grenades > 0 ? `● ${grenades} FRAG` : '● 0 FRAG');
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setText(el.timer, 't', phase === 'BUY' ? `BUY ${mm}:${ss}` : `${mm}:${ss}`);
      if (el.timer) el.timer.classList.toggle('low', phase === 'LIVE' && s <= 15);
    },
    setScore(v, w, round) {
      setText(el.scoreV, 'sv', String(v));
      setText(el.scoreW, 'sw', String(w));
      setText(el.roundNum, 'rnd', `ROUND ${round} / 8`);
    },
    setMoney(m) {
      setText(el.money, 'money', String(m));
      setText(el.buyFunds, 'bf', String(m));
    },
    setTeam(team) {
      if (el.teamTag) el.teamTag.className = team === 'vanguard' ? 'team-vanguard' : 'team-wraith';
    },
    setHint(text) {
      setText(el.hint, 'hint', text);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setText(el.hint, 'hint', defaultHint), 3500);
    },
    killfeed(entry) {
      if (!el.killfeed) return;
      const row = document.createElement('div');
      const killer = document.createElement('span');
      killer.className = entry.killerTeam === 'vanguard' ? 'kf-v' : 'kf-w';
      killer.textContent = entry.killer;
      const weapon = document.createElement('span');
      weapon.className = entry.head ? 'kf-head' : 'kf-wpn';
      weapon.textContent = entry.head ? ` ◉ ${entry.weapon} ` : ` ${entry.weapon} `;
      const victim = document.createElement('span');
      victim.className = entry.victimTeam === 'vanguard' ? 'kf-v' : 'kf-w';
      victim.textContent = entry.victim;
      row.append(killer, weapon, victim);
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    clearKillfeed() {
      if (el.killfeed) el.killfeed.innerHTML = '';
    },
    hitmarker(head, kill) {
      if (!el.hitmarker) return;
      el.hitmarker.classList.add('show');
      el.hitmarker.classList.toggle('head', !!head);
      el.hitmarker.classList.toggle('kill', !!kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('show', 'head', 'kill'), 140);
    },
    damageFlash() {
      if (!el.damage) return;
      el.damage.classList.add('show');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => el.damage.classList.remove('show'), 120);
    },
    setCrosshairSpread(px) {
      if (el.crosshair) el.crosshair.style.setProperty('--spread', `${Math.round(px)}px`);
    },
    objective(state, progress, timer, site) {
      if (!el.objState) return;
      let text = '';
      if (state === 'planted' || state === 'defusing') {
        text = `CHARGE @ ${site} — ${Math.ceil(timer)}s`;
      } else if (state === 'planting') {
        text = `PLANTING @ ${site || ''} ${Math.round(progress * 100)}%`;
      } else if (state === 'detonated') {
        text = 'CHARGE DETONATED';
      } else if (state === 'defused') {
        text = 'CHARGE DEFUSED';
      } else {
        text = 'PLANT THE CHARGE @ A / B';
      }
      setText(el.objState, 'obj', text);
      if (el.objProgressFill) el.objProgressFill.style.width = `${Math.round(progress * 100)}%`;
      setText(el.objTimer, 'objt', state === 'planted' ? `${Math.ceil(timer)}` : '');
    },
    prompt(text) {
      if (!el.prompt) return;
      if (text) {
        el.prompt.innerHTML = text;
        el.prompt.classList.remove('hidden');
      } else {
        el.prompt.classList.add('hidden');
      }
    },
    banner(text, sub) {
      if (!el.banner) return;
      el.banner.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
      el.banner.classList.remove('hidden');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.add('hidden'), 3500);
    },
    showBuy(show) {
      buyOpen = !!show;
      if (el.buyMenu) el.buyMenu.classList.toggle('hidden', !show);
    },
    isBuyOpen() {
      return buyOpen;
    },
    // Buy menu buttons: disable what the player cannot afford or already owns.
    refreshBuy(money, owned) {
      if (!el.buyMenu) return;
      for (const btn of el.buyMenu.querySelectorAll('[data-buy]')) {
        const price = Number(btn.dataset.price || 0);
        const id = btn.dataset.buy;
        const isOwned = id !== 'grenade' && owned.includes(id);
        btn.classList.toggle('owned', isOwned);
        btn.disabled = money < price || isOwned;
      }
    },
    showOverlay(kind, title, copy) {
      if (!el.overlay) return;
      el.overlay.classList.remove('hidden');
      if (kind === 'start') {
        // Keep the static HTML title/copy (two-line title with <br>).
        if (el.playBtn) el.playBtn.textContent = 'DEPLOY';
      } else if (kind === 'paused') {
        setText(el.overlayTitle, 'ot', 'PAUSED');
        setText(el.overlayCopy, 'oc', 'Click to resume.');
        if (el.playBtn) el.playBtn.textContent = 'RESUME';
      } else if (kind === 'result') {
        setText(el.overlayTitle, 'ot', title || 'MATCH OVER');
        setText(el.overlayCopy, 'oc', copy || '');
        if (el.playBtn) el.playBtn.textContent = 'PLAY AGAIN';
      }
    },
    hideOverlay() {
      if (el.overlay) el.overlay.classList.add('hidden');
      if (el.hud) el.hud.classList.remove('hidden');
    },
    setMuted(muted) {
      if (el.muteBtn) el.muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    },
    onPlay(fn) {
      if (el.playBtn) el.playBtn.addEventListener('click', fn);
    },
    onBuy(fn) {
      if (!el.buyMenu) return;
      for (const btn of el.buyMenu.querySelectorAll('[data-buy]')) {
        btn.addEventListener('click', () => fn(btn.dataset.buy));
      }
    },
    onMute(fn) {
      if (el.muteBtn) el.muteBtn.addEventListener('click', fn);
    },
  };
}
