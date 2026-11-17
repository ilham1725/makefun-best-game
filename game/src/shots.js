// The staged screenshot scenes behind ?shot=title|play|upgrade|boss|victory|end. Each
// one plays the real rules forward from a fresh world — seeded, fixed-step, no wall
// clock — steered by an autopilot with perfect information, so the frame is what a real
// game genuinely looks like at that moment and the same seed always gives the same
// frame. Nothing here edits state the game cannot reach: the victory shot is a full
// playthrough, won by the pilot.

import { FIELD, PLAYER, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';

const TITLE_SECONDS = 5;
const PLAY_MIN_SECONDS = 18;
const PLAY_MAX_SECONDS = 170;
const BOSS_FIGHT_SECONDS = 3.5;
const MAX_RUN_SECONDS = 900;
const END_LIMIT_SECONDS = 600;

/** How the autopilot ranks upgrade cards when it must pick one itself. */
const CARD_VALUE = {
  'twin-flames': 3.2,
  'ember-rounds': 3.0,
  'rapid-wick': 2.8,
  'piercing-light': 2.5,
  'crit-spark': 2.2,
  'nova-burst': 2.0,
  'bright-shield': 1.8,
  'swift-boots': 1.5,
  'long-burn': 1.4,
  'magnet-glow': 1.2,
};

/**
 * The autopilot: flee from what is near, gather what is close, shoot what is nearest.
 * It sees every enemy and ember, so it plays better than a human — which is the point:
 * the staged frames show the game at its best, and the victory run proves it is winnable.
 */
export function autopilot(state) {
  const player = state.player;
  let mx = 0;
  let my = 0;
  // Flee: every enemy and hostile shot pushes the keeper away, nearer ones harder.
  for (const e of state.enemies) {
    if (e.spawnT > 0) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const range = e.boss ? 320 : 230;
    if (d < range) {
      const w = (1 - d / range) * (e.boss ? 1.6 : 1);
      mx += (dx / d) * w;
      my += (dy / d) * w;
    }
  }
  for (const b of state.ebullets) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 130) {
      const w = (1 - d / 130) * 1.4;
      mx += (dx / d) * w;
      my += (dy / d) * w;
    }
  }
  // Seek: drift toward the nearest ember when nothing is breathing down the keeper's neck.
  const threatNear = mx !== 0 || my !== 0;
  const ember = state.nearestEmber(player.x, player.y);
  if (ember && !threatNear) {
    const dx = ember.x - player.x;
    const dy = ember.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 300) {
      mx += (dx / d) * 0.55;
      my += (dy / d) * 0.55;
    }
  }
  // Keep off the walls: a soft pull toward the middle when near an edge.
  const margin = 130;
  if (player.x < margin) mx += (margin - player.x) / margin;
  if (player.x > FIELD.width - margin) mx -= (player.x - (FIELD.width - margin)) / margin;
  if (player.y < margin) my += (margin - player.y) / margin;
  if (player.y > FIELD.height - margin) my -= (player.y - (FIELD.height - margin)) / margin;
  // If nothing pulls anywhere, drift toward the centre and keep moving.
  if (mx === 0 && my === 0) {
    mx = (FIELD.width / 2 - player.x) / FIELD.width;
    my = (FIELD.height / 2 - player.y) / FIELD.height;
  }
  const ml = Math.hypot(mx, my) || 1;
  // Aim at the nearest enemy; with none in sight, aim at the nearest ember.
  let ax = player.x;
  let ay = player.y - 100;
  const foe = state.nearestEnemy(player.x, player.y);
  if (foe) {
    ax = foe.x;
    ay = foe.y;
  } else if (ember) {
    ax = ember.x;
    ay = ember.y;
  }
  return { mx: mx / ml, my: my / ml, ax, ay, firing: true };
}

