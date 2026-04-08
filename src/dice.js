// ─────────────────────────────────────────────────
//  dice.js  — Roll utilities + animated modal
// ─────────────────────────────────────────────────

export const roll = {
  d4:  () => Math.floor(Math.random() * 4)  + 1,
  d6:  () => Math.floor(Math.random() * 6)  + 1,
  d20: () => Math.floor(Math.random() * 20) + 1,
  n:   (count, sides) => Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1),
};

export function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

/** Roll a random board coordinate (0-indexed, 0–19) */
export function rollCoord() { return { x: roll.d20() - 1, y: roll.d20() - 1 }; }

/** Fisher-Yates shuffle */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────
//  Animated combat dice modal
// ─────────────────────────────────────────────────

const ANIM_MS = 600; // pre-reveal spin duration

/**
 * Show combat dice roll modal.
 * @param {string} attackerName
 * @param {number} atkCount  — number of ATK dice
 * @param {string} defenderName
 * @param {number} defCount  — number of DEF dice
 * @returns {Promise<{atkRolls, defRolls, atkTotal, defTotal, outcome: 'atk'|'def'|'tie'}>}
 */
export function showCombatRoll(attackerName, atkCount, defenderName, defCount) {
  return new Promise(resolve => {
    const modal   = document.getElementById('dice-modal');
    const content = modal.querySelector('.modal-box');

    const atkRolls = roll.n(Math.max(1, atkCount), 6);
    const defRolls = roll.n(Math.max(1, defCount), 6);
    const atkTotal = sum(atkRolls);
    const defTotal = sum(defRolls);
    const outcome  = atkTotal > defTotal ? 'atk' : defTotal > atkTotal ? 'def' : 'tie';

    content.innerHTML = `
      <div class="modal-title">⚔ Combat</div>
      <div class="dice-vs-section">
        <div class="dice-side">
          <div class="dice-side-label">${attackerName}<br>ATK ×${atkRolls.length}</div>
          <div class="dice-roll-area" id="atk-dice-area">
            ${atkRolls.map(() => `<div class="die-face atk rolling">?</div>`).join('')}
          </div>
          <div class="dice-side-total atk" id="atk-total">—</div>
        </div>
        <div class="dice-vs-text">VS</div>
        <div class="dice-side">
          <div class="dice-side-label">${defenderName}<br>DEF ×${defRolls.length}</div>
          <div class="dice-roll-area" id="def-dice-area">
            ${defRolls.map(() => `<div class="die-face def rolling">?</div>`).join('')}
          </div>
          <div class="dice-side-total def" id="def-total">—</div>
        </div>
      </div>
      <div class="dice-result-text" id="combat-result-text" style="visibility:hidden">—</div>
      <div id="tie-buttons" class="hidden modal-btn-row"></div>
      <div id="dice-ok-row" class="modal-btn-row hidden">
        <button class="modal-btn primary" id="dice-ok-btn">Continue</button>
      </div>
    `;

    modal.classList.add('active');

    // Animate in results after spin
    setTimeout(() => {
      const atkDivs = content.querySelectorAll('#atk-dice-area .die-face');
      const defDivs = content.querySelectorAll('#def-dice-area .die-face');
      atkDivs.forEach((d, i) => { d.classList.remove('rolling'); d.textContent = atkRolls[i]; });
      defDivs.forEach((d, i) => { d.classList.remove('rolling'); d.textContent = defRolls[i]; });
      document.getElementById('atk-total').textContent = atkTotal;
      document.getElementById('def-total').textContent = defTotal;

      const resultEl = document.getElementById('combat-result-text');
      resultEl.style.visibility = 'visible';

      if (outcome === 'atk') {
        resultEl.className = 'dice-result-text win';
        resultEl.textContent = `${attackerName} wins!`;
        _showOkButton(modal, () => resolve({ atkRolls, defRolls, atkTotal, defTotal, outcome }));
      } else if (outcome === 'def') {
        resultEl.className = 'dice-result-text lose';
        resultEl.textContent = `${defenderName} holds!`;
        _showOkButton(modal, () => resolve({ atkRolls, defRolls, atkTotal, defTotal, outcome }));
      } else {
        resultEl.className = 'dice-result-text tie';
        resultEl.textContent = 'Tie! Defender chooses…';
        // Show flee / counter buttons
        const tieBtns = document.getElementById('tie-buttons');
        tieBtns.classList.remove('hidden');
        tieBtns.innerHTML = `
          <button class="modal-btn secondary" id="btn-flee">Flee</button>
          <button class="modal-btn danger"    id="btn-counter">Counter-Attack</button>
        `;
        document.getElementById('btn-flee').onclick = () => {
          modal.classList.remove('active');
          resolve({ atkRolls, defRolls, atkTotal, defTotal, outcome: 'tie-flee' });
        };
        document.getElementById('btn-counter').onclick = () => {
          modal.classList.remove('active');
          resolve({ atkRolls, defRolls, atkTotal, defTotal, outcome: 'tie-counter' });
        };
      }
    }, ANIM_MS);
  });
}

function _showOkButton(modal, cb) {
  const row = modal.querySelector('#dice-ok-row');
  row.classList.remove('hidden');
  modal.querySelector('#dice-ok-btn').onclick = () => {
    modal.classList.remove('active');
    cb();
  };
}

/**
 * Show a simple single-die roll modal (e.g. Gambler, Scientist craft).
 * @returns {Promise<number>}
 */
export function showSingleRoll(label, sides) {
  return new Promise(resolve => {
    const modal   = document.getElementById('dice-modal');
    const content = modal.querySelector('.modal-box');
    const result  = roll.n(1, sides)[0];

    content.innerHTML = `
      <div class="modal-title">${label}</div>
      <div class="dice-roll-area" style="justify-content:center;margin:20px 0">
        <div class="die-face rolling" style="width:64px;height:64px;font-size:2.2rem" id="single-die">?</div>
      </div>
      <div id="dice-ok-row" class="modal-btn-row hidden">
        <button class="modal-btn primary" id="dice-ok-btn">Continue</button>
      </div>
    `;
    modal.classList.add('active');

    setTimeout(() => {
      const die = document.getElementById('single-die');
      die.classList.remove('rolling');
      die.textContent = result;
      _showOkButton(modal, () => resolve(result));
    }, ANIM_MS);
  });
}
