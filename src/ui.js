// ─────────────────────────────────────────────────
//  ui.js  — DOM rendering helpers
// ─────────────────────────────────────────────────

// ─── Screen switching ─────────────────────────────────────────────────────────
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ─── Phase indicator ──────────────────────────────────────────────────────────
const PHASE_LABELS = {
  SETUP:       'SETUP',
  PLAYER_TURN: 'PLAYER TURN',
  ENEMY_TURN:  'ENEMY TURN',
  EVENT_DRAW:  'EVENT DRAW',
  WIN:         'ESCAPED',
  LOSE:        'GAME OVER',
};
const PHASE_CLASS = {
  PLAYER_TURN: 'phase-player',
  ENEMY_TURN:  'phase-enemy',
  EVENT_DRAW:  'phase-event',
};

export function updatePhaseIndicator(phase, playerName = '') {
  const el = document.getElementById('phase-indicator');
  if (!el) return;
  el.className = 'phase-indicator ' + (PHASE_CLASS[phase] || 'phase-setup');
  el.textContent = phase === 'PLAYER_TURN' && playerName
    ? `${playerName.toUpperCase()}'S TURN`
    : PHASE_LABELS[phase] || phase;
}

export function updateRoundCounter(round) {
  const el = document.getElementById('round-counter');
  if (el) el.textContent = `Round ${round}`;
}

// ─── Player HUDs ─────────────────────────────────────────────────────────────
export function renderPlayerHuds(players, activeIdx, state) {
  const container = document.getElementById('player-huds');
  if (!container) return;
  container.innerHTML = '';

  for (const p of players) {
    const isActive = p.id === (players[activeIdx]?.id ?? -1);
    const statusText = p.hasEscaped ? 'ESCAPED'
                     : p.isKO      ? 'KO'
                     : p.stunRounds > 0 ? `STUNNED ${p.stunRounds}`
                     : 'OK';
    const statusClass = p.hasEscaped ? 'status-escaped'
                      : p.isKO      ? 'status-ko'
                      : p.stunRounds > 0 ? 'status-stunned'
                      : 'status-ok';

    const movPips = _movPips(p.movesLeft, p.mov);
    const keyChips = p.keyDiceHeld.map(v =>
      `<div class="key-die-chip" title="Key Die: ${v}">${v}</div>`
    ).join('');
    const toolChips = p.tools.map((t, ti) =>
      `<div class="tool-chip${state?.selectedToolCard === t ? ' selected-tool' : ''}"
            data-player="${p.id}" data-tool="${ti}" title="${t.description || ''}">${_shortTitle(t.title)}</div>`
    ).join('');

    const hud = document.createElement('div');
    hud.className = `player-hud${isActive ? ' active-turn' : ''}${p.isKO ? ' ko' : ''}${p.hasEscaped ? ' escaped' : ''}`;
    hud.style.setProperty('--player-color', p.color);
    hud.id = `hud-p${p.id}`;
    hud.innerHTML = `
      <div class="hud-top">
        <div>
          <div class="hud-name">${p.icon} ${p.name}</div>
          <div class="hud-player-num">PLAYER ${p.id + 1}</div>
        </div>
        <div class="hud-status ${statusClass}">${statusText}</div>
      </div>
      <div class="hud-stats">
        <div class="hud-stat"><span class="s-label">ATK</span><span class="s-val">${p.effectiveAtk(state)}</span></div>
        <div class="hud-stat"><span class="s-label">DEF</span><span class="s-val">${p.effectiveDef()}</span></div>
        <div class="hud-stat"><span class="s-label">MOV</span><span class="s-val">${p.effectiveMov(state)}</span></div>
      </div>
      ${isActive && !p.isKO ? `
      <div class="hud-moves">
        <span class="m-label">MOVES</span>
        <div class="move-pips">${movPips}</div>
        <span class="m-label" style="margin-left:4px">${p.movesLeft}</span>
      </div>` : ''}
      ${keyChips ? `<div class="hud-key-dice">${keyChips}</div>` : ''}
      ${toolChips ? `<div class="hud-tools">${toolChips}</div>` : ''}
    `;
    container.appendChild(hud);
  }

  // Attach tool click listeners
  container.querySelectorAll('.tool-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      const pid   = parseInt(e.target.dataset.player);
      const tidx  = parseInt(e.target.dataset.tool);
      window._game?.onToolSelect(pid, tidx);
    });
  });
}

