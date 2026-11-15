// The match state machine. It owns every round transition — no other module
// changes phase, score, or timers. MENU -> BUY -> LIVE -> RESOLVE -> (BUY|RESULT).
// First to 5 rounds wins (max 8); sides switch after round 4.
const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const RESOLVE_SECONDS = 4;

export function createRounds(game, deps) {
  const { bots, player, objectives, economy, arsenal, hud, audio, map } = deps;
  let resolveTimer = 0;
  let resolveWinner = null;
  let resolveReason = '';

  function attackers() {
    return game.round <= 4 ? 'vanguard' : 'wraith';
  }
  function defenders() {
    return attackers() === 'vanguard' ? 'wraith' : 'vanguard';
  }
  function teamAlive(team) {
    let n = bots.list.filter((b) => b.team === team && b.alive).length;
    if (game.playerTeam === team && player.alive) n += 1;
    return n;
  }

  function resetRound() {
    // Player + bots back to their spawns, full health, fresh ammo.
    const spawns = map.spawns[game.playerTeam];
    player.respawn(spawns[0]);
    bots.reset(game.round, game.playerTeam);
    arsenal.refill();
    objectives.reset();
    game.timeLeft = ROUND_SECONDS;
    game.buyTimeLeft = BUY_SECONDS;
    game.kills.length = 0;
    if (hud) hud.clearKillfeed();
    // The charge goes to the player when their team attacks, else to a bot.
    if (game.playerTeam === attackers()) {
      game.objective.carrier = player;
    } else {
      const carrier = bots.list.find((b) => b.team === attackers() && b.alive);
      game.objective.carrier = carrier || null;
    }
  }

  function endRound(winner, reason) {
    if (game.phase !== 'LIVE') return;
    game.phase = 'RESOLVE';
    resolveTimer = RESOLVE_SECONDS;
    resolveWinner = winner;
    resolveReason = reason;
    game.score[winner] += 1;
    const playerWon = winner === game.playerTeam;
    economy.awardRound(playerWon);
    if (audio) audio.roundWin(playerWon);
    if (hud) {
      hud.banner(
        playerWon ? 'ROUND WON' : 'ROUND LOST',
        `${winner === 'vanguard' ? 'VANGUARD' : 'WRAITH'} — ${reason}`,
      );
      hud.setScore(game.score.vanguard, game.score.wraith, game.round);
    }
    game.onEvent('roundEnd', { winner, reason });
  }

  function nextRound() {
    const matchOver =
      game.score.vanguard >= game.winRounds ||
      game.score.wraith >= game.winRounds ||
      game.round >= game.maxRounds;
    if (matchOver) {
      game.phase = 'RESULT';
      const v = game.score.vanguard;
      const w = game.score.wraith;
      const playerWon =
        game.playerTeam === 'vanguard' ? v > w : w > v;
      if (hud) {
        hud.showOverlay(
          'result',
          playerWon ? 'VICTORY' : v === w ? 'DRAW' : 'DEFEAT',
          `VANGUARD ${v} — ${w} WRAITH`,
        );
      }
      return;
    }
    game.round += 1;
    if (game.round === 5) {
      // Halftime: sides switch. The player defends now (or attacks, if they defended).
      game.playerTeam = game.playerTeam === 'vanguard' ? 'wraith' : 'vanguard';
      if (hud) hud.banner('SIDES SWITCHED', `You are now ${game.playerTeam.toUpperCase()}`);
    }
    game.phase = 'BUY';
    game.buyTimeLeft = BUY_SECONDS;
    resetRound();
    if (hud) {
      hud.setScore(game.score.vanguard, game.score.wraith, game.round);
      hud.showBuy(true);
      hud.refreshBuy(game.money, arsenal.owned);
      hud.setMoney(game.money);
    }
  }

  return {
    attackers,
    defenders,
    startMatch() {
      game.score.vanguard = 0;
      game.score.wraith = 0;
      game.round = 1;
      game.playerTeam = 'vanguard';
      game.phase = 'BUY';
      economy.reset();
      arsenal.owned.length = 0;
      arsenal.owned.push('kx45');
      arsenal.grenades = 0;
      arsenal.switchTo('kx45');
      resetRound();
      if (hud) {
        hud.hideOverlay();
        hud.setScore(0, 0, 1);
        hud.setMoney(game.money);
        hud.showBuy(true);
        hud.refreshBuy(game.money, arsenal.owned);
        hud.banner('ROUND 1', 'VANGUARD attacks — plant the charge');
      }
      if (audio) audio.roundStart();
    },
    step(dt) {
      if (game.phase === 'BUY') {
        game.buyTimeLeft -= dt;
        if (game.buyTimeLeft <= 0) {
          game.buyTimeLeft = 0;
          game.phase = 'LIVE';
          game.timeLeft = ROUND_SECONDS;
          if (hud) hud.showBuy(false);
          if (audio) audio.roundStart();
        }
        return;
      }
      if (game.phase === 'RESOLVE') {
        resolveTimer -= dt;
        if (resolveTimer <= 0) nextRound();
        return;
      }
      if (game.phase !== 'LIVE') return;

      // Round timer: if the charge is planted the fuse decides, not the clock.
      if (game.objective.state !== 'planted' && game.objective.state !== 'defusing') {
        game.timeLeft -= dt;
        if (game.timeLeft <= 0) {
          game.timeLeft = 0;
          endRound(defenders(), 'Time expired');
          return;
        }
      }
      // Objective resolutions.
      if (game.objective.state === 'detonated') {
        endRound(attackers(), 'Charge detonated');
        return;
      }
      if (game.objective.state === 'defused') {
        endRound(defenders(), 'Charge defused');
        return;
      }
      // Elimination.
      if (teamAlive('vanguard') === 0) {
        endRound('wraith', 'VANGUARD eliminated');
        return;
      }
      if (teamAlive('wraith') === 0) {
        endRound('vanguard', 'WRAITH eliminated');
      }
    },
    endRound,
  };
}
