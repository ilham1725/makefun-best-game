// Glimmerhold — shared constants: the arena, the keeper, the enemy roster, the palette.
// One file holds every number the rest of the game tunes against, so a balance pass touches
// this file alone and the simulation stays deterministic (nothing here reads the clock or
// the network).

/** Fixed simulation step: 60 updates a second, whatever the display does. */
export const STEP = 1 / 60;
/** The arena is one fixed logical size; the renderer letterboxes it onto any window. */
export const FIELD = { width: 1280, height: 720 };
/** Ten waves, then the night is held. */
export const WAVE_COUNT = 10;
/** Where the best score lives between visits. */
export const BEST_KEY = 'glimmerhold-best-v1';

export const PLAYER = {
  radius: 16,
  speed: 268,
  maxHp: 5,
  /** Seconds between shots before upgrades. */
  fireInterval: 0.21,
  bulletSpeed: 660,
  bulletDamage: 1,
  /** Seconds a bullet lives before it fades. */
  bulletLife: 1.1,
  /** Embers drift toward the keeper inside this radius. */
  pickupRadius: 96,
  /** Seconds of mercy after a hit. */
  invulnTime: 1.0,
  /** Knockback applied to the keeper when something touches them. */
  knockback: 320,
};

/** The night palette: deep indigo arena, warm lantern gold, ember orange. */
export const PALETTE = {
  skyTop: '#0a0e24',
  skyBottom: '#141b3d',
  floor: '#10162e',
  floorLine: 'rgba(160, 180, 255, 0.07)',
  wall: '#1d2650',
  text: '#f4f1e6',
  dim: '#aab3d6',
  gold: '#ffd166',
  ember: '#ff9a3c',
  emberDeep: '#ff6b35',
  wisp: '#7fe7ff',
  heart: '#ff5d73',
  heartEmpty: 'rgba(255, 93, 115, 0.25)',
  xp: '#8affc1',
  danger: '#ff4d4d',
};

/**
 * The five enemy kinds. hp is in bullet hits at base damage; speed is pixels a second;
 * score and xp are what the keeper earns for the kill; damage is hearts lost on contact.
 */
export const ENEMY_DEFS = {
  drifter: {
    name: 'Drifter', hp: 3, speed: 92, radius: 18, score: 10, xp: 1, damage: 1,
    color: '#9b8cf2', core: '#d9d2ff',
  },
  darter: {
    name: 'Darter', hp: 2, speed: 150, radius: 15, score: 15, xp: 2, damage: 1,
    color: '#ff7a59', core: '#ffd0a8',
  },
  spitter: {
    name: 'Spitter', hp: 4, speed: 78, radius: 19, score: 20, xp: 2, damage: 1,
    color: '#7ee081', core: '#d6ffd8',
  },
  brute: {
    name: 'Brute', hp: 14, speed: 52, radius: 30, score: 40, xp: 4, damage: 1,
    color: '#5b6b8c', core: '#c3d0ea',
  },
  swarm: {
    name: 'Swarm', hp: 1, speed: 185, radius: 10, score: 5, xp: 1, damage: 1,
    color: '#ff6fb3', core: '#ffd3e8',
  },
};

/** Elites grow from wave 4: bigger, tougher, worth far more. */
export const ELITE = { hpMul: 3, speedMul: 0.92, radiusMul: 1.45, scoreMul: 4, xpMul: 3 };

/** The two bosses: the Hollow Lantern guards wave 5, the Night Warden wave 10. */
export const BOSS_DEFS = {
  boss1: {
    name: 'The Hollow Lantern', hp: 220, speed: 62, radius: 52, score: 500, xp: 25,
    color: '#ff9a3c', core: '#ffe6b0',
  },
  boss2: {
    name: 'The Night Warden', hp: 420, speed: 74, radius: 58, score: 1000, xp: 40,
    color: '#b78cff', core: '#e6d6ff',
  },
};

/** Enemy projectiles: slow enough to dodge, fast enough to respect. */
export const ENEMY_BULLET = { speed: 250, radius: 7, life: 5 };

/** How long a kill keeps the combo alive, and how much each combo step is worth. */
export const COMBO = { window: 3.0, step: 0.1, cap: 3.0 };

/** Experience for the next level: gentle early, steeper as the keeper grows. */
export function xpForLevel(level) {
  return 8 + (level - 1) * 5;
}
