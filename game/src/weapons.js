// weapons.js — weapon configs + pure arsenal logic (no THREE). Times in ms.
export const WEAPONS = {
  kx45: {id:'kx45',name:'KX-45',role:'Sidearm',price:0,damage:34,headMult:4,legMult:0.75,
    fireMs:220,auto:false,mag:12,reserve:48,reloadMs:1400,range:60,pellets:1,
    spreadHip:0.008,spreadMove:0.022,spreadAir:0.05,spreadCrouch:0.005,spreadAds:0.002,
    recoilPitch:0.007,recoilYaw:0.004,adsFov:68,tracer:0xffd27a},
  ar7: {id:'ar7',name:'AR-7',role:'Assault Rifle',price:2700,damage:28,headMult:4,legMult:0.75,
    fireMs:100,auto:true,mag:30,reserve:90,reloadMs:2200,range:80,pellets:1,
    spreadHip:0.010,spreadMove:0.028,spreadAir:0.06,spreadCrouch:0.006,spreadAds:0.002,
    recoilPitch:0.011,recoilYaw:0.005,adsFov:60,tracer:0xffd27a},
  vex9: {id:'vex9',name:'VEX-9',role:'SMG',price:1200,damage:22,headMult:4,legMult:0.75,
    fireMs:70,auto:true,mag:32,reserve:128,reloadMs:1900,range:45,pellets:1,
    spreadHip:0.014,spreadMove:0.032,spreadAir:0.06,spreadCrouch:0.009,spreadAds:0.004,
    recoilPitch:0.008,recoilYaw:0.005,adsFov:66,tracer:0xffd27a},
  br12: {id:'br12',name:'BR-12',role:'Shotgun',price:1800,damage:9,headMult:2,legMult:0.75,
    fireMs:800,auto:false,mag:6,reserve:24,reloadMs:2600,range:25,pellets:8,
    spreadHip:0.05,spreadMove:0.06,spreadAir:0.08,spreadCrouch:0.04,spreadAds:0.03,
    recoilPitch:0.03,recoilYaw:0.01,adsFov:70,tracer:0xffd27a},
  m40: {id:'m40',name:'M-40',role:'Precision Rifle',price:4750,damage:95,headMult:2,legMult:0.75,
    fireMs:1200,auto:false,mag:5,reserve:15,reloadMs:3000,range:120,pellets:1,
    spreadHip:0.03,spreadMove:0.06,spreadAir:0.09,spreadCrouch:0.01,spreadAds:0.0005,
    recoilPitch:0.05,recoilYaw:0.008,adsFov:30,tracer:0xffd27a},
  grenade: {id:'grenade',name:'FRAG',role:'Grenade',price:300,damage:0,headMult:1,legMult:1,
    fireMs:600,auto:false,mag:1,reserve:0,reloadMs:0,range:0,pellets:1,
    spreadHip:0,spreadMove:0,spreadAir:0,spreadCrouch:0,spreadAds:0,
    recoilPitch:0,recoilYaw:0,adsFov:74,tracer:0xffd27a},
};

export function createArsenal() {
  const a = {
    owned: ['kx45'], current: 'kx45',
    mag: {kx45: WEAPONS.kx45.mag}, reserve: {kx45: WEAPONS.kx45.reserve},
    grenades: 0, reloading: false, reloadEnd: 0, lastShot: -1e9, _now: 0,
    currentCfg() { return WEAPONS[this.current]; },
    canFire(now) {
      this._now = now;
      if (this.reloading || this.current === 'grenade') return false;
      return this.mag[this.current] > 0 && now - this.lastShot >= this.currentCfg().fireMs;
    },
    consumeRound(now) {
      if (this.mag[this.current] <= 0) return false;
      this.mag[this.current]--;
      this.lastShot = (now !== undefined ? now : this._now);
      return true;
    },
    startReload(now) {
      const cfg = this.currentCfg();
      if (this.reloading || this.mag[this.current] >= cfg.mag || this.reserve[this.current] <= 0) return false;
      this.reloading = true; this.reloadEnd = now + cfg.reloadMs; return true;
    },
    reloadStep(now) {
      if (!this.reloading) return false;
      if (now < this.reloadEnd) return false;
      const cfg = this.currentCfg(), need = cfg.mag - this.mag[this.current];
      const take = Math.min(need, this.reserve[this.current]);
      this.mag[this.current] += take; this.reserve[this.current] -= take;
      this.reloading = false; return true;
    },
    switchTo(id) {
      if (!this.owned.includes(id) || id === this.current) return id === this.current;
      this.current = id; this.reloading = false; return true;
    },
    buy(id, money) {
      const cfg = WEAPONS[id];
      if (!cfg) return {ok: false, reason: 'unknown'};
      if (id === 'grenade') {
        if (this.grenades >= 2) return {ok: false, reason: 'max grenades'};
        if (money < cfg.price) return {ok: false, reason: 'insufficient funds'};
        this.grenades++; return {ok: true, cost: cfg.price};
      }
      if (this.owned.includes(id)) return {ok: false, reason: 'already owned'};
      if (money < cfg.price) return {ok: false, reason: 'insufficient funds'};
      this.owned.push(id); this.mag[id] = cfg.mag; this.reserve[id] = cfg.reserve;
      return {ok: true, cost: cfg.price};
    },
    refill() {
      for (const id of this.owned) {
        this.mag[id] = WEAPONS[id].mag; this.reserve[id] = WEAPONS[id].reserve;
      }
      this.reloading = false;
    },
  };
  return a;
}
