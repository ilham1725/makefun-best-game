// The level-up cards: ten upgrades, three offered at a time. Each one names its effect in
// plain words, carries a glyph the card draws, and applies itself to the keeper's stats.
// Stacking is the point — a keeper who takes Twin Flames three times fires five shots.

/** The keeper's tunable stats; the world owns one of these. */
export function baseStats() {
  return {
    damage: 1,
    fireInterval: 0.21,
    projectiles: 1,
    pierce: 0,
    speed: 268,
    maxHp: 5,
    magnet: 96,
    crit: 0,
    nova: 0,
    bulletSpeed: 660,
    bulletLife: 1.1,
  };
}

export const UPGRADES = [
  {
    id: 'ember-rounds', name: 'Ember Rounds', glyph: '◆',
    desc: 'Shots hit +1 harder.',
    apply(s) { s.damage += 1; },
  },
  {
    id: 'rapid-wick', name: 'Rapid Wick', glyph: '≋',
    desc: 'Fire 15% faster.',
    apply(s) { s.fireInterval = Math.max(0.08, s.fireInterval * 0.85); },
  },
  {
    id: 'twin-flames', name: 'Twin Flames', glyph: '✦',
    desc: '+1 shot per volley.',
    apply(s) { s.projectiles += 1; },
  },
  {
    id: 'swift-boots', name: 'Swift Boots', glyph: '»',
    desc: 'Move 12% faster.',
    apply(s) { s.speed *= 1.12; },
  },
  {
    id: 'bright-shield', name: 'Bright Shield', glyph: '♥',
    desc: '+1 max heart, and mend 1.',
    apply(s, world) {
      s.maxHp += 1;
      world.player.hp = Math.min(s.maxHp, world.player.hp + 1);
    },
  },
  {
    id: 'magnet-glow', name: 'Magnet Glow', glyph: '◎',
    desc: 'Embers fly to you from 60% further.',
    apply(s) { s.magnet *= 1.6; },
  },
  {
    id: 'nova-burst', name: 'Nova Burst', glyph: '✺',
    desc: 'A burst of light wounds all near foes every 7s.',
    apply(s) { s.nova += 1; },
  },
  {
    id: 'piercing-light', name: 'Piercing Light', glyph: '→',
    desc: 'Shots pass through +1 foe.',
    apply(s) { s.pierce += 1; },
  },
  {
    id: 'crit-spark', name: 'Crit Spark', glyph: '⚡',
    desc: '+12% chance a shot deals triple damage.',
    apply(s) { s.crit += 0.12; },
  },
  {
    id: 'long-burn', name: 'Long Burn', glyph: '↗',
    desc: 'Shots fly 25% faster and last longer.',
    apply(s) { s.bulletSpeed *= 1.25; s.bulletLife *= 1.2; },
  },
];

/** Roll n distinct cards from the deck, in a shuffled order. */
export function rollUpgrades(rng, n = 3) {
  const deck = UPGRADES.slice();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck.slice(0, n);
}
