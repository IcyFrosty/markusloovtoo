// ─────────────────────────────────────────────────
//  board.js  — 20×20 grid renderer & state
// ─────────────────────────────────────────────────
import { chebyshev } from './player.js';

const COLS = 20, ROWS = 20;

/** Return a flat index for (x, y). */
export const idx = (x, y) => y * COLS + x;

// ─── Build the DOM grid once ─────────────────────────────────────────────────
export function buildBoard(boardEl) {
  boardEl.innerHTML = '';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.x = x;
      tile.dataset.y = y;
      tile.dataset.idx = idx(x, y);
      boardEl.appendChild(tile);
    }
  }
}

/** Get a tile element by coordinates. */
export function getTile(boardEl, x, y) {
  return boardEl.querySelector(`.tile[data-x="${x}"][data-y="${y}"]`);
}

// ─── Render the full board state ─────────────────────────────────────────────
/**
 * Re-render all tokens on the board from game state.
 * Does NOT delete the tile elements — only updates their contents.
 */
export function renderBoard(boardEl, state, onTileClick) {
  // Clear all tile contents & classes (keep .tile)
  const tiles = boardEl.querySelectorAll('.tile');
  tiles.forEach(t => {
    t.innerHTML   = '';
    t.className   = 'tile';
    t.onclick     = null;
    t.style.cursor = 'default';
  });

  // ── Hazard zones ────────────────────────────────
  for (const h of (state.hazards || [])) {
    const tile = getTile(boardEl, h.x, h.y);
    if (!tile) continue;
    tile.classList.add('hazard');
    tile.innerHTML = `<span class="token hazard-token" title="${h.type}">${_hazardIcon(h.type)}</span>`;
  }

  // ── Key dice ─────────────────────────────────────
  for (const kd of (state.keyDiceOnBoard || [])) {
    const tile = getTile(boardEl, kd.x, kd.y);
    if (!tile) continue;
    const isNext = kd.value === state.nextKeyDieValue;
    const div = document.createElement('div');
    div.className = `token key-die-token${isNext ? ' next-to-collect' : ''}`;
    div.dataset.keyValue = kd.value;
    div.textContent = kd.value;
    div.title = `Key Die: ${kd.value}`;
    tile.appendChild(div);
  }

  // ── Exit marker ──────────────────────────────────
  if (state.exitTile) {
    const tile = getTile(boardEl, state.exitTile.x, state.exitTile.y);
    if (tile) {
      tile.classList.add('exit-tile');
      const div = document.createElement('div');
      div.className = 'token exit-token';
      div.textContent = '🚪';
      div.title = 'EXIT — escape here!';
      tile.appendChild(div);
    }
  }

  // ── Villains ─────────────────────────────────────
  if (state.villain && !state.villain.isStunned || (state.villain && state.villain.stunRounds === 0)) {
    _placeVillainToken(boardEl, state.villain);
  } else if (state.villain) {
    _placeVillainToken(boardEl, state.villain, true);
  }

  // ── Zombies ──────────────────────────────────────
  for (const z of (state.zombies || [])) {
    if (z.isDefeated) continue;
    const tile = getTile(boardEl, z.x, z.y);
    if (!tile) continue;
    const div = document.createElement('div');
    div.className = 'token zombie-token';
    div.textContent = '🧟';
    div.title = `Zombie #${z.id} ATK${z.atk} DEF${z.def}${z.stunRounds > 0 ? ' [STUNNED]' : ''}`;
    tile.appendChild(div);
  }

  // ── Players ──────────────────────────────────────
  for (const p of (state.players || [])) {
    if (p.hasEscaped) continue;
    const tile = getTile(boardEl, p.x, p.y);
    if (!tile) continue;
    const isActive = state.phase === 'PLAYER_TURN' && p.id === state.players[state.activePlayerIdx]?.id;
    const div = document.createElement('div');
    div.className = `token player-token${isActive ? ' turn-active' : ''}`;
    div.style.setProperty('--t-color', p.color);
    div.style.background = `${p.color}20`;
    div.style.color       = p.color;
    div.style.borderColor = p.color;
    div.title = `${p.name} (P${p.id + 1})${p.isKO ? ' [KO]' : ''}${p.stunRounds > 0 ? ' [STUNNED]' : ''}`;
    div.textContent = p.isKO ? '✖' : p.icon;
    if (p.isKO) div.style.opacity = '0.5';
    tile.appendChild(div);
  }

  // ── Valid move highlights ─────────────────────────
  if (state.validMoves && state.validMoves.length > 0) {
    for (const vm of state.validMoves) {
      const tile = getTile(boardEl, vm.x, vm.y);
      if (!tile) continue;
      tile.classList.add('valid-move');
      tile.style.cursor = 'pointer';
      tile.onclick = () => onTileClick(vm.x, vm.y, vm.cost);
    }
  }
}

function _placeVillainToken(boardEl, villain, stunned = false) {
  const tile = getTile(boardEl, villain.x, villain.y);
  if (!tile) return;
  const div = document.createElement('div');
  div.className = 'token villain-token';
  div.style.opacity = stunned ? '0.45' : '1';
  div.title = `${villain.name}${stunned ? ' [STUNNED]' : ''} ATK${villain.atk} DEF${villain.def}`;
  div.textContent = _villainIcon(villain.type);
  tile.appendChild(div);
}

function _villainIcon(type) {
  switch (type) {
    case 'stalker':     return '👁';
    case 'gambler':     return '🎲';
    case 'trapper':     return '🪤';
    case 'necromancer': return '💀';
    case 'hunter':      return '🎯';
    default:            return '☠';
  }
}

function _hazardIcon(type) {
  if (type === 'toxic' || type === 'gas')  return '☣';
  if (type === 'slime')                    return '🟢';
  if (type === 'lava')                     return '🌋';
  if (type === 'ice')                      return '❄';
  return '⚠';
}

// ─── Coordinate helper ───────────────────────────────────────────────────────
export function buildCoordLabels(containerEl) {
  // Row of column numbers
  const topRow = containerEl.querySelector('.board-coords-row');
  if (topRow) {
    for (let x = 0; x < COLS; x++) {
      const s = document.createElement('div');
      s.className   = 'coord-label';
      s.textContent = x + 1;
      topRow.appendChild(s);
    }
  }
  // Column of row numbers
  const leftCol = containerEl.querySelector('.board-coords-col');
  if (leftCol) {
    for (let y = 0; y < ROWS; y++) {
      const s = document.createElement('div');
      s.className   = 'coord-label';
      s.textContent = y + 1;
      leftCol.appendChild(s);
    }
  }
}

// ─── Hazard helpers ───────────────────────────────────────────────────────────
/**
 * Check if a position is inside any active hazard.
 * Returns the hazard object or null.
 */
export function hazardAt(state, x, y) {
  return (state.hazards || []).find(h => {
    if (h.radius) return chebyshev({ x, y }, h) <= h.radius;
    return h.x === x && h.y === y;
  }) || null;
}

