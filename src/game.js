// ─────────────────────────────────────────────────
//  game.js  — State machine & round loop
// ─────────────────────────────────────────────────
import { loadCards, getSurvivors, getVillains, getEvents, getTools, parseVillainStats, survivorToClass, villainMeta } from './data.js';
import { roll, rollCoord, shuffle } from './dice.js';
import { Deck, EventRow, applyEventEffect } from './cards.js';
import { Player, validMoves, startPosition, chebyshev } from './player.js';
import { Villain, Zombie, villainStartPos } from './enemy.js';
import { villainAttack, playerAttack, inMeleeRange } from './combat.js';
import { buildBoard, renderBoard, buildCoordLabels } from './board.js';
import {
  showScreen, updatePhaseIndicator, updateRoundCounter,
  renderPlayerHuds, renderVillainPanel, renderZombieList,
  renderEventRow, appendLog, appendRoundDivider,
  updateActionBar, showEndgame, showVillainReveal,
  showEventDetail, showToolModal
} from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
const G = {
  phase: 'SETUP',
  round: 0,
  players: [],
  activePlayerIdx: 0,
  villain: null,
  zombies: [],
  keyDiceOnBoard: [],       // [{id, value, x, y}]
  nextKeyDieValue: 1,       // smallest uncollected key die value
  exitTile: null,           // {x, y} once all board key dice collected
  exitKeyDiceSpent: [],     // all dice spent at exit
  totalKeyDiceCount: 0,
  eventRow: new EventRow(),
  eventDeck: null,          // Deck instance
  toolDeck: null,           // Deck instance
  effects: {
    doubleAtk: 0,
    movPenalty: 0,
    fogOfWar: false,
    iceAge: false,
  },
  hazards: [],
  // Pending action flags (set by cards.js event handler, resolved here)
  pendingZombieSpawn: false,
  pendingGolemSpawn: false,
  pendingAmmoGrant: false,
  pendingLootDrop: false,
  pendingDivineProtection: false,
  pendingRegroup: false,
  pendingMixer: false,
  pendingMindControl: false,
  pendingObjectiveSwitcher: false,
  pendingComeToMe: false,
  pendingDoubleTrouble: false,
  pendingRoulette: false,
  pendingStunRoulette: false,
  pendingBatSwarm: false,
  pendingAcidRain: false,
  pendingMeteor: false,
  pendingLightning: false,
  pendingToxicGas: false,
  pendingSlime: false,
  pendingEarthquake: false,
  pendingLava: false,
  pendingGamblerDiscardTool: false,
  pendingCounterAttack: null,
  gamblerWin: false,
  fighterBonusTurn: false,
  selectedToolCard: null,
  validMoves: [],
  isProcessing: false, // lock to prevent double-clicks during async ops
};

