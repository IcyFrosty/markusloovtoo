// ─────────────────────────────────────────────────
//  combat.js  — ATK×D6 vs DEF×D6 resolution
// ─────────────────────────────────────────────────
import { roll, sum, showCombatRoll } from './dice.js';
import { chebyshev } from './player.js';

/**
 * Check if attacker is in range to attack defender.
 * Most attacks require adjacency (Chebyshev distance ≤ 1).
 * Some tool attacks extend this range.
 */
export function inMeleeRange(attacker, defender) {
  return chebyshev(attacker, defender) <= 1;
}

/**
 * Check if a player can use their Bow to attack at range.
 */
export function bowRange(player, target) {
  const hasBow = player.tools.some(t => t.title === 'Bow');
  return hasBow && chebyshev(player, target) <= 4;
}

/**
 * Resolve combat between attacker and defender.
 * Uses the animated dice modal to show the rolls.
 *
 * @param {string} attackerName
 * @param {number} atkDice  — number of ATK dice to roll
 * @param {string} defenderName
 * @param {number} defDice  — number of DEF dice to roll
 * @returns {Promise<{atkTotal, defTotal, outcome}>}
 *   outcome: 'atk' (attacker wins) | 'def' (defender holds) | 'tie-flee' | 'tie-counter'
 */
export async function resolveCombat(attackerName, atkDice, defenderName, defDice) {
  return await showCombatRoll(attackerName, atkDice, defenderName, defDice);
}

/**
 * Apply the combat outcome to entities in the game state.
 * Returns a log of messages.
 *
 * @param {object} result — output from resolveCombat
 * @param {object} attacker — player or villain/zombie
 * @param {object} defender — player or villain/zombie
 * @param {boolean} attackerIsVillain
 * @param {object} state
 */
export function applyCombatResult(result, attacker, defender, attackerIsVillain, state) {
  const logs = [];

  switch (result.outcome) {
    case 'atk': // Attacker wins
      if (attackerIsVillain) {
        // Player knocked out
        const wasProtected = defender.knockOut();
        if (wasProtected === false) {
          logs.push(`✨ ${defender.name} was protected by Divine Protection!`);
        } else {
          logs.push(`💀 ${defender.name} is knocked out!`);
        }
      } else {
        // Villain stunned (can't permanently kill boss)
        const stunDuration = state?.effects?.doubleAtk > 0 ? 2 : 1;
        attacker.stunRounds = (attacker.stunRounds || 0) + stunDuration;
        logs.push(`😵 ${attacker.name} is stunned for ${stunDuration} round(s)!`);

        // Fighter: bonus turn after kill/stun
        if (defender.classKey === 'fighter') {
          state.fighterBonusTurn = true;
          logs.push(`⚔️ ${defender.name} earns a bonus turn!`);
        }
      }
      break;

    case 'def': // Defender holds
      logs.push(`🛡 ${attackerIsVillain ? defender.name : attacker.name} holds!`);
      break;

    case 'tie-flee': // Tie — defender flees (attacker's turn ends)
      logs.push(`🏃 Tie — chose to flee. Turn ends.`);
      break;

    case 'tie-counter': // Tie — defender counter-attacks
      logs.push(`↩️ Counter-attack! Roles reversed.`);
      // The counter-attack must be initiated by game.js
      state.pendingCounterAttack = { attacker: defender, defender: attacker, wasVillain: !attackerIsVillain };
      break;
  }

  return logs;
}

/**
 * Handle a player attacking the villain or a zombie.
 * Returns { logs, combatDone }
 */
export async function playerAttack(player, target, state) {
  const logs = [];
  const atkDice = player.effectiveAtk(state);
  const defDice = (typeof target.def === 'number') ? target.def : roll.d6();

  const result = await resolveCombat(player.name, atkDice, target.name || 'Villain', defDice);

  // Player attacks villain
  const applied = applyCombatResult(result, target, player, false, state);
  // Note: attacker here is the villain/zombie, defender is the player (for method signature compatibility)
  // Actually flip: player is attacker
  const appLogs = applyPlayerAttackResult(result, player, target, state);
  logs.push(...result.outcome !== 'tie-counter' ? appLogs : applied);

  return { logs, result };
}

function applyPlayerAttackResult(result, player, target, state) {
  const logs = [];
  switch (result.outcome) {
    case 'atk': {
      const stunDuration = state?.effects?.doubleAtk > 0 ? 2 : 1;
      target.stunRounds = Math.max(target.stunRounds || 0, stunDuration);
      logs.push(`💥 ${player.name} hits! ${target.name || 'Villain'} stunned for ${stunDuration} round(s).`);
      // Fighter bonus
      if (player.classKey === 'fighter') {
        state.fighterBonusTurn = true;
        logs.push(`⚔️ ${player.name} earns a bonus action!`);
      }
      break;
    }
    case 'def':
      logs.push(`🛡 ${target.name || 'Villain'} holds off ${player.name}.`);
      break;
    case 'tie-flee':
      logs.push(`🏃 ${player.name} chooses to flee.`);
      break;
    case 'tie-counter':
      logs.push(`↩️ ${target.name || 'Villain'} counter-attacks ${player.name}!`);
      state.pendingCounterAttack = {
        attacker: target,
        defender: player,
        wasVillain: true,
      };
      break;
  }
  return logs;
}

/**
 * Handle villain attacking a player.
 */
export async function villainAttack(villain, player, state) {
  const atkDice = (typeof villain.atk === 'number') ? villain.atk : roll.d6();
  const defDice = player.effectiveDef();

  const result = await resolveCombat(villain.name, atkDice, player.name, defDice);
  const logs   = applyCombatResult(result, villain, player, true, state);
  return { logs, result };
}
