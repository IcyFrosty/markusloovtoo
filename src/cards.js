// ─────────────────────────────────────────────────
//  cards.js  — Deck management (event row + tool deck)
// ─────────────────────────────────────────────────
import { shuffle } from './dice.js';

// ─── Deck ─────────────────────────────────────────
export class Deck {
  constructor(cards) {
    this.original = [...cards];
    this.cards    = shuffle([...cards]);
  }

  draw() {
    if (this.cards.length === 0) this.cards = shuffle([...this.original]);
    return this.cards.pop();
  }

  get remaining() { return this.cards.length; }
}

// ─── Event Row ─────────────────────────────────────
/**
 * Represents the persistent event row on the table.
 * Each slot: { card, roundsLeft }
 */
export class EventRow {
  constructor() { this.slots = []; }

  add(card) {
    // Determine how many rounds card persists
    const rounds = _persistRounds(card);
    this.slots.push({ card, roundsLeft: rounds });
  }

  /** Call at start of event phase — decrement counters, remove expired. */
  tick() {
    this.slots = this.slots
      .map(s => ({ ...s, roundsLeft: s.roundsLeft - 1 }))
      .filter(s => s.roundsLeft > 0);
  }

  get all() { return this.slots; }
}

function _persistRounds(card) {
  const text = (card.description || '').toLowerCase();
  const m    = text.match(/lasts?\s+(\d+)\s+round/);
  if (m) return parseInt(m[1], 10);
  if (text.includes('until a different environmental card')) return 99; // permanent until replaced
  return 1;
}

// ─── Active effect helpers ─────────────────────────────────────────────────

/**
 * Apply an event card's immediate / passive effect to the game state.
 * Returns an array of log messages.
 * Complex effects (Mind Control, Come to Me) that need UI interaction
 * are flagged as 'needsInteraction' and handled by game.js.
 */
export function applyEventEffect(card, state) {
  const logs  = [];
  const title = card.title;
  const desc  = (card.description || '').toLowerCase();

  if (title === 'Double ATK') {
    state.effects.doubleAtk = 2;
    logs.push('⚡ Double ATK! All players deal ×2 damage for 2 rounds.');
  } else if (title === 'Heavy rain') {
    state.effects.movPenalty = (state.effects.movPenalty || 0) + 1;
    logs.push('🌧 Heavy rain: everyone −1 MOV.');
  } else if (title === 'Fog of War') {
    state.effects.fogOfWar = true;
    logs.push('🌫 Fog of War: vision reduced by 1 tile.');
  } else if (title === 'Ice Age') {
    state.effects.iceAge = true;
    logs.push('❄️ Ice Age! Campfires placed in each sector. Monsters −1 MOV.');
  } else if (title === 'Angry Monster') {
    state.villain.extraActivation = true;
    logs.push('😡 Angry Monster! The villain activates again this round.');
  } else if (title === 'Spawn Zombie') {
    state.pendingZombieSpawn = true;
    logs.push('🧟 A zombie appears!');
  } else if (title === 'Living rock') {
    state.pendingGolemSpawn = true;
    logs.push('🪨 A golem rises from the earth! ATK4 DEF6 MOV2.');
  } else if (title === 'Ammunition') {
    state.pendingAmmoGrant = true;
    logs.push('🎁 Ammunition drop! Each player receives a tool.');
  } else if (title === 'Loot drop') {
    state.pendingLootDrop = true;
    logs.push('📦 Loot drop! One crate per player appears on the board.');
  } else if (title === 'Divine Protection') {
    state.pendingDivineProtection = true;
    logs.push('✨ Divine Protection! Choose a player to bless.');
  } else if (title === 'Regroup') {
    state.pendingRegroup = true;
    logs.push('📡 Regroup! Players must choose a rally point.');
  } else if (title === 'The Mixer') {
    state.pendingMixer = true;
    logs.push('🌀 The Mixer! A random player is teleported.');
  } else if (title === 'Mind Control') {
    state.pendingMindControl = true;
    logs.push('🧠 Mind Control! A player is taken over for 2 turns.');
  } else if (title === 'Switcher') {
    state.pendingObjectiveSwitcher = true;
    logs.push('🔀 Switcher! The next objective moves to a random tile.');
  } else if (title === 'Come to me') {
    state.pendingComeToMe = true;
    logs.push('😈 Come to me! Every player must move toward the villain.');
  } else if (title === 'Double Trouble') {
    state.pendingDoubleTrouble = true;
    logs.push('💥 Double Trouble! Draw another event — it triggers twice!');
  } else if (title === 'Roulette') {
    state.pendingRoulette = true;
    logs.push('🎰 Roulette! Everyone rolls a D6 — 1 means KO.');
  } else if (title === 'Stun gun roulette') {
    state.pendingStunRoulette = true;
    logs.push('⚡ Stun Gun Roulette! Roll D6 — 1 means stunned.');
  } else if (title === 'Bat Swarm') {
    state.pendingBatSwarm = true;
    logs.push('🦇 Bat Swarm! Everyone with ATK < 3 is stunned.');
  } else if (title === 'Acid rain') {
    state.pendingAcidRain = true;
    logs.push('☠️ Acid Rain! Everyone with DEF < 3 is stunned.');
  } else if (title === 'Meteorite' || title === 'Meteor impact') {
    state.pendingMeteor = true;
    logs.push('☄️ Meteorite! A random coordinate is hit with 4-tile radius KO.');
  } else if (title === 'Lightning') {
    state.pendingLightning = true;
    logs.push('🌩 Lightning! A random tile is struck — 2-tile radius stun.');
  } else if (title === 'Toxic Gas') {
    state.pendingToxicGas = true;
    logs.push('☣️ Toxic Gas! A sector fills with poison for 2 rounds.');
  } else if (title === 'The Slime' || title === 'Slime') {
    state.pendingSlime = true;
    logs.push('🟢 Slime covers a sector — everyone inside moves −2 MOV.');
  } else if (title === 'The Fog') {
    state.effects.fogStrong = 3;
    logs.push('🌁 The Fog! Vision reduced to 1 tile for 3 rounds.');
  } else if (title === 'Earthquake') {
    state.pendingEarthquake = true;
    logs.push('🌍 Earthquake! Everyone rolls D6 — 1 = stunned.');
  } else if (title === 'Lava') {
    state.pendingLava = true;
    logs.push('🌋 Lava! A random tile becomes impassable.');
  } else if (title === 'Double Loot') {
    state.effects.doubleLoot = true;
    logs.push('📦 Double Loot! The next container looted yields 2 items.');
  } else {
    logs.push(`📋 ${title}: ${(card.description || '').slice(0, 80)}…`);
  }

  return logs;
}

/**
 * Check if an active effect key has rounds remaining in the event row.
 */
export function isEffectActive(eventRow, effectTitle) {
  return eventRow.slots.some(s => s.card.title === effectTitle && s.roundsLeft > 0);
}
