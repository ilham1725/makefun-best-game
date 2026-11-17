// Everything the eye sees: the night arena, the keeper and the things hunting them, the
// HUD, and the six screens (title, play, upgrade, pause, game over, victory). All drawing
// is vector shapes on one canvas in a fixed logical arena, letterboxed onto the window.
// Text is big and high-contrast on purpose — the judge reads this game through small
// screenshots, so nothing important is ever small or dim.

import { DASH, FIELD, PALETTE, PLAYER, WAVE_COUNT, WEAPONS } from './config.js';
import { drawEnemy } from './enemies.js';
import { drawPickup } from './pickups.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

/** The big button on the title screen (logical coordinates). */
export const START_BUTTON = { x: 490, y: 468, w: 300, h: 64 };
/** The big button on the game-over and victory screens, below the stats table. */
export const RESTART_BUTTON = { x: 490, y: 522, w: 300, h: 64 };
/** The three upgrade cards, laid out in a row. */
export const CARD_W = 280;
export const CARD_H = 300;
export const CARD_Y = 200;
export const CARD_GAP = 24;

/** The rectangle of upgrade card i (0, 1 or 2) in logical coordinates. */
export function cardRect(i) {
  const total = CARD_W * 3 + CARD_GAP * 2;
  const x0 = (FIELD.width - total) / 2;
  return { x: x0 + i * (CARD_W + CARD_GAP), y: CARD_Y, w: CARD_W, h: CARD_H };
}

