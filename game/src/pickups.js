// Drops: the little gifts a kill sometimes leaves behind. Four kinds — a triple-shot
// blessing, a brief shield, a mended heart, and a magnet that calls every loose ember
// home. They bob where they fall, drift toward the keeper when close, and fade if left
// alone for too long.

import { FIELD } from './config.js';

export const PICKUP_DEFS = {
  spread: { name: 'Triple Flame', color: '#ffd166', core: '#fff3c4', duration: 10 },
  shield: { name: 'Aegis Light', color: '#7fe7ff', core: '#e6fbff', duration: 5 },
  heal: { name: 'Mending Ember', color: '#ff5d73', core: '#ffd3da', duration: 0 },
  magnet: { name: 'Ember Call', color: '#8affc1', core: '#e2ffe9', duration: 0 },
};

/** One pickup on the floor, with a lifetime of its own. */
export function createPickup(kind, x, y) {
  return {
    kind,
    x: Math.max(24, Math.min(FIELD.width - 24, x)),
    y: Math.max(24, Math.min(FIELD.height - 24, y)),
    t: 0,
    life: 14,
    bob: Math.random() * Math.PI * 2,
  };
}

/** What a pickup does when the keeper takes it. */
export function applyPickup(world, kind) {
  const player = world.player;
  if (kind === 'spread') {
    player.spreadT = PICKUP_DEFS.spread.duration;
    world.particles.text(player.x, player.y - 30, 'TRIPLE FLAME!', '#ffd166', 20);
  } else if (kind === 'shield') {
    player.shieldT = PICKUP_DEFS.shield.duration;
    world.particles.text(player.x, player.y - 30, 'AEGIS!', '#7fe7ff', 20);
  } else if (kind === 'heal') {
    player.hp = Math.min(player.stats.maxHp, player.hp + 1);
    world.particles.text(player.x, player.y - 30, '+1 HEART', '#ff5d73', 20);
  } else if (kind === 'magnet') {
    for (const ember of world.embers) {
      ember.vx = (player.x - ember.x) * 6;
      ember.vy = (player.y - ember.y) * 6;
    }
    world.particles.text(player.x, player.y - 30, 'EMBERS CALL!', '#8affc1', 20);
  }
}

/** Draw one pickup: a glowing diamond with its own glyph. */
export function drawPickup(ctx, p, time) {
  const def = PICKUP_DEFS[p.kind];
  const bobY = Math.sin(time * 3 + p.bob) * 4;
  const fade = p.life < 3 ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 10)) : 1;
  ctx.save();
  ctx.translate(p.x, p.y + bobY);
  ctx.globalAlpha = fade;
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, def.color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = fade * 0.5;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = fade;
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = def.color;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.fillStyle = def.core;
  ctx.fillRect(-4.5, -4.5, 9, 9);
  ctx.restore();
}
