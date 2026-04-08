// ─────────────────────────────────────────────────
//  enemy.js  — Villain AI (all 5 types) + zombies
// ─────────────────────────────────────────────────
import { roll, showSingleRoll } from './dice.js';
import { chebyshev } from './player.js';

export class Villain {
  constructor(card, parsedStats) {
    this.card = card;
    this.name = card.title;

    const n = card.title.toLowerCase();
    this.type = n.includes('stalker')     ? 'stalker'
              : n.includes('gambler')     ? 'gambler'
              : n.includes('trapper')     ? 'trapper'
              : n.includes('necromancer') ? 'necromancer'
              : n.includes('hunter')      ? 'hunter'
              : 'stalker';

    // Store base stats (may be 'd6' for Gambler or null for Hunter MOV)
    this._baseAtk = parsedStats.atk;
    this._baseDef = parsedStats.def;
    this._baseMov = parsedStats.mov;

    // Effective this-turn stats (rolled fresh each Gambler turn)
    this.atk = typeof this._baseAtk === 'number' ? this._baseAtk : roll.d6();
    this.def = typeof this._baseDef === 'number' ? this._baseDef : roll.d6();
    this.mov = typeof this._baseMov === 'number' ? this._baseMov : roll.d6();

    this.x = 10; this.y = 10;
    this.stunRounds       = 0;
    this.extraActivation  = false;
    this.statBoostThisTurn = 0;
    this._gamblerD6Result  = null;
  }

  get isStunned() { return this.stunRounds > 0; }

  async startTurn(state) {
    const logs = [];
    if (this.stunRounds > 0) {
      this.stunRounds--;
      logs.push(`${this.name} is stunned (${this.stunRounds} rounds left).`);
      return { logs, skip: true };
    }

    // Re-roll Gambler stats each turn
    if (this._baseAtk === 'd6') this.atk = roll.d6();
    if (this._baseDef === 'd6') this.def = roll.d6();
    if (this._baseMov === 'd6') this.mov = roll.d6();
    this.statBoostThisTurn = 0;

    if (this.type === 'gambler') {
      const gl = await this._gamblerAbility(state);
      logs.push(...gl);
    }
    if (this.type === 'necromancer') {
      const nl = this._necromancerAbility(state);
      logs.push(...nl);
    }
    if (this.type === 'trapper') {
      logs.push(`Trapper: players who stop near objectives get immobilised.`);
    }

    return { logs, skip: false };
  }

  async _gamblerAbility(state) {
    const logs = [];
    if (state.eventDeck && state.eventDeck.remaining > 0) {
      const extra = state.eventDeck.draw();
      logs.push(`Gambler draws an event: ${extra.title}`);
    }
    const r = await showSingleRoll('Gambler rolls…', 6);
    this._gamblerD6Result = r;
    logs.push(`Gambler D6 = ${r}`);
    switch (r) {
      case 1:
        this.stunRounds = 1;
        logs.push('Gambler is stunned!');
        break;
      case 2:
        state.pendingGamblerDiscardTool = true;
        logs.push('Gambler: all players must discard a tool!');
        break;
      case 3: {
        const targets = state.players.filter(p => !p.isKO && !p.hasEscaped);
        if (targets.length) {
          const farthest = targets.reduce((best, p) =>
            chebyshev(this, p) > chebyshev(this, best) ? p : best
          );
          this.x = farthest.x; this.y = farthest.y;
          logs.push(`Gambler teleports to farthest player (${farthest.name}).`);
        }
        break;
      }
      case 4:
        state.pendingNewObjective = true;
        logs.push('Gambler creates a new puzzle on the board.');
        break;
      case 5:
        this.statBoostThisTurn = 1;
        this.atk += 1; this.def += 1; this.mov += 1;
        logs.push('Gambler: +1 ATK/DEF/MOV this turn!');
        break;
      case 6: {
        const r2 = await showSingleRoll('Gambler rolls again…', 6);
        if (r2 === 6) {
          state.gamblerWin = true;
          logs.push('GAMBLER WINS THE GAME! Double 6!');
        } else {
          logs.push(`Gambler rolls again: ${r2} — phew!`);
        }
        break;
      }
    }
    return logs;
  }

  _necromancerAbility(state) {
    const logs = [];
    const numPlayers = state.players.filter(p => !p.hasEscaped).length;
    const r = roll.d6() + numPlayers;
    logs.push(`Necromancer: D6(${r - numPlayers}) + players(${numPlayers}) = ${r}`);
    if (r >= 6) {
      state.pendingZombieSpawn = true;
      logs.push('Necromancer summons a zombie!');
    }
    return logs;
  }

  move(players, blockedTiles = new Set()) {
    const logs = [];
    const activePlayers = players.filter(p => !p.isKO && !p.hasEscaped);
    if (!activePlayers.length) return logs;

    if (this.type === 'hunter') {
      const target = _closest(this, activePlayers);
      this.x = target.x; this.y = target.y;
      logs.push(`Hunter teleports to ${target.name}!`);
      return logs;
    }

    const target = _closest(this, activePlayers);
    const steps  = (this.mov || 3) + this.statBoostThisTurn;
    const moved  = _moveToward(this, target, steps, blockedTiles);
    logs.push(`${this.name} moves toward ${target.name} (${moved} steps).`);
    return logs;
  }
}

// ─── Zombie counter (module-level, avoids static class field) ─────────────────
let _zombieCount = 0;

export class Zombie {
  constructor(x, y) {
    _zombieCount++;
    this.id         = _zombieCount;
    this.x          = x;
    this.y          = y;
    this.atk        = 3;
    this.def        = 3;
    this.mov        = 3;
    this.stunRounds = 0;
    this.isDefeated = false;
    this.name       = `Zombie #${this.id}`;
  }

  get isStunned() { return this.stunRounds > 0; }

  move(players, blockedTiles = new Set()) {
    if (this.stunRounds > 0) { this.stunRounds--; return `${this.name} is stunned.`; }
    const activePlayers = players.filter(p => !p.isKO && !p.hasEscaped);
    if (!activePlayers.length) return '';
    const target = _closest(this, activePlayers);
    _moveToward(this, target, this.mov, blockedTiles);
    return `${this.name} moves toward ${target.name}.`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _closest(entity, players) {
  return players.reduce((best, p) =>
    chebyshev(entity, p) < chebyshev(entity, best) ? p : best
  );
}

function _moveToward(entity, target, steps, blockedTiles) {
  let taken = 0;
  for (let s = 0; s < steps; s++) {
    const dx = Math.sign(target.x - entity.x);
    const dy = Math.sign(target.y - entity.y);
    if (dx === 0 && dy === 0) break;

    const candidates = [
      { x: entity.x + dx, y: entity.y + dy },
      { x: entity.x + dx, y: entity.y },
      { x: entity.x,      y: entity.y + dy },
    ];

    let moved = false;
    for (const c of candidates) {
      if (c.x < 0 || c.x >= 20 || c.y < 0 || c.y >= 20) continue;
      if (!blockedTiles.has(`${c.x},${c.y}`)) {
        entity.x = c.x; entity.y = c.y;
        taken++; moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return taken;
}

export function villainStartPos() {
  return { x: 9, y: 9 };
}