function _movPips(movesLeft, maxMov) {
  return Array.from({ length: maxMov }, (_, i) =>
    `<div class="move-pip${i < movesLeft ? ' active' : ''}"></div>`
  ).join('');
}

function _shortTitle(title) {
  if (!title) return '?';
  if (title.length <= 12) return title;
  return title.slice(0, 10) + '…';
}

// ─── Villain Panel ────────────────────────────────────────────────────────────
export function renderVillainPanel(villain) {
  const panel = document.getElementById('villain-panel');
  if (!panel || !villain) return;

  const statusLine = villain.stunRounds > 0
    ? `<div class="villain-status text-success">⚡ STUNNED (${villain.stunRounds} rounds)</div>`
    : '';

  panel.innerHTML = `
    <div class="villain-header">
      <div class="villain-icon">${_villainIcon(villain.type)}</div>
      <div>
        <div class="villain-name">${villain.name}</div>
        <div style="font-size:0.65rem;color:var(--text-secondary);font-family:'Share Tech Mono',monospace">VILLAIN</div>
      </div>
    </div>
    <div class="villain-stat-row">
      <div class="villain-stat"><span class="v-label">ATK</span><span class="v-val">${_statStr(villain.atk)}</span></div>
      <div class="villain-stat"><span class="v-label">DEF</span><span class="v-val">${_statStr(villain.def)}</span></div>
      <div class="villain-stat"><span class="v-label">MOV</span><span class="v-val">${_statStr(villain.mov)}</span></div>
    </div>
    <div class="villain-ability">${(villain.card.description || '').slice(0, 140)}…</div>
    ${statusLine}
  `;
}