/** A hurried pilot: it only notices danger when it is already close, so it dies. */
function weakPilot(state) {
  const player = state.player;
  let mx = 0;
  let my = 0;
  for (const e of state.enemies) {
    if (e.spawnT > 0) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 90) {
      mx += (dx / d) * (1 - d / 90);
      my += (dy / d) * (1 - d / 90);
    }
  }
  if (mx === 0 && my === 0) {
    mx = (FIELD.width / 2 - player.x) / FIELD.width;
    my = (FIELD.height / 2 - player.y) / FIELD.height;
  }
  const ml = Math.hypot(mx, my) || 1;
  const foe = state.nearestEnemy(player.x, player.y);
  return {
    mx: mx / ml, my: my / ml,
    ax: foe ? foe.x : player.x,
    ay: foe ? foe.y : player.y - 100,
    firing: true,
  };
}

/** Spend every pending level-up on the best card offered. */
function spendLevels(world) {
  let guard = 0;
  while (world.levelUpsPending > 0 && world.pendingUpgrades && guard < 10) {
    guard += 1;
    let best = world.pendingUpgrades[0];
    for (const card of world.pendingUpgrades) {
      if ((CARD_VALUE[card.id] || 1) > (CARD_VALUE[best.id] || 1)) best = card;
    }
    world.applyUpgrade(best.id);
  }
}

/**
 * Stage the named scene and return the screen to draw and the best score to show. Any
 * unknown name is the title. The world is reset first, so every scene starts fresh.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'title') {
    world.attract = true;
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, ax: 0, ay: 0, firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, died: false };
  }

  if (name === 'play') {
    // Two passes: first find the busiest frame (most foes on the floor, no banner, no
    // boss — the boss has its own shot), then re-run to that exact step. Deterministic
    // seeding makes the second run reproduce the first frame for frame.
    const maxSteps = PLAY_MAX_SECONDS / STEP;
    let bestStep = 0;
    let bestScore = -1;
    for (let i = 0; i < maxSteps; i += 1) {
      world.step(STEP, autopilot(world), false);
      spendLevels(world);
      if (world.over) break;
      if (i >= PLAY_MIN_SECONDS / STEP && world.wave >= 2 && !world.banner && !world.boss) {
        const kinds = new Set(world.enemies.map((e) => e.kind));
        const score = world.enemies.length * 10 + world.bullets.length + kinds.size * 15;
        if (score > bestScore) {
          bestScore = score;
          bestStep = i;
        }
      }
    }
    world.reset();
    for (let i = 0; i <= bestStep; i += 1) {
      world.step(STEP, autopilot(world), false);
      spendLevels(world);
    }
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY, best: world.score, died: world.over };
  }

  if (name === 'upgrade') {
    const limit = 150 / STEP;
    for (let i = 0; i < limit; i += 1) {
      world.step(STEP, autopilot(world), false);
      if (world.levelUpsPending > 0) {
        return { screen: SCREEN_UPGRADE, best: world.score, died: false };
      }
      if (world.over) break;
    }
    return { screen: SCREEN_PLAY, best: world.score, died: world.over };
  }

  if (name === 'boss') {
    const limit = MAX_RUN_SECONDS / STEP;
    let bossTime = 0;
    for (let i = 0; i < limit; i += 1) {
      world.step(STEP, autopilot(world), false);
      spendLevels(world);
      if (world.over) break;
      if (world.boss) {
        bossTime += STEP;
        if (bossTime >= BOSS_FIGHT_SECONDS) break;
      }
      if (world.victory) break;
    }
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY, best: world.score, died: world.over };
  }

  if (name === 'victory') {
    const limit = MAX_RUN_SECONDS / STEP;
    for (let i = 0; i < limit; i += 1) {
      world.step(STEP, autopilot(world), false);
      spendLevels(world);
      if (world.over || world.victory) break;
    }
    return { screen: world.victory ? SCREEN_VICTORY : SCREEN_OVER, best: world.score, died: world.over };
  }

  if (name === 'end') {
    const limit = END_LIMIT_SECONDS / STEP;
    for (let i = 0; i < limit; i += 1) {
      world.step(STEP, weakPilot(world), false);
      spendLevels(world);
      if (world.over) break;
    }
    return { screen: SCREEN_OVER, best: world.score, died: world.over };
  }

  world.attract = true;
  for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
    world.step(STEP, { mx: 0, my: 0, ax: 0, ay: 0, firing: false }, true);
  }
  return { screen: SCREEN_TITLE, best: 0, died: false };
}
