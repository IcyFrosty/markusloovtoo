// ─────────────────────────────────────────────────
//  data.js  — Card loading & categorisation
// ─────────────────────────────────────────────────

let _cache = null;

export async function loadCards() {
  if (_cache) return _cache;
  const res = await fetch('./cards.json');
  if (!res.ok) throw new Error('Could not load cards.json');
  _cache = await res.json();
  return _cache;
}

export const byType = (cards, type) => cards.filter(c => c.type === type);

export const getSurvivors = cards => byType(cards, 'Survivor');
export const getVillains  = cards => byType(cards, 'Villain');
export const getEvents    = cards => byType(cards, 'Event');
export const getTools     = cards => cards.filter(c => c.type === 'Tool' || c.type === 'Equipment');

// ─── Villain stat parser ─────────────────────────────────────────────────────
/**
 * Parse villain stats from the string format "ATK 10, DEF 10, MOV 4".
 * Special handling: "ATK D6" → null (roll each turn), "MOV -" → null (teleport).
 */
export function parseVillainStats(statsStr) {
  if (!statsStr || typeof statsStr !== 'string') return { atk: 3, def: 3, mov: 3 };

  const parse = token => {
    const t = token.trim();
    if (t === '-' || t === '') return null;
    if (t.toUpperCase().startsWith('D')) return 'd' + t.slice(1); // "D6" → "d6"
    return parseInt(t, 10) || null;
  };

  const m = statsStr.match(/ATK\s*([^,]+),\s*DEF\s*([^,]+),\s*MOV\s*([^,\s]+)/i);
  if (!m) return { atk: 3, def: 3, mov: 3 };
  return { atk: parse(m[1]), def: parse(m[2]), mov: parse(m[3]) };
}

// ─── Survivor class definitions ──────────────────────────────────────────────
const CLASS_META = {
  athlete:   { icon: '🏃', color: '#00e5ff',  colorVar: '--p1', desc: 'Speed specialist' },
  medic:     { icon: '💉', color: '#69ff9f',  colorVar: '--p2-safe', desc: 'Support healer' },
  scientist: { icon: '🔬', color: '#ffea00',  colorVar: '--p3', desc: 'Puzzle master' },
  fighter:   { icon: '⚔️', color: '#ff4081',  colorVar: '--p4', desc: 'Combat expert' },
};

export function getClassMeta(classKey) {
  return CLASS_META[classKey] || CLASS_META.athlete;
}

export function survivorToClass(card) {
  const name = card.title.toLowerCase();
  const key  = name.includes('athlete')   ? 'athlete'
             : name.includes('medic')     ? 'medic'
             : name.includes('scientist') ? 'scientist'
             : name.includes('fighter')   ? 'fighter'
             : 'athlete';
  const meta = getClassMeta(key);
  return { card, key, ...meta };
}

// ─── Villain class meta ───────────────────────────────────────────────────────
const VILLAIN_META = {
  stalker:     { icon: '👁️',  colorVar: '--villain' },
  gambler:     { icon: '🎲',  colorVar: '--villain' },
  trapper:     { icon: '🪤',  colorVar: '--villain' },
  necromancer: { icon: '💀',  colorVar: '--villain' },
  hunter:      { icon: '🎯',  colorVar: '--villain' },
};

export function villainMeta(card) {
  const name = card.title.toLowerCase();
  const key  = Object.keys(VILLAIN_META).find(k => name.includes(k)) || 'stalker';
  return { key, ...VILLAIN_META[key] };
}