function _statStr(val) {
  if (val === null || val === undefined) return '—';
  if (val === 'd6' || val === 'D6') return 'D6';
  return val;
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

// ─── Zombie List ──────────────────────────────────────────────────────────────
export function renderZombieList(zombies) {
  const el = document.getElementById('zombie-list');
  if (!el) return;
  const active = zombies.filter(z => !z.isDefeated);
  if (active.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="log-section-label">Zombies</div>
    ${active.map(z => `
      <div class="zombie-entry">
        🧟 #${z.id} ${z.stunRounds > 0 ? '[STUNNED]' : ''}
      </div>`).join('')}
  `;
}

// ─── Event Row ────────────────────────────────────────────────────────────────
export function renderEventRow(slots) {
  const el = document.getElementById('event-row');
  if (!el) return;
  el.innerHTML = '';

  if (slots.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--text-secondary);font-size:0.7rem;font-family:"Share Tech Mono",monospace;align-self:center;padding:8px';
    empty.textContent = '— No active events —';
    el.appendChild(empty);
    return;
  }

  for (const slot of slots) {
    const card = document.createElement('div');
    card.className = 'event-card-mini';
    card.title = slot.card.description || '';
    card.innerHTML = `
      <div class="ecm-type">EVENT</div>
      <div class="ecm-title">${slot.card.title}</div>
      <div class="ecm-desc">${slot.card.description || ''}</div>
      ${slot.roundsLeft > 1 ? `<div class="ecm-rounds">${slot.roundsLeft}</div>` : ''}
    `;
    card.onclick = () => showEventDetail(slot.card);
    el.appendChild(card);
  }
}

// ─── Game Log ─────────────────────────────────────────────────────────────────
export function appendLog(message, type = 'system') {
  const container = document.getElementById('game-log-container');
  if (!container) return;

  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.textContent = message;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

export function appendRoundDivider(round) {
  const container = document.getElementById('game-log-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'log-round-divider';
  div.textContent = `── ROUND ${round} ──`;
  container.appendChild(div);
}

// ─── Action Bar ───────────────────────────────────────────────────────────────
/**
 * Update which action buttons are visible and enabled.
 * @param {object} actions — { endTurn, attack, pickupDie, unlockExit, useTool, athleteDouble, medicRevive, scientistCraft }
 */
export function updateActionBar(actions = {}) {
  const btnEndTurn    = document.getElementById('btn-end-turn');
  const btnAttack     = document.getElementById('btn-attack');
  const btnPickupDie  = document.getElementById('btn-pickup-die');
  const btnUnlockExit = document.getElementById('btn-unlock-exit');
  const btnUseTool    = document.getElementById('btn-use-tool');
  const btnSpecial    = document.getElementById('btn-special');

  if (btnEndTurn)    btnEndTurn.disabled    = !actions.endTurn;
  if (btnAttack) {
    btnAttack.disabled   = !actions.attack;
    btnAttack.style.display = actions.canAttack ? '' : 'none';
  }
  if (btnPickupDie) {
    btnPickupDie.disabled = !actions.pickupDie;
    btnPickupDie.style.display = actions.showPickup ? '' : 'none';
  }
  if (btnUnlockExit) {
    btnUnlockExit.disabled = !actions.unlockExit;
    btnUnlockExit.style.display = actions.showExit ? '' : 'none';
  }
  if (btnUseTool)    btnUseTool.disabled    = !actions.useTool;
  if (btnSpecial) {
    btnSpecial.disabled  = !actions.special;
    btnSpecial.style.display = actions.showSpecial ? '' : 'none';
    if (actions.specialLabel) btnSpecial.textContent = `★ ${actions.specialLabel}`;
  }
}

// ─── Endgame overlay ──────────────────────────────────────────────────────────
export function showEndgame(win, round) {
  const modal = document.getElementById('endgame-modal');
  if (!modal) return;
  modal.className = `modal-overlay active ${win ? 'win-overlay' : 'lose-overlay'}`;
  document.getElementById('endgame-icon').textContent     = win ? '🚪' : '💀';
  document.getElementById('endgame-title').textContent    = win ? 'ESCAPED!' : 'GAME OVER';
  document.getElementById('endgame-subtitle').textContent = win
    ? 'Your team escaped the Helix Alpha facility!'
    : 'All survivors were defeated…';
  document.getElementById('endgame-round').textContent    = `Rounds survived: ${round}`;
}

// ─── Villain reveal modal ─────────────────────────────────────────────────────
export function showVillainReveal(villain) {
  return new Promise(resolve => {
    const modal = document.getElementById('villain-reveal-modal');
    if (!modal) return resolve();

    document.getElementById('vr-icon').textContent  = _villainIcon(villain.type);
    document.getElementById('vr-name').textContent  = villain.name;
    document.getElementById('vr-atk').textContent   = _statStr(villain.atk);
    document.getElementById('vr-def').textContent   = _statStr(villain.def);
    document.getElementById('vr-mov').textContent   = villain.mov === null ? '∞' : _statStr(villain.mov);
    document.getElementById('vr-ability').textContent = villain.card.description || '';

    modal.classList.add('active');
    const btn = document.getElementById('vr-ok-btn');
    btn.onclick = () => { modal.classList.remove('active'); resolve(); };
  });
}

// ─── Event detail modal ───────────────────────────────────────────────────────
export function showEventDetail(card) {
  const modal = document.getElementById('event-detail-modal');
  if (!modal) return;
  document.getElementById('ed-title').textContent = card.title;
  document.getElementById('ed-desc').textContent  = card.description || '';
  modal.classList.add('active');
}

// ─── Tool use modal ───────────────────────────────────────────────────────────
/**
 * Show modal to use a tool card, optionally prompting for a target.
 * Returns a Promise<{confirmed, targetId}|null>.
 */
export function showToolModal(toolCard, players, state) {
  return new Promise(resolve => {
    const modal = document.getElementById('tool-modal');
    if (!modal) return resolve(null);

    document.getElementById('tm-title').textContent = toolCard.title;
    document.getElementById('tm-desc').textContent  = toolCard.description || '';

    const targetsEl = document.getElementById('tm-targets');
    targetsEl.innerHTML = '';

    const desc = (toolCard.description || '').toLowerCase();
    const needsTarget = desc.includes('adjacent') || desc.includes('ally') || desc.includes('player');

    if (needsTarget) {
      players.filter(p => !p.isKO && !p.hasEscaped).forEach(p => {
        const btn = document.createElement('button');
        btn.className   = 'tool-target-btn';
        btn.textContent = `${p.name} (P${p.id + 1})`;
        btn.onclick = () => { modal.classList.remove('active'); resolve({ confirmed: true, targetId: p.id }); };
        targetsEl.appendChild(btn);
      });
    }

    modal.classList.add('active');

    document.getElementById('tm-use-btn').onclick = () => {
      modal.classList.remove('active');
      resolve({ confirmed: true, targetId: null });
    };
    document.getElementById('tm-cancel-btn').onclick = () => {
      modal.classList.remove('active');
      resolve(null);
    };
  });
}
