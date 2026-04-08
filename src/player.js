// ─────────────────────────────────────────────────
//  player.js  — Player state + class abilities
// ─────────────────────────────────────────────────
import { roll, shuffle } from './dice.js';

// Player colours by slot index
const PLAYER_COLORS = ['#00e5ff', '#76ff03', '#ffea00', '#ff4081'];
const PLAYER_ICONS  = ['◈', '◉', '◆', '◇'];

export class Player {
  constructor(id, classCard, toolCard = null) {
    this.id    = id;
    this.card  = classCard;
    this.name  = classCard.title;
    this.color = PLAYER_COLORS[id];
    this.icon  = PLAYER_ICONS[id];

    // Derive classKey
    const n = this.name.toLowerCase();
    this.classKey = n.includes('athlete')   ? 'athlete'
                  : n.includes('medic')     ? 'medic'
                  : n.includes('scientist') ? 'scientist'
                  : n.includes('fighter')   ? 'fighter'
                  : 'athlete';

    // Base stats from card
    const s  = classCard.stats || {};
    this.atk = s.ATK ?? 2;
    this.def = s.DEF ?? 2;
    this.mov = s.MOV ?? 4;

    // Position
    this.x = 0; this.y = 0;

    // State
    this.isKO       = false;
    this.hasEscaped = false;
    this.stunRounds = 0;    // rounds remaining stunned
    this.tools      = toolCard ? [toolCard] : [];
    this.keyDiceHeld = [];  // number[] — values of collected key dice
    this.divineProtection = false;

    // Per-turn state (reset by game.js each turn)
    this.movesLeft   = 0;
    this.actionUsed  = false;
    this.selectedTool = null;
  }

  // ── Derived stats (considering effects) ──────────────────────────────────

  /** Effective MOV including equipment and event penalties. */
  effectiveMov(state) {
    let m = this.mov;
    // Lightning shoes / equipment
    for (const t of this.tools) {
      const d = (t.description || '').toLowerCase();
      if (d.includes('+1 tile') || d.includes('+1 mov')) m += 1;
    }
    // Global effects
    m -= (state?.effects?.movPenalty || 0);
    if (this.stunRounds > 0) return 0;
    return Math.max(1, m);
  }

  /** Effective ATK. */
  effectiveAtk(state) {
    let a = this.atk;
    for (const t of this.tools) {
      const d = (t.description || '').toLowerCase();
      if (d.includes('+1 atk')) a += 1;
    }
    if (state?.effects?.doubleAtk > 0) a *= 2;
    return a;
  }

  /** Effective DEF. */
  effectiveDef() {
    let d = this.def;
    for (const t of this.tools) {
      const desc = (t.description || '').toLowerCase();
      // (no current tool gives +DEF directly)
    }
    return d;
  }

  // ── Positioning ──────────────────────────────────────────────────────────
  startTurn(state) {
    if (this.stunRounds > 0) {
      this.stunRounds--;
      this.movesLeft  = 0;
      this.actionUsed = true; // can't act while stunned
      return;
    }
    this.movesLeft  = this.effectiveMov(state);
    this.actionUsed = false;
    this.selectedTool = null;
  }

  // ── Class abilities ───────────────────────────────────────────────────────

  /** Athlete: spend action to double movement. */
  useAthleteDouble(state) {
    if (this.classKey !== 'athlete') return false;
    if (this.actionUsed) return false;
    this.movesLeft  = this.effectiveMov(state) * 2;
    this.actionUsed = true;
    return true;
  }

  /** Medic: revive adjacent player for FREE (no action) + both get +1 move. */
  canMedicRevive(state) {
    if (this.classKey !== 'medic') return [];
    return state.players.filter(p => !p.isKO || p === this ? false : chebyshev(this, p) <= 1);
  }
  medicRevive(target, state) {
    if (this.classKey !== 'medic') return false;
    target.isKO       = false;
    target.stunRounds = 0;
    this.movesLeft   += 1;
    target.movesLeft += 1;
    return true;
  }

  /** Scientist: pick up key dice for FREE. Craft: roll D4, on 4 gain random tool. */
  canScientistCraft() { return this.classKey === 'scientist' && !this.actionUsed; }
  scientistCraft(toolDeck) {
    const result = roll.d4();
    if (result === 4) {
      const tool = toolDeck.draw();
      if (tool) this.tools.push(tool);
      return { result, gained: result === 4 ? tool : null };
    }
    this.actionUsed = true;
    return { result, gained: null };
  }

  /** Fighter: +1 ATK per equipped weapon (handled in effectiveAtk via tool parsing). */
  /** Fighter extra action after kill is managed in game.js combat resolution. */

  // ── Tools ─────────────────────────────────────────────────────────────────

  addTool(card) { this.tools.push(card); }

  removeTool(card) {
    const i = this.tools.indexOf(card);
    if (i !== -1) this.tools.splice(i, 1);
  }

  /** Returns tool cards that have an active-use effect (not purely passive). */
  get activeTools() {
    return this.tools.filter(t => {
      const d = (t.description || '').toLowerCase();
      return d.includes('use') || d.includes('stun') || d.includes('revive')
          || d.includes('place') || d.includes('attack') || d.includes('craft');
    });
  }

  // ── Key Dice ──────────────────────────────────────────────────────────────
  collectKeyDie(value) { this.keyDiceHeld.push(value); }

  /** Spend all held dice at exit. Returns the dice spent. */
  spendKeyDiceAtExit() {
    const spent = [...this.keyDiceHeld];
    this.keyDiceHeld = [];
    return spent;
  }

  // ── Knockout ──────────────────────────────────────────────────────────────
  knockOut() {
    if (this.divineProtection) {
      this.divineProtection = false;
      return false; // protected
    }
    this.isKO = true;
    return true;
  }

  revive() {
    this.isKO = false;
    this.stunRounds = 1; // 1 turn recovery after revival
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────
export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Return all tiles the player can reach from (x,y) with movesLeft steps,
 * using Chebyshev (8-directional) distance, avoiding KO'd ally squares
 * and providing passable paths.
 * blockedTiles: Set<string> of "x,y" strings that can't be entered.
 */
export function validMoves(player, blockedTiles, movesLeft = null) {
  const moves = movesLeft ?? player.movesLeft;
  if (moves <= 0) return [];
  const result = [];
  for (let dx = -moves; dx <= moves; dx++) {
    for (let dy = -moves; dy <= moves; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = player.x + dx;
      const ny = player.y + dy;
      if (nx < 0 || nx >= 20 || ny < 0 || ny >= 20) continue;
      if (blockedTiles.has(`${nx},${ny}`)) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist <= moves) result.push({ x: nx, y: ny, cost: dist });
    }
  }
  return result;
}

/** Get starting position for player slot (corners of board). */
export function startPosition(playerId, total) {
  const positions = [
    { x: 1, y: 1 }, { x: 18, y: 1 }, { x: 1, y: 18 }, { x: 18, y: 18 },
  ];
  return positions[playerId] || positions[0];
}