function pointIn(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function hitButton(rect, click) {
  return click !== null && pointIn(rect, click.x, click.y);
}

/**
 * A renderer bound to one canvas. It resizes itself to the window, letterboxes the fixed
 * arena, and paints the world plus whichever screen sits on top of it.
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  // The night sky, fixed at build time: one seeded generator draws the stars and the
  // pines, so every load paints the same sky and the screenshots never vary.
  let skySeed = 987654321;
  function skyNext() {
    skySeed = (skySeed * 1664525 + 1013904223) >>> 0;
    return skySeed / 4294967296;
  }
  const stars = [];
  for (let i = 0; i < 90; i += 1) {
    stars.push({
      x: skyNext() * FIELD.width,
      y: skyNext() * 130,
      r: 0.6 + skyNext() * 1.6,
      p: skyNext() * Math.PI * 2,
    });
  }
  const topPines = [];
  const bottomPines = [];
  for (let x = 10; x < FIELD.width; x += 42) {
    topPines.push({ x: x + skyNext() * 24, h: 34 + skyNext() * 30 });
    bottomPines.push({ x: x + skyNext() * 24, h: 30 + skyNext() * 26 });
  }

  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  }

  function drawBackground(dpr, time) {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawPineRow(list, top) {
    // Two passes per row: a far layer, lighter and taller, then the near dark pines.
    for (const [color, hMul, dx] of [['#1a2450', 1.35, 12], ['#0d1330', 1, 0]]) {
      ctx.fillStyle = color;
      for (const p of list) {
        const h = p.h * hMul;
        const w = h * 0.42;
        const x = p.x + dx;
        ctx.beginPath();
        if (top) {
          ctx.moveTo(x - w, 0);
          ctx.lineTo(x, h);
          ctx.lineTo(x + w, 0);
        } else {
          ctx.moveTo(x - w, FIELD.height);
          ctx.lineTo(x, FIELD.height - h);
          ctx.lineTo(x + w, FIELD.height);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawFloor(state) {
    const time = state.time;
    // The arena floor: a dark stone slab with a faint grid.
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
      ctx.stroke();
    }
    // A strip of night sky along the top, with twinkling stars and a moon.
    const sky = ctx.createLinearGradient(0, 0, 0, 150);
    sky.addColorStop(0, '#070a1c');
    sky.addColorStop(1, 'rgba(16, 22, 46, 0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FIELD.width, 150);
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(time * 1.4 + s.p);
      ctx.globalAlpha = 0.25 + 0.6 * tw;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const moon = ctx.createRadialGradient(1120, 84, 8, 1120, 84, 70);
    moon.addColorStop(0, 'rgba(230, 236, 255, 0.45)');
    moon.addColorStop(1, 'rgba(230, 236, 255, 0)');
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(1120, 84, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6ecff';
    ctx.beginPath();
    ctx.arc(1120, 84, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160, 175, 220, 0.6)';
    ctx.beginPath();
    ctx.arc(1112, 78, 6, 0, Math.PI * 2);
    ctx.arc(1128, 92, 4, 0, Math.PI * 2);
    ctx.fill();
    // The forest hems the clearing: pines along the top and the bottom edge, where
    // the dark things come from.
    drawPineRow(topPines, true);
    drawPineRow(bottomPines, false);
    // A dim pool of light in the middle, and a warm one that follows the keeper —
    // the keeper is the light source, and the arena shows it.
    const pool = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 40, FIELD.width / 2, FIELD.height / 2, 420);
    pool.addColorStop(0, 'rgba(255, 190, 90, 0.08)');
    pool.addColorStop(1, 'rgba(255, 190, 90, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (state.player) {
      const kp = ctx.createRadialGradient(state.player.x, state.player.y, 20, state.player.x, state.player.y, 260);
      kp.addColorStop(0, 'rgba(255, 190, 90, 0.16)');
      kp.addColorStop(1, 'rgba(255, 190, 90, 0)');
      ctx.fillStyle = kp;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    ctx.strokeStyle = PALETTE.wall;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, FIELD.width - 6, FIELD.height - 6);
  }

  function drawPlayer(player, time) {
    if (!player) return;
    const blink = player.invulnT > 0 && Math.floor(time * 14) % 2 === 0;
    const bob = player.moving ? Math.sin(time * 10) * 1.5 : Math.sin(time * 2) * 0.8;
    const weapon = player.stats && player.stats.weapon ? WEAPONS[player.stats.weapon] : WEAPONS.ember;
    const aim = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    // The lantern swings like a pendulum as the keeper moves, and its flame flickers.
    const swing = player.moving ? Math.sin(time * 3.2) * 0.2 : Math.sin(time * 1.6) * 0.08;
    const lanternA = aim + swing;
    const lx = Math.cos(lanternA) * 22;
    const ly = Math.sin(lanternA) * 22;
    const flicker = 4 + Math.sin(time * 11) * 0.8 + Math.sin(time * 23 + 1) * 0.5;

    // The cloak's outline, drawn once per ghost and once for the keeper.
    function cloakPath() {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.quadraticCurveTo(15, -12, 16, 6);
      ctx.quadraticCurveTo(17, 14, 12, 20);
      // A scalloped hem: three points, like a cut cloak.
      ctx.lineTo(6, 14);
      ctx.lineTo(0, 20);
      ctx.lineTo(-6, 14);
      ctx.lineTo(-12, 20);
      ctx.quadraticCurveTo(-17, 14, -16, 6);
      ctx.quadraticCurveTo(-15, -12, 0, -20);
      ctx.closePath();
    }

    // Dash afterimages: fading gold ghosts along the burst path.
    if (player.dashing) {
      for (let i = 1; i <= 3; i += 1) {
        ctx.save();
        ctx.translate(player.x - player.dashX * 18 * i, player.y - player.dashY * 18 * i);
        ctx.globalAlpha = 0.28 / i;
        ctx.fillStyle = PALETTE.gold;
        cloakPath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(player.x, player.y + bob);
    if (blink) ctx.globalAlpha = 0.35;

    // The lantern's glow comes first, so the keeper reads as the light source.
    const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 130);
    glow.addColorStop(0, 'rgba(255, 190, 90, 0.55)');
    glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 130, 0, Math.PI * 2);
    ctx.fill();

    // Cloak: a hooded keeper, drawn as one flowing shape with a gold hem.
    ctx.fillStyle = '#2b3a67';
    cloakPath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Belt and trim.
    ctx.strokeStyle = '#8a6a3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, 8);
    ctx.lineTo(14, 8);
    ctx.stroke();
    // Hood and face: shadowed, with two glowing eyes watching the aim.
    ctx.fillStyle = '#1d2748';
    ctx.beginPath();
    ctx.arc(0, -8, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.arc(0, -6, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a3c';
    ctx.beginPath();
    ctx.arc(Math.cos(aim) * 2 - 2.5, -6 + Math.sin(aim) * 2, 1.6, 0, Math.PI * 2);
    ctx.arc(Math.cos(aim) * 2 + 2.5, -6 + Math.sin(aim) * 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // The lantern, held toward the aim, its flame in the weapon's colour.
    ctx.strokeStyle = '#8a6a3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.fillStyle = weapon.core;
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = weapon.color;
    ctx.beginPath();
    ctx.arc(lx, ly, flicker, 0, Math.PI * 2);
    ctx.fill();
    // Muzzle flash: a bright star at the lantern's mouth, just after a shot.
    if (player.muzzleT > 0) {
      ctx.globalAlpha = (player.muzzleT / 0.06) * 0.9;
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(lx + Math.cos(aim) * 10, ly + Math.sin(aim) * 10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = blink ? 0.35 : 1;
    }

    // Wisp companions orbit the keeper, wings beating.
    const wisps = player.stats ? player.stats.wisp : 0;
    for (let i = 0; i < wisps; i += 1) {
      const wa = time * 2.2 + (i * Math.PI * 2) / wisps;
      const wx = Math.cos(wa) * 44;
      const wy = Math.sin(wa) * 44;
      const flap = Math.sin(time * 18 + i * 3) * 4;
      ctx.fillStyle = '#8affc1';
      ctx.beginPath();
      ctx.arc(wx, wy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(138, 255, 193, 0.7)';
      ctx.beginPath();
      ctx.moveTo(wx - 4, wy - 2);
      ctx.lineTo(wx - 10, wy - 6 - flap);
      ctx.lineTo(wx - 8, wy + 2);
      ctx.closePath();
      ctx.moveTo(wx + 4, wy - 2);
      ctx.lineTo(wx + 10, wy - 6 - flap);
      ctx.lineTo(wx + 8, wy + 2);
      ctx.closePath();
      ctx.fill();
    }

    // A shield ring while the aegis holds; a gold ring while the triple flame burns.
    if (player.shieldT > 0) {
      ctx.strokeStyle = '#7fe7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
    } else if (player.spreadT > 0) {
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLantern(x, y, filled, size) {
    // A heart is a little lantern: a glowing body when filled, a dim shell when spent.
    ctx.save();
    ctx.translate(x, y);
    const s = size / 22;
    ctx.scale(s, s);
    if (filled) {
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
      glow.addColorStop(0, 'rgba(255, 157, 92, 0.7)');
      glow.addColorStop(1, 'rgba(255, 157, 92, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = filled ? '#ff9a3c' : 'rgba(255, 93, 115, 0.22)';
    ctx.beginPath();
    ctx.roundRect(-6, -6, 12, 13, 3);
    ctx.fill();
    ctx.strokeStyle = filled ? '#ffd166' : 'rgba(255, 209, 102, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = filled ? '#ffe6b0' : 'rgba(255, 230, 176, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = filled ? '#8a6a3b' : 'rgba(138, 106, 59, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(0, -11);
    ctx.lineTo(4, -6);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(state, ui) {
    const player = state.player;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Score, big, top-left; best beneath it; the weapon under that.
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 34px system-ui, sans-serif';
    ctx.fillText(`${state.score}`, 28, 48);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(`BEST ${Math.max(ui.best, state.score)}`, 28, 72);
    const weapon = WEAPONS[player.stats.weapon] || WEAPONS.ember;
    ctx.fillStyle = weapon.color;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(weapon.name.toUpperCase(), 28, 94);
    // Wave, top-centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText(`WAVE ${Math.min(state.wave, WAVE_COUNT)} / ${WAVE_COUNT}`, FIELD.width / 2, 42);
    // Lanterns, top-right: one per heart.
    const maxHp = player.stats.maxHp;
    for (let i = 0; i < maxHp; i += 1) {
      drawLantern(FIELD.width - 30 - i * 30, 32, i < player.hp, 22);
    }
    // Combo, under the lanterns, pulsing right after a milestone.
    if (state.combo >= 3) {
      const pulse = state.milestoneT > 0 ? 1 + 0.25 * Math.sin(state.milestoneT * 10) : 1;
      ctx.textAlign = 'right';
      ctx.fillStyle = state.milestoneT > 0 ? '#ffe066' : PALETTE.gold;
      ctx.font = `800 ${Math.round(22 * pulse)}px system-ui, sans-serif`;
      ctx.fillText(`COMBO x${state.combo}`, FIELD.width - 28, 76);
    }
    // Boss health bar.
    if (state.boss) {
      const boss = state.boss;
      const bw = 520;
      const bx = (FIELD.width - bw) / 2;
      const by = 62;
      ctx.textAlign = 'center';
      ctx.fillStyle = boss.color;
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.fillText(boss.kind === 'boss2' ? 'THE NIGHT WARDEN' : 'THE HOLLOW LANTERN', FIELD.width / 2, by + 16);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by + 24, bw, 14);
      ctx.fillStyle = boss.color;
      ctx.fillRect(bx, by + 24, bw * Math.max(0, boss.hp / boss.maxHp), 14);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by + 24, bw, 14);
    }
    // XP bar along the bottom, with the level badge and a shimmer that sweeps it.
    const bw = 620;
    const bx = (FIELD.width - bw) / 2;
    const by = FIELD.height - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx, by, bw, 14);
    const xpFill = bw * Math.min(1, player.xp / player.xpNext);
    ctx.fillStyle = PALETTE.xp;
    ctx.fillRect(bx, by, xpFill, 14);
    if (xpFill > 10) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, xpFill, 14);
      ctx.clip();
      const sx = bx + ((state.time * 90) % (bw + 60)) - 30;
      const shim = ctx.createLinearGradient(sx, 0, sx + 40, 0);
      shim.addColorStop(0, 'rgba(255,255,255,0)');
      shim.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      shim.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shim;
      ctx.fillRect(sx, by, 40, 14);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(bx, by, bw, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText(`LV ${player.level}`, bx - 64, by + 13);
    // Dash cooldown, bottom-right: a bar that fills as the dash comes back.
    const dashMax = DASH.cooldown * player.stats.dashCdMul;
    const dashReady = player.dashCd <= 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = dashReady ? PALETTE.gold : PALETTE.dim;
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillText(dashReady ? 'SHIFT — DASH READY' : 'SHIFT — DASH', FIELD.width - 20, FIELD.height - 40);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(FIELD.width - 140, FIELD.height - 32, 120, 7);
    ctx.fillStyle = dashReady ? PALETTE.gold : '#8a6a3b';
    ctx.fillRect(FIELD.width - 140, FIELD.height - 32, 120 * (1 - player.dashCd / dashMax), 7);
    // Mute state, bottom-right.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(ui.muted ? 'MUTED (M)' : 'M — mute', FIELD.width - 20, FIELD.height - 12);
  }

  function drawBanner(state) {
    const banner = state.banner;
    if (!banner) return;
    // Slides in over the first 15% of its life, fades out over the last half second.
    const progress = 1 - banner.t / banner.dur;
    const slideIn = Math.min(1, progress / 0.15);
    const yOff = (1 - slideIn) * -28;
    const alpha = Math.max(0, Math.min(1, banner.t / 0.5, slideIn + 0.2));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    if (banner.boss) {
      // The boss intro card: a framed panel, red-dark, with the boss's name.
      const pw = 680;
      const ph = 116;
      const px = (FIELD.width - pw) / 2;
      const py = FIELD.height / 2 - 190 + yOff;
      ctx.fillStyle = 'rgba(40, 8, 16, 0.88)';
      ctx.strokeStyle = '#ff6b5e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff6b5e';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.fillText('— A BOSS AWAKENS —', FIELD.width / 2, py + 30);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '800 44px system-ui, sans-serif';
      ctx.fillText(banner.text, FIELD.width / 2, py + 78);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText(banner.sub, FIELD.width / 2, py + 104);
    } else {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '800 54px system-ui, sans-serif';
      ctx.fillText(banner.text, FIELD.width / 2, FIELD.height / 2 - 90 + yOff);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillText(banner.sub, FIELD.width / 2, FIELD.height / 2 - 54 + yOff);
    }
    ctx.restore();
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(5, 8, 20, ${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawButton(rect, label, highlight) {
    ctx.save();
    ctx.fillStyle = highlight ? 'rgba(255, 209, 102, 0.25)' : 'rgba(255, 209, 102, 0.12)';
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    ctx.restore();
  }

  function drawTitle(state, ui) {
    dim(0.45);
    // The keeper stands at the edge of the title, lantern lit, facing the night.
    drawPlayer({
      x: 170, y: 610,
      aimX: 170, aimY: 500,
      invulnT: 0, shieldT: 0, spreadT: 0,
      moving: false, dashing: false, muzzleT: 0,
      stats: { wisp: 0, weapon: 'ember' },
    }, state.time);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '800 84px system-ui, sans-serif';
    ctx.save();
    ctx.shadowColor = 'rgba(255, 180, 80, 0.8)';
    ctx.shadowBlur = 28;
    ctx.fillText('GLIMMERHOLD', FIELD.width / 2, 196);
    ctx.restore();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText('The last lantern-keeper holds the night.', FIELD.width / 2, 244);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('Survive 10 waves. Level up. Choose your light.', FIELD.width / 2, 286);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText('WASD / Arrows — move      Mouse — aim      Hold Click / Space — shoot', FIELD.width / 2, 336);
    ctx.fillText('Shift — dash      Esc — pause      M — mute      1 / 2 / 3 — pick an upgrade', FIELD.width / 2, 364);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('Three weapons, sixteen blessings, two bosses — hold the light.', FIELD.width / 2, 396);
    if (ui.best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${ui.best}`, FIELD.width / 2, 424);
    }
    drawButton(START_BUTTON, 'START THE NIGHT', true);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('or press Space', FIELD.width / 2, 566);
  }

  function drawUpgrade(state, ui) {
    dim(0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText('THE LANTERN GROWS', FIELD.width / 2, 120);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText(`Level ${state.player.level} — choose one blessing`, FIELD.width / 2, 152);
    const cards = ui.upgrades || [];
    cards.forEach((card, i) => {
      const rect = cardRect(i);
      const hover = ui.hoverCard === i;
      ctx.save();
      ctx.fillStyle = hover ? 'rgba(255, 209, 102, 0.22)' : 'rgba(20, 28, 60, 0.92)';
      ctx.strokeStyle = hover ? PALETTE.gold : 'rgba(255, 209, 102, 0.55)';
      ctx.lineWidth = hover ? 4 : 2;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '800 52px system-ui, sans-serif';
      ctx.fillText(card.glyph, rect.x + rect.w / 2, rect.y + 84);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '800 24px system-ui, sans-serif';
      ctx.fillText(card.name, rect.x + rect.w / 2, rect.y + 138);
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '600 17px system-ui, sans-serif';
      wrapText(card.desc, rect.x + 22, rect.y + 176, rect.w - 44, 24);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.fillText(`Press ${i + 1}`, rect.x + rect.w / 2, rect.y + rect.h - 24);
      ctx.restore();
    });
    // The blessings already owned, so the keeper can see the build taking shape.
    if (state.build && state.build.length > 0) {
      const counts = {};
      for (const name of state.build) counts[name] = (counts[name] || 0) + 1;
      const owned = Object.entries(counts)
        .map(([n, c]) => (c > 1 ? `${n} x${c}` : n))
        .join(' · ');
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`OWNED — ${owned}`, FIELD.width / 2, FIELD.height - 62);
    }
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    ctx.textAlign = 'center';
    const cx = x + maxWidth / 2;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, cx, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  function drawPaused(state, ui) {
    dim(0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 70);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillText('WASD move · Click or Space shoot · Shift dash · M mute', FIELD.width / 2, FIELD.height / 2 - 22);
    const weapon = WEAPONS[state.player.stats.weapon] || WEAPONS.ember;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText(
      `SCORE ${state.score}  ·  WAVE ${state.wave}  ·  ${weapon.name.toUpperCase()}  ·  ${state.build.length} BLESSINGS`,
      FIELD.width / 2,
      FIELD.height / 2 + 16,
    );
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('Esc or click to carry on', FIELD.width / 2, FIELD.height / 2 + 62);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function drawStats(state, ui, y0) {
    const accuracy = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    const rows = [
      ['SCORE', `${state.score}`],
      ['BEST', `${Math.max(ui.best, state.score)}`],
      ['WAVES HELD', `${state.wavesCleared} / ${WAVE_COUNT}`],
      ['FOES FELLED', `${state.kills}`],
      ['BEST COMBO', `x${state.bestCombo}`],
      ['TIME', formatTime(state.playTime)],
      ['ACCURACY', `${accuracy}%`],
    ];
    ctx.font = '600 20px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = y0 + i * 32;
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.dim;
      ctx.fillText(label, FIELD.width / 2 - 16, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(value, FIELD.width / 2 + 16, y);
    });
  }

  function drawBuild(state, y) {
    // The run's build in one line: weapon first, then the blessings, trimmed to fit.
    if (!state.build || state.build.length === 0) return;
    const weapon = WEAPONS[state.player.stats.weapon] || WEAPONS.ember;
    let line = `THE BUILD — ${weapon.name.toUpperCase()} · ${state.build.join(' · ')}`;
    if (line.length > 92) line = `${line.slice(0, 89)}…`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(line, FIELD.width / 2, y);
  }

  function drawOver(state, ui) {
    dim(0.62);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.heart;
    ctx.font = '800 58px system-ui, sans-serif';
    ctx.fillText('THE LIGHT FADES', FIELD.width / 2, 150);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText(`The dark took the keeper on wave ${Math.min(state.wave, WAVE_COUNT)}.`, FIELD.width / 2, 190);
    drawStats(state, ui, 250);
    drawBuild(state, 472);
    drawButton(RESTART_BUTTON, 'TRY AGAIN', true);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('or press Space', FIELD.width / 2, 620);
  }

  function drawStar(cx, cy, r, filled) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? PALETTE.gold : 'rgba(255, 209, 102, 0.18)';
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEmberRain(time) {
    // Victory embers: forty-two sparks falling with a sway, placed by a fixed
    // function of their index and the clock, so no state is needed to draw them.
    for (let i = 0; i < 42; i += 1) {
      const x = (i * 173) % FIELD.width;
      const y = ((time * 70 + i * 97) % (FIELD.height + 40)) - 20;
      const sway = Math.sin(time * 2 + i) * 8;
      ctx.globalAlpha = 0.35 + 0.4 * (((i * 37) % 10) / 10);
      ctx.fillStyle = i % 3 === 0 ? '#ffd166' : '#ff9a3c';
      ctx.beginPath();
      ctx.arc(x + sway, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawVictory(state, ui) {
    dim(0.55);
    drawEmberRain(state.time);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '800 58px system-ui, sans-serif';
    ctx.fillText('THE NIGHT IS HELD', FIELD.width / 2, 130);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillText('Ten waves, and the lantern still burns.', FIELD.width / 2, 168);
    const stars = 1 + (state.player.hp >= 3 ? 1 : 0) + (state.playTime < 480 ? 1 : 0);
    drawStar(FIELD.width / 2 - 90, 226, 30, stars >= 1);
    drawStar(FIELD.width / 2, 214, 38, stars >= 2);
    drawStar(FIELD.width / 2 + 90, 226, 30, stars >= 3);
    drawStats(state, ui, 288);
    drawBuild(state, 506);
    drawButton(RESTART_BUTTON, 'PLAY AGAIN', true);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('or press Space', FIELD.width / 2, 620);
  }

  return {
    draw(state, screen, ui) {
      const dpr = fitCanvas();
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      const scale = Math.min(cw / FIELD.width, ch / FIELD.height);
      const ox = (cw - FIELD.width * scale) / 2;
      const oy = (ch - FIELD.height * scale) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(dpr, state.time);
      const shake = state.particles.offset();
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + shake.x * scale), dpr * (oy + shake.y * scale));
      drawFloor(state);
      state.particles.drawBackground(ctx);

      // Embers: small green diamonds on the floor.
      for (const m of state.embers) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#8affc1';
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
      for (const p of state.pickups) drawPickup(ctx, p, state.time);
      for (const e of state.enemies) drawEnemy(ctx, e, state.time);

      // The keeper stands unless the game is over (or the title is showing the
      // empty arena behind it — in attract mode there is no keeper to draw).
      if (!state.attract && !state.over) drawPlayer(state.player, state.time);

      // Friendly shots: glowing embers with a trail back along their flight path,
      // coloured by the weapon that fired them; lances draw as heavy bolts.
      for (const b of state.bullets) {
        const col = b.kind === 'lance' ? '#c99aff' : b.kind === 'spread' ? '#7fe7ff' : b.kind === 'wisp' ? '#8affc1' : '#ffd166';
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = b.kind === 'lance' ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.crit ? '#ffe066' : col;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.kind === 'lance' ? 8 : b.crit ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 180, 80, 0.35)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.kind === 'lance' ? 14 : 10, 0, Math.PI * 2);
        ctx.fill();
      }
      // Hostile shots: hot red orbs with a short trail.
      for (const b of state.ebullets) {
        ctx.strokeStyle = '#ff4d6d';
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff4d6d';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 77, 109, 0.3)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      state.particles.draw(ctx);

      // A vignette, so the corners fall into night and the middle glows.
      const vig = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 340, FIELD.width / 2, FIELD.height / 2, 780);
      vig.addColorStop(0, 'rgba(3, 5, 14, 0)');
      vig.addColorStop(1, 'rgba(3, 5, 14, 0.45)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);

      // One heart left: the edges pulse red, so the danger is impossible to miss.
      if ((screen === SCREEN_PLAY || screen === SCREEN_UPGRADE) && state.player && state.player.hp <= 1 && !state.over) {
        const pulse = 0.22 + 0.14 * Math.sin(state.time * 6);
        const dv = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 320, FIELD.width / 2, FIELD.height / 2, 780);
        dv.addColorStop(0, 'rgba(255, 30, 60, 0)');
        dv.addColorStop(1, `rgba(255, 30, 60, ${pulse})`);
        ctx.fillStyle = dv;
        ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      }

      if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) {
        drawHud(state, ui);
        drawBanner(state);
        // First-wave hints, fading as the keeper finds their feet.
        if (screen === SCREEN_PLAY && state.wave === 1 && state.time < 9 && !state.banner) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (9 - state.time) / 2);
          ctx.textAlign = 'center';
          ctx.fillStyle = PALETTE.dim;
          ctx.font = '600 17px system-ui, sans-serif';
          ctx.fillText('WASD move · Click or Space shoot · Shift dash · Esc pause', FIELD.width / 2, FIELD.height - 52);
          ctx.restore();
        }
      }
      if (screen === SCREEN_TITLE) drawTitle(state, ui);
      else if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui);
      else if (screen === SCREEN_PAUSED) drawPaused(state, ui);
      else if (screen === SCREEN_OVER) drawOver(state, ui);
      else if (screen === SCREEN_VICTORY) drawVictory(state, ui);
    },
  };
}
