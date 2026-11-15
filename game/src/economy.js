// Buy economy: money in, money out. Round rewards follow the classic curve —
// winning pays well, losing pays a little more each consecutive loss so a team
// on a streak can still afford rifles. The buy menu only spends during BUY.
import { WEAPONS } from './weapons.js';

const START_MONEY = 800;
const WIN_REWARD = 3250;
const LOSS_BASE = 1400;
const LOSS_STEP = 500;
const LOSS_MAX = 3400;
const KILL_REWARD = 300;
const PLANT_REWARD = 300;
const MAX_GRENADES = 2;

export function createEconomy(game) {
  return {
    get money() {
      return game.money;
    },
    // Buy a weapon or grenade for the player's arsenal. Returns {ok, reason}.
    buy(id, arsenal) {
      if (game.phase !== 'BUY') return { ok: false, reason: 'Buy phase is over' };
      const cfg = WEAPONS[id];
      if (!cfg) return { ok: false, reason: 'Unknown item' };
      if (id === 'grenade') {
        if (arsenal.grenades >= MAX_GRENADES) return { ok: false, reason: 'Max grenades' };
        if (game.money < cfg.price) return { ok: false, reason: 'Not enough money' };
        game.money -= cfg.price;
        arsenal.grenades += 1;
        return { ok: true, cost: cfg.price };
      }
      if (arsenal.owned.includes(id)) return { ok: false, reason: 'Already owned' };
      if (game.money < cfg.price) return { ok: false, reason: 'Not enough money' };
      game.money -= cfg.price;
      arsenal.owned.push(id);
      arsenal.mag[id] = cfg.mag;
      arsenal.reserve[id] = cfg.reserve;
      arsenal.switchTo(id);
      return { ok: true, cost: cfg.price };
    },
    awardKill() {
      game.money += KILL_REWARD;
    },
    awardPlant() {
      game.money += PLANT_REWARD;
    },
    // End-of-round payout for the player's team.
    awardRound(won) {
      if (won) {
        game.money += WIN_REWARD;
        game.lossStreak = 0;
      } else {
        game.money += Math.min(LOSS_MAX, LOSS_BASE + LOSS_STEP * game.lossStreak);
        game.lossStreak += 1;
      }
    },
    reset() {
      game.money = START_MONEY;
      game.lossStreak = 0;
    },
  };
}