let _boardEl = null;
window._game = { onToolSelect };

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function init() {
  console.log('[HelixAlpha] init() starting...');
  try {
    const cards     = await loadCards();
    console.log('[HelixAlpha] cards loaded:', cards.length);
    const survivors = getSurvivors(cards);
    console.log('[HelixAlpha] survivors:', survivors.map(s=>s.title));
    const villains  = getVillains(cards);
    const events    = getEvents(cards);
    const tools     = getTools(cards);

    G.eventDeck = new Deck(events);
    G.toolDeck  = new Deck(tools);

    _boardEl = document.getElementById('board');
    console.log('[HelixAlpha] board element:', _boardEl);
    buildBoard(_boardEl);
    buildCoordLabels(document.getElementById('board-container'));

    console.log('[HelixAlpha] calling _buildSetupScreen...');
    _buildSetupScreen(survivors, villains, cards);
    console.log('[HelixAlpha] _buildSetupScreen done!');
  } catch (err) {
    console.error('[Helix Alpha] init() FAILED:', err);
    document.body.innerHTML += `<div style="color:red;padding:20px;font-family:monospace;position:fixed;top:0;left:0;background:#000;z-index:9999">INIT ERROR: ${err.message}<br><pre>${err.stack}</pre></div>`;
  }
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function _buildSetupScreen(survivors, villains, allCards) {
  let playerCount    = 2;
  let selectedClasses = []; // Array of survivor card objects (one per player slot)
  const classCards   = survivors.map(survivorToClass);

  // Player count buttons
  document.querySelectorAll('.btn-count').forEach(btn => {
    btn.addEventListener('click', () => {
      playerCount = parseInt(btn.dataset.count);
      document.querySelectorAll('.btn-count').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _renderClassGrid(classCards, playerCount, selectedClasses);
      _validateStart(playerCount, selectedClasses);
    });
    if (btn.dataset.count === '2') btn.classList.add('selected');
  });

  _renderClassGrid(classCards, playerCount, selectedClasses);

  document.getElementById('btn-start-game').addEventListener('click', async () => {
    if (selectedClasses.length < playerCount) {
      // Auto-fill remaining slots
      const used = new Set(selectedClasses.map(c => c.card.id));
      for (const cc of classCards) {
        if (selectedClasses.length >= playerCount) break;
        if (!used.has(cc.card.id)) { selectedClasses.push(cc); used.add(cc.card.id); }
      }
    }
    await _startGame(selectedClasses.slice(0, playerCount), villains);
  });
}

function _renderClassGrid(classCards, playerCount, selectedClasses) {
  const grid = document.getElementById('class-grid');
  console.log('[HelixAlpha] _renderClassGrid called, classCards:', classCards?.length, 'grid:', grid);
  if (!grid) { console.warn('[HelixAlpha] class-grid NOT FOUND'); return; }
  grid.innerHTML = '';
  console.log('[HelixAlpha] iterating', classCards.length, 'class cards...');
  for (const cc of classCards) {
    const card = document.createElement('div');
    card.className = `class-card`;
    card.dataset.class = cc.key;
    card.style.setProperty('--cc', cc.color);

    const slotIndex = selectedClasses.findIndex(s => s.card.id === cc.card.id);
    const slotText  = slotIndex >= 0 ? `▶ Player ${slotIndex + 1}` : '';
    if (slotIndex >= 0) card.classList.add('selected');

    const stats = cc.card.stats || {};
    card.innerHTML = `
      <div class="class-card-header">
        <div class="class-name">${cc.icon} ${cc.card.title}</div>
        <div class="class-badge">${cc.key.toUpperCase()}</div>
      </div>
      <div class="class-stats">
        <div class="stat-chip"><span class="label">ATK</span><span class="value">${stats.ATK ?? '—'}</span></div>
        <div class="stat-chip"><span class="label">DEF</span><span class="value">${stats.DEF ?? '—'}</span></div>
        <div class="stat-chip"><span class="label">MOV</span><span class="value">${stats.MOV ?? '—'}</span></div>
      </div>
      <div class="class-ability">${cc.card.description || ''}</div>
      <div class="class-player-slot">${slotText}</div>
    `;

    card.addEventListener('click', () => {
      const existing = selectedClasses.findIndex(s => s.card.id === cc.card.id);
      if (existing >= 0) {
        selectedClasses.splice(existing, 1);
      } else if (selectedClasses.length < playerCount) {
        selectedClasses.push(cc);
      } else {
        // Replace last selected
        selectedClasses[selectedClasses.length - 1] = cc;
      }
      _renderClassGrid(classCards, playerCount, selectedClasses);
      _validateStart(playerCount, selectedClasses);
    });

    grid.appendChild(card);
  }

  _validateStart(playerCount, selectedClasses);
}

function _validateStart(playerCount, selectedClasses) {
  const btn = document.getElementById('btn-start-game');
  if (btn) btn.disabled = selectedClasses.length < playerCount;
}

// ─── Start Game ───────────────────────────────────────────────────────────────
async function _startGame(classOptions, villainCards) {
  // Create players
  const numPlayers = classOptions.length;
  G.players = classOptions.map((cc, i) => {
    const p = new Player(i, cc.card, G.toolDeck.draw());
    const pos = startPosition(i, numPlayers);
    p.x = pos.x; p.y = pos.y;
    return p;
  });

  // Pick random villain
  const villainCard = villainCards[Math.floor(Math.random() * villainCards.length)];
  const meta        = villainMeta(villainCard);
  const stats       = parseVillainStats(villainCard.stats);
  G.villain         = new Villain(villainCard, stats);
  const vStart      = villainStartPos(numPlayers);
  G.villain.x = vStart.x; G.villain.y = vStart.y;

  // Place key dice on board: (numPlayers + 1) dice, values 1…N
  G.totalKeyDiceCount = numPlayers + 1;
  G.keyDiceOnBoard    = [];
  G.nextKeyDieValue   = 1;

  for (let v = 1; v <= G.totalKeyDiceCount; v++) {
    let pos;
    let attempts = 0;
    do {
      pos = rollCoord();
      attempts++;
    } while (attempts < 50 && _isTileOccupied(pos.x, pos.y));
    G.keyDiceOnBoard.push({ id: v, value: v, x: pos.x, y: pos.y });
  }

  // Show villain reveal
  showScreen('game-screen');
  await showVillainReveal(G.villain);

  // Render static UI
  renderVillainPanel(G.villain);
  appendLog(`Game started! ${numPlayers} player(s) vs ${G.villain.name}.`, 'system');
  appendLog(`Collect ${G.totalKeyDiceCount} key dice in ascending order, then escape!`, 'system');
  G.players.forEach(p => appendLog(`${p.name} (P${p.id+1}) starts at (${p.x+1},${p.y+1}).`, 'system'));

  G.round = 1;
  appendRoundDivider(G.round);
  _startPlayerPhase();
}

// ─── Player Phase ─────────────────────────────────────────────────────────────
function _startPlayerPhase() {
  G.phase = 'PLAYER_TURN';
  G.activePlayerIdx = 0;
  _startPlayerTurn();
}

function _startPlayerTurn() {
  const p = _activePlayer();
  if (!p) { _startEnemyPhase(); return; }

  // Skip KO'd or escaped
  if (p.isKO || p.hasEscaped) { _advancePlayerTurn(); return; }

  p.startTurn(G);
  G.validMoves     = [];
  G.selectedToolCard = null;
  G.fighterBonusTurn = false;

  updatePhaseIndicator('PLAYER_TURN', p.name);
  updateRoundCounter(G.round);
  appendLog(`— ${p.name}'s turn —`, 'player');

  if (p.stunRounds > 0 || p.isKO) {
    appendLog(`${p.name} is stunned and skips their turn.`, 'player');
    setTimeout(() => _advancePlayerTurn(), 800);
    return;
  }

  _computeValidMoves();
  _refreshUI();
}

function _computeValidMoves() {
  const p = _activePlayer();
  if (!p || p.movesLeft <= 0) { G.validMoves = []; return; }
  const blocked = _blockedTiles();
  G.validMoves = validMoves(p, blocked);
}

function _refreshUI() {
  renderBoard(_boardEl, G, _onTileClick);
  renderPlayerHuds(G.players, G.activePlayerIdx, G);
  renderVillainPanel(G.villain);
  renderZombieList(G.zombies);
  renderEventRow(G.eventRow.all);
  _updateActions();
}

function _updateActions() {
  const p = _activePlayer();
  if (!p || p.isKO || p.hasEscaped || G.phase !== 'PLAYER_TURN') {
    updateActionBar({ endTurn: false });
    return;
  }

  const canPickup   = _adjacentKeyDie(p) !== null;
  const canEscape   = G.exitTile && p.x === G.exitTile.x && p.y === G.exitTile.y && p.keyDiceHeld.length > 0;
  const canAttack   = _adjacentEnemy(p) !== null;
  const canUseTool  = !p.actionUsed && p.tools.length > 0;

  // Special ability
  let showSpecial = false, specialLabel = '', canSpecial = false;
  if (p.classKey === 'athlete' && !p.actionUsed) {
    showSpecial  = true; specialLabel = 'Sprint (×2 MOV)'; canSpecial = true;
  } else if (p.classKey === 'scientist' && !p.actionUsed) {
    showSpecial  = true; specialLabel = 'Craft (D4)'; canSpecial = true;
  } else if (p.classKey === 'medic' && p.canMedicRevive(G).length > 0) {
    showSpecial  = true; specialLabel = 'Revive Ally'; canSpecial = true;
  }

  updateActionBar({
    endTurn: true,
    attack: canAttack && !p.actionUsed, canAttack,
    pickupDie: canPickup && !p.actionUsed, showPickup: canPickup,
    unlockExit: canEscape && !p.actionUsed, showExit: canEscape,
    useTool: canUseTool,
    special: canSpecial, showSpecial, specialLabel,
  });
}

// ─── Tile Click (movement) ────────────────────────────────────────────────────
async function _onTileClick(x, y, cost) {
  if (G.isProcessing) return;
  const p = _activePlayer();
  if (!p || p.movesLeft <= 0 || G.phase !== 'PLAYER_TURN') return;

  // Check it's a valid destination
  const isValid = G.validMoves.some(vm => vm.x === x && vm.y === y);
  if (!isValid) return;

  G.isProcessing = true;
  p.x = x; p.y = y;
  p.movesLeft -= cost;

  // Trapper: player stopped — roll check
  if (G.villain.type === 'trapper' && !p.isKO) {
    const trapRoll = roll.d6();
    if (trapRoll <= 2) {
      p.movesLeft = 0;
      appendLog(`🪤 Trapper! ${p.name} stops moving (rolled ${trapRoll}).`, 'enemy');
    }
  }

  appendLog(`${p.name} moves to (${x+1}, ${y+1}).`, 'player');

  // Check hazard damage
  const hz = G.hazards.find(h => h.x === x && h.y === y);
  if (hz) {
    p.knockOut();
    appendLog(`☣ ${p.name} enters a hazard zone and is knocked out!`, 'danger');
  }

  _computeValidMoves();
  _refreshUI();
  G.isProcessing = false;

  _checkAutoEndTurn(p);
}

function _checkAutoEndTurn(p) {
  if (p.movesLeft <= 0 && p.actionUsed) {
    setTimeout(() => _advancePlayerTurn(), 300);
  }
}

// ─── Action button handlers (exported to HTML via window) ─────────────────────
window.onActionEndTurn = () => { if (!G.isProcessing) _advancePlayerTurn(); };

window.onActionAttack = async () => {
  if (G.isProcessing) return;
  const p = _activePlayer();
  if (!p || p.actionUsed) return;
  const target = _adjacentEnemy(p);
  if (!target) return;

  G.isProcessing = true;
  p.actionUsed = true;
  const { logs } = await playerAttack(p, target, G);
  logs.forEach(l => appendLog(l, 'player'));

  // Handle counter-attack
  if (G.pendingCounterAttack) {
    const ca = G.pendingCounterAttack;
    G.pendingCounterAttack = null;
    const { logs: caLogs } = await villainAttack(ca.attacker, p, G);
    caLogs.forEach(l => appendLog(l, 'enemy'));
  }

  await _resolvePendingEffects();
  _refreshUI();
  G.isProcessing = false;
  _checkAutoEndTurn(p);
};

window.onActionPickupDie = () => {
  if (G.isProcessing) return;
  const p = _activePlayer();
  if (!p || p.actionUsed) return;

  const kd = _adjacentKeyDie(p);
  if (!kd) return;

  // Scientist picks up for free (no action)
  if (p.classKey !== 'scientist') p.actionUsed = true;

  p.collectKeyDie(kd.value);
  G.keyDiceOnBoard = G.keyDiceOnBoard.filter(k => k !== kd);
  appendLog(`${p.name} collects Key Die [${kd.value}]!`, 'success');

  // Update next key die target
  const remaining = G.keyDiceOnBoard.map(k => k.value).sort((a, b) => a - b);
  G.nextKeyDieValue = remaining.length > 0 ? remaining[0] : null;

  // If all key dice picked up → place exit
  if (G.keyDiceOnBoard.length === 0 && !G.exitTile) {
    let pos;
    do { pos = rollCoord(); } while (_isTileOccupied(pos.x, pos.y));
    G.exitTile = pos;
    appendLog(`🚪 All key dice collected! EXIT appears at (${pos.x+1},${pos.y+1})!`, 'success');
  }

  _refreshUI();
  _checkAutoEndTurn(p);
};

window.onActionUnlockExit = async () => {
  if (G.isProcessing) return;
  const p = _activePlayer();
  if (!p || p.actionUsed || !G.exitTile) return;
  if (p.x !== G.exitTile.x || p.y !== G.exitTile.y) return;
  if (p.keyDiceHeld.length === 0) return;

  G.isProcessing = true;
  p.actionUsed = true;

  const spent = p.spendKeyDiceAtExit();
  G.exitKeyDiceSpent.push(...spent);
  appendLog(`${p.name} spends key dice [${spent.join(', ')}] at the exit!`, 'success');

  // Check if all players' dice are spent
  const totalHeld = G.players.reduce((sum, pl) => sum + pl.keyDiceHeld.length, 0);
  if (G.exitKeyDiceSpent.length >= G.totalKeyDiceCount && totalHeld === 0) {
    p.hasEscaped = true;
    appendLog(`${p.name} ESCAPES!`, 'success');
    // All at exit?
    const allEscapable = G.players.filter(pl => !pl.isKO && !pl.hasEscaped).every(pl =>
      pl.x === G.exitTile.x && pl.y === G.exitTile.y
    );
    G.players.filter(pl => !pl.isKO && !pl.hasEscaped && pl.x === G.exitTile.x && pl.y === G.exitTile.y)
             .forEach(pl => { pl.hasEscaped = true; appendLog(`${pl.name} ESCAPES!`, 'success'); });

    if (_checkWin()) { G.isProcessing = false; return; }
  }

  _refreshUI();
  G.isProcessing = false;
};

window.onActionUseTool = async () => {
  if (G.isProcessing) return;
  const p = _activePlayer();
  if (!p || p.actionUsed || p.tools.length === 0) return;

  G.isProcessing = true;
  const toolCard = G.selectedToolCard || p.activeTools[0] || p.tools[0];
  const result   = await showToolModal(toolCard, G.players, G);

  if (result?.confirmed) {
    await _applyTool(p, toolCard, result.targetId);
    p.actionUsed = true;
    p.removeTool(toolCard);
    G.selectedToolCard = null;
  }

  _refreshUI();
  G.isProcessing = false;
  if (result?.confirmed) _checkAutoEndTurn(p);
};

window.onActionSpecial = async () => {
  if (G.isProcessing) return;
  const p = _activePlayer();
  if (!p || p.actionUsed) return;

  G.isProcessing = true;

  if (p.classKey === 'athlete') {
    p.useAthleteDouble(G);
    appendLog(`${p.name} sprints! MOV doubled to ${p.movesLeft}.`, 'player');
    _computeValidMoves();
  } else if (p.classKey === 'scientist') {
    const { result, gained } = p.scientistCraft(G.toolDeck);
    if (gained) appendLog(`${p.name} crafts a ${gained.title}!`, 'success');
    else appendLog(`${p.name} attempts to craft — rolled ${result}, nothing gained.`, 'player');
  } else if (p.classKey === 'medic') {
    const revivable = p.canMedicRevive(G);
    if (revivable.length > 0) {
      const target = revivable[0]; // Auto-revive nearest (could show picker)
      p.medicRevive(target, G);
      appendLog(`${p.name} revives ${target.name}! Both get +1 move.`, 'success');
    }
  }

  _refreshUI();
  G.isProcessing = false;
};

// ─── Tool select ─────────────────────────────────────────────────────────────
function onToolSelect(playerId, toolIdx) {
  const p = G.players[playerId];
  if (!p || p.id !== _activePlayer()?.id) return;
  G.selectedToolCard = p.tools[toolIdx] || null;
  _refreshUI();
}

// ─── Apply tool card effect ───────────────────────────────────────────────────
async function _applyTool(player, tool, targetId) {
  const title = tool.title;
  const desc  = (tool.description || '').toLowerCase();
  const logs  = [];

  if (title === 'MedKit') {
    const target = targetId !== null ? G.players.find(p => p.id === targetId) : player;
    if (target?.isKO) { target.revive(); logs.push(`${player.name} revives ${target.name}!`); }
    else               { logs.push(`${player.name} uses MedKit (no KO target).`); }
  } else if (title === 'Bear trap' || title === 'Beartraps') {
    G.hazards.push({ type: 'trap', x: player.x, y: player.y, roundsLeft: 99, stuns: true });
    logs.push(`${player.name} places a bear trap at (${player.x+1},${player.y+1}).`);
  } else if (title === 'Tazer' || title === 'Flashbang' || title === 'Unstable plasma cannon') {
    const enemy = _adjacentEnemy(player, 4);
    if (enemy) {
      enemy.stunRounds = Math.max(enemy.stunRounds, 1);
      logs.push(`${player.name} stuns ${enemy.name || 'enemy'}!`);
    }
  } else if (title === 'Flashbang') {
    [G.villain, ...G.zombies].filter(e => e && !e.isDefeated && chebyshev(player, e) <= 3).forEach(e => {
      e.stunRounds = Math.max(e.stunRounds || 0, 1);
    });
    logs.push(`${player.name} throws a flashbang — all enemies in 3 tiles stunned!`);
  } else if (title === 'Decrypter') {
    G.effects.decrypter = true;
    logs.push(`${player.name} uses Decrypter — next puzzle action is free.`);
  } else if (title === 'Chillie mist') {
    player.chilleMist = true;
    logs.push(`${player.name} uses Chillie Mist — villain ignores them this turn.`);
  } else if (title === 'Bow') {
    const enemy = _closestEnemy(player, 4);
    if (enemy) {
      player.actionUsed = false; // Bow allows ranged attack as tool use
      const { logs: cLogs } = await playerAttack(player, enemy, G);
      logs.push(...cLogs);
    }
  } else {
    logs.push(`${player.name} uses ${title}.`);
  }

  logs.forEach(l => appendLog(l, 'player'));
}

// ─── Advance to next player ───────────────────────────────────────────────────
function _advancePlayerTurn() {
  // Fighter bonus turn
  if (G.fighterBonusTurn) {
    G.fighterBonusTurn = false;
    appendLog(`⚔️ Fighter bonus turn!`, 'player');
    _startPlayerTurn();
    return;
  }

  G.activePlayerIdx++;
  if (G.activePlayerIdx >= G.players.length) {
    _startEnemyPhase();
  } else {
    _startPlayerTurn();
  }
}

// ─── Enemy Phase ──────────────────────────────────────────────────────────────
async function _startEnemyPhase() {
  if (_checkLose() || _checkWin()) return;
  G.phase = 'ENEMY_TURN';
  G.isProcessing = true;
  updatePhaseIndicator('ENEMY_TURN');
  appendLog('── Enemy turn ──', 'enemy');

  await _runVillainTurn();
  await _runZombieTurns();

  if (G.villain.extraActivation) {
    G.villain.extraActivation = false;
    appendLog('😡 Angry Monster — villain acts again!', 'enemy');
    await _runVillainTurn();
  }

  G.isProcessing = false;
  if (_checkLose()) return;
  _startEventPhase();
}

async function _runVillainTurn() {
  const { logs, skip } = await G.villain.startTurn(G);
  logs.forEach(l => appendLog(l, 'enemy'));
  if (skip) { _refreshUI(); return; }

  if (G.gamblerWin) { _gameLose('The Gambler rolled double 6 and wins!'); return; }
  if (G.pendingGamblerDiscardTool) {
    G.pendingGamblerDiscardTool = false;
    G.players.forEach(p => { if (p.tools.length > 0) p.tools.pop(); });
    appendLog('Gambler effect: all players discard 1 tool.', 'enemy');
  }

  // Move
  const blocked  = _blockedTiles(true);
  const moveLogs = G.villain.move(G.players, blocked);
  moveLogs.forEach(l => appendLog(l, 'enemy'));

  // Attack adjacent players
  await _villainAttackAdjacent();

  // Stalker double-attack if on same tile
  if (G.villain.type === 'stalker' &&
      G.players.some(p => p.x === G.villain.x && p.y === G.villain.y && !p.isKO)) {
    await _villainAttackAdjacent();
  }

  _refreshUI();
}

async function _villainAttackAdjacent() {
  const adjacent = G.players.filter(p => !p.isKO && !p.hasEscaped && chebyshev(G.villain, p) <= 1);
  for (const p of adjacent) {
    if (G.villain.stunRounds > 0) break;
    if (p.chilleMist) { p.chilleMist = false; appendLog(`${p.name}'s Chillie Mist deflects the villain!`, 'player'); continue; }
    const { logs } = await villainAttack(G.villain, p, G);
    logs.forEach(l => appendLog(l, 'enemy'));
    if (G.pendingCounterAttack) {
      const ca = G.pendingCounterAttack;
      G.pendingCounterAttack = null;
      const { logs: caLogs } = await playerAttack(ca.defender, G.villain, G);
      caLogs.forEach(l => appendLog(l, 'player'));
    }
    if (_checkLose()) return;
  }
}

async function _runZombieTurns() {
  for (const z of G.zombies.filter(zb => !zb.isDefeated)) {
    const log = z.move(G.players, _blockedTiles(true));
    if (log) appendLog(log, 'enemy');
    // Zombie attacks
    const adj = G.players.find(p => !p.isKO && !p.hasEscaped && chebyshev(z, p) <= 1);
    if (adj) {
      const { logs } = await villainAttack(z, adj, G);
      logs.forEach(l => appendLog(l, 'enemy'));
      if (_checkLose()) return;
    }
  }
}

// ─── Event Phase ──────────────────────────────────────────────────────────────
async function _startEventPhase() {
  G.phase = 'EVENT_DRAW';
  G.isProcessing = true;
  updatePhaseIndicator('EVENT_DRAW');
  appendLog('── Event draw ──', 'event');

  // Tick existing persistent events
  G.eventRow.tick();
  // Decrement multi-round effects
  if (G.effects.doubleAtk > 0) G.effects.doubleAtk--;
  if (G.effects.fogStrong > 0) G.effects.fogStrong--;

  // Draw 1 card per active player
  const numDraws = G.players.filter(p => !p.isKO && !p.hasEscaped).length;
  for (let i = 0; i < numDraws; i++) {
    const card = G.eventDeck.draw();
    if (!card) break;
    appendLog(`Event: ${card.title}`, 'event');
    G.eventRow.add(card);
    const logs = applyEventEffect(card, G);
    logs.forEach(l => appendLog(l, 'event'));
    await _resolvePendingEffects();
  }

  // Double trouble
  if (G.pendingDoubleTrouble) {
    G.pendingDoubleTrouble = false;
    const extra = G.eventDeck.draw();
    if (extra) {
      appendLog(`Double Trouble: ${extra.title} triggers twice!`, 'event');
      for (let t = 0; t < 2; t++) {
        const logs = applyEventEffect(extra, G);
        logs.forEach(l => appendLog(l, 'event'));
        await _resolvePendingEffects();
      }
    }
  }

  renderEventRow(G.eventRow.all);
  G.isProcessing = false;
  if (_checkLose() || _checkWin()) return;
  _nextRound();
}

// ─── Resolve queued effects ───────────────────────────────────────────────────
async function _resolvePendingEffects() {
  if (G.pendingZombieSpawn || G.pendingGolemSpawn) {
    G.pendingZombieSpawn = false;
    G.pendingGolemSpawn  = false;
    const pos  = rollCoord();
    const atk  = G.pendingGolemSpawn ? 4 : 3;
    const def  = G.pendingGolemSpawn ? 6 : 3;
    const z    = new Zombie(pos.x, pos.y);
    z.atk = atk; z.def = def;
    G.zombies.push(z);
    appendLog(`🧟 Zombie spawns at (${pos.x+1},${pos.y+1})!`, 'event');
  }

  if (G.pendingAmmoGrant) {
    G.pendingAmmoGrant = false;
    G.players.filter(p => !p.isKO && !p.hasEscaped).forEach(p => {
      const tool = G.toolDeck.draw();
      if (tool) { p.addTool(tool); appendLog(`${p.name} receives ${tool.title}.`, 'event'); }
    });
  }

  if (G.pendingRoulette) {
    G.pendingRoulette = false;
    G.players.filter(p => !p.isKO && !p.hasEscaped).forEach(p => {
      const r = roll.d6();
      if (r === 1) { p.knockOut(); appendLog(`🎰 ${p.name} rolled 1 — KO'd!`, 'danger'); }
      else         { appendLog(`🎰 ${p.name} rolled ${r} — safe.`, 'event'); }
    });
  }

  if (G.pendingStunRoulette) {
    G.pendingStunRoulette = false;
    [...G.players.filter(p => !p.isKO && !p.hasEscaped), G.villain].forEach(e => {
      const r = roll.d6();
      if (r === 1) { e.stunRounds = Math.max(e.stunRounds || 0, 1); appendLog(`⚡ ${e.name} stunned!`, 'event'); }
    });
  }

  if (G.pendingBatSwarm) {
    G.pendingBatSwarm = false;
    G.players.filter(p => !p.isKO && !p.hasEscaped && p.effectiveAtk(G) < 3).forEach(p => {
      p.stunRounds = Math.max(p.stunRounds, 1);
      appendLog(`🦇 ${p.name} is stunned by bats!`, 'event');
    });
  }

  if (G.pendingAcidRain) {
    G.pendingAcidRain = false;
    G.players.filter(p => !p.isKO && !p.hasEscaped && p.effectiveDef() < 3).forEach(p => {
      p.stunRounds = Math.max(p.stunRounds, 1);
      appendLog(`☠ ${p.name} is stunned by acid rain!`, 'event');
    });
  }

  if (G.pendingMeteor) {
    G.pendingMeteor = false;
    const pos = rollCoord();
    appendLog(`☄️ Meteor strikes (${pos.x+1},${pos.y+1})! 4-tile radius KO.`, 'event');
    G.players.filter(p => !p.isKO && chebyshev(p, pos) <= 4).forEach(p => {
      p.knockOut(); appendLog(`${p.name} is caught in the blast!`, 'danger');
    });
    if (chebyshev(G.villain, pos) <= 4) {
      G.villain.stunRounds = Math.max(G.villain.stunRounds, 1);
      appendLog(`${G.villain.name} is stunned by the meteor!`, 'event');
    }
  }

  if (G.pendingLightning) {
    G.pendingLightning = false;
    const pos = rollCoord();
    appendLog(`🌩 Lightning strikes (${pos.x+1},${pos.y+1})!`, 'event');
    G.players.filter(p => !p.isKO && p.x === pos.x && p.y === pos.y).forEach(p => {
      p.knockOut(); appendLog(`${p.name} takes a direct lightning hit — KO!`, 'danger');
    });
    G.players.filter(p => !p.isKO && chebyshev(p, pos) <= 2 && !(p.x === pos.x && p.y === pos.y)).forEach(p => {
      p.stunRounds = Math.max(p.stunRounds, 1);
      appendLog(`${p.name} is stunned by nearby lightning.`, 'event');
    });
  }

  if (G.pendingToxicGas) {
    G.pendingToxicGas = false;
    const pos = rollCoord();
    G.hazards.push({ type: 'toxic', x: pos.x, y: pos.y, roundsLeft: 2, radius: 1 });
    appendLog(`☣ Toxic gas fills (${pos.x+1},${pos.y+1}) area for 2 rounds.`, 'event');
  }

  if (G.pendingLava) {
    G.pendingLava = false;
    const pos = rollCoord();
    G.hazards.push({ type: 'lava', x: pos.x, y: pos.y, roundsLeft: 99 });
    appendLog(`🌋 Lava appears at (${pos.x+1},${pos.y+1})!`, 'event');
  }

  if (G.pendingEarthquake) {
    G.pendingEarthquake = false;
    [...G.players.filter(p => !p.isKO && !p.hasEscaped), G.villain].forEach(e => {
      const r = roll.d6();
      if (r === 1) {
        if (e.stunRounds !== undefined) e.stunRounds = Math.max(e.stunRounds, 1);
        else if (e.knockOut) e.knockOut();
        appendLog(`🌍 ${e.name} struck by earthquake (rolled 1)!`, 'event');
      }
    });
  }

  if (G.pendingMixer) {
    G.pendingMixer = false;
    const active = G.players.filter(p => !p.isKO && !p.hasEscaped);
    if (active.length > 0) {
      const target = active[Math.floor(Math.random() * active.length)];
      const pos = rollCoord();
      target.x = pos.x; target.y = pos.y;
      appendLog(`🌀 ${target.name} is teleported to (${pos.x+1},${pos.y+1})!`, 'event');
    }
  }

  if (G.pendingComeToMe) {
    G.pendingComeToMe = false;
    G.players.filter(p => !p.isKO && !p.hasEscaped).forEach(p => {
      const dx = Math.sign(G.villain.x - p.x);
      const dy = Math.sign(G.villain.y - p.y);
      const nx = Math.max(0, Math.min(19, p.x + dx));
      const ny = Math.max(0, Math.min(19, p.y + dy));
      p.x = nx; p.y = ny;
      appendLog(`${p.name} is pulled toward the villain!`, 'event');
    });
  }

  // Tick hazard rounds
  G.hazards = G.hazards.filter(h => --h.roundsLeft > 0);
}

// ─── Round management ─────────────────────────────────────────────────────────
function _nextRound() {
  G.round++;
  appendRoundDivider(G.round);
  updateRoundCounter(G.round);
  _startPlayerPhase();
}

// ─── Win / Lose checks ────────────────────────────────────────────────────────
function _checkWin() {
  const allSafe = G.players.every(p => p.hasEscaped || p.isKO);
  const anyEscaped = G.players.some(p => p.hasEscaped);
  if (anyEscaped && G.players.filter(p => !p.isKO).every(p => p.hasEscaped)) {
    _gameWin();
    return true;
  }
  return false;
}

function _checkLose() {
  if (G.players.every(p => p.isKO || p.hasEscaped) && !G.players.some(p => p.hasEscaped)) {
    _gameLose('All survivors are down…');
    return true;
  }
  return false;
}

function _gameWin() {
  G.phase = 'WIN';
  updatePhaseIndicator('WIN');
  appendLog('🎉 ESCAPED! You win!', 'success');
  _refreshUI();
  setTimeout(() => showEndgame(true, G.round), 600);
}

function _gameLose(reason = "All survivors KO'd.") {
  G.phase = 'LOSE';
  updatePhaseIndicator('LOSE');
  appendLog(`💀 GAME OVER — ${reason}`, 'danger');
  _refreshUI();
  setTimeout(() => showEndgame(false, G.round), 600);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _activePlayer() { return G.players[G.activePlayerIdx] || null; }

function _blockedTiles(includePlayerTiles = false) {
  const set = new Set();
  if (includePlayerTiles) {
    G.players.filter(p => !p.isKO && !p.hasEscaped).forEach(p => set.add(`${p.x},${p.y}`));
  }
  G.hazards.filter(h => h.type === 'lava').forEach(h => set.add(`${h.x},${h.y}`));
  return set;
}

function _isTileOccupied(x, y) {
  if (G.players.some(p => p.x === x && p.y === y)) return true;
  if (G.villain && G.villain.x === x && G.villain.y === y) return true;
  if (G.keyDiceOnBoard.some(k => k.x === x && k.y === y)) return true;
  return false;
}

/** closest key die adjacent or on player's tile that is the next value to collect */
function _adjacentKeyDie(player) {
  return G.keyDiceOnBoard.find(kd =>
    kd.value === G.nextKeyDieValue &&
    chebyshev(player, kd) <= 1
  ) || null;
}

/** An adjacent enemy (villain or zombie) within melee range, optionally up to maxRange. */
function _adjacentEnemy(player, maxRange = 1) {
  if (!player) return null;
  const enemies = [G.villain, ...G.zombies.filter(z => !z.isDefeated)];
  return enemies.find(e => e && !e.isStunned && chebyshev(player, e) <= maxRange) || null;
}

function _closestEnemy(player, maxRange = 20) {
  const enemies = [G.villain, ...G.zombies.filter(z => !z.isDefeated)].filter(e => e && chebyshev(player, e) <= maxRange);
  if (!enemies.length) return null;
  return enemies.reduce((best, e) => chebyshev(player, e) < chebyshev(player, best) ? e : best);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
