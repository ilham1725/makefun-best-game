// The things that come out of the dark: five enemy kinds, each with its own shape, speed
// and trick, plus the two bosses. Every enemy is a plain object the world steps; the
// behaviour switch lives here so the world never has to know what a darter is. Bosses
// change their attacks halfway through the fight, and elites are the same kinds grown
// large and mean.

import { BOSS_DEFS, ELITE, ENEMY_BULLET, ENEMY_DEFS, FIELD } from './config.js';

/** How long a fresh spawn takes to fade in before it can be hit. */
const SPAWN_IN = 0.35;

/** Build one enemy of a kind at a position. Elites scale up in every dimension. */
export function createEnemy(kind, x, y, rng, elite = false) {
  const def = ENEMY_DEFS[kind];
  const hp = elite ? def.hp * ELITE.hpMul : def.hp;
  return {
    kind,
    x, y,
    vx: 0, vy: 0,
    hp, maxHp: hp,
    radius: def.radius * (elite ? ELITE.radiusMul : 1),
    speed: def.speed * (elite ? ELITE.speedMul : 1) * rng.range(0.92, 1.08),
    score: def.score * (elite ? ELITE.scoreMul : 1),
    xp: def.xp * (elite ? ELITE.xpMul : 1),
    damage: def.damage,
    color: def.color,
    core: def.core,
    elite,
    boss: 0,
    t: 0,
    state: 'seek',
    stateT: 0,
    angle: 0,
    flash: 0,
    shootT: rng.range(1.0, 2.0),
    summonT: 5,
    phase: 1,
    spawnT: SPAWN_IN,
    strafeDir: rng.sign(),
    lungeX: 0,
    lungeY: 0,
    wobble: rng.range(0, Math.PI * 2),
  };
}

/** Build a boss: tier 1 guards wave 5, tier 2 guards wave 10. */
export function createBoss(tier, x, y) {
  const def = BOSS_DEFS[tier === 2 ? 'boss2' : 'boss1'];
  return {
    kind: tier === 2 ? 'boss2' : 'boss1',
    x, y,
    vx: 0, vy: 0,
    hp: def.hp, maxHp: def.hp,
    radius: def.radius,
    speed: def.speed,
    score: def.score,
    xp: def.xp,
    damage: 2,
    color: def.color,
    core: def.core,
    elite: false,
    boss: tier,
    t: 0,
    state: 'seek',
    stateT: 0,
    angle: 0,
    flash: 0,
    shootT: 2.0,
    summonT: 6,
    phase: 1,
    spawnT: 0.8,
    strafeDir: 1,
    lungeX: 0,
    lungeY: 0,
    wobble: 0,
    spiralAngle: 0,
    chargeT: 5,
  };
}

function angleTo(e, px, py) {
  return Math.atan2(py - e.y, px - e.x);
}

function distTo(e, px, py) {
  return Math.hypot(px - e.x, py - e.y);
}

function clampToField(e) {
  const m = e.radius * 0.6;
  e.x = Math.max(m, Math.min(FIELD.width - m, e.x));
  e.y = Math.max(m, Math.min(FIELD.height - m, e.y));
}

/** One enemy, one step: move it, fire its shots, change its state. */
export function updateEnemy(e, world, dt) {
  const player = world.player;
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt * 10);
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    return;
  }
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  e.angle = Math.atan2(dy, dx);

  switch (e.kind) {
    case 'drifter': {
      e.vx = nx * e.speed;
      e.vy = ny * e.speed;
      break;
    }
    case 'swarm': {
      // Fast, with a sideways wobble that makes a pack look alive.
      const wob = Math.sin(e.t * 6 + e.wobble) * 0.55;
      e.vx = (nx - ny * wob) * e.speed;
      e.vy = (ny + nx * wob) * e.speed;
      break;
    }
    case 'darter': {
      e.stateT -= dt;
      if (e.state === 'seek') {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
        if (dist < 250 && e.stateT <= 0) {
          e.state = 'aim';
          e.stateT = 0.45;
        }
      } else if (e.state === 'aim') {
        e.vx *= 1 - 4 * dt;
        e.vy *= 1 - 4 * dt;
        if (e.stateT <= 0) {
          e.state = 'lunge';
          e.stateT = 0.32;
          e.lungeX = nx;
          e.lungeY = ny;
        }
      } else if (e.state === 'lunge') {
        e.vx = e.lungeX * e.speed * 3.4;
        e.vy = e.lungeY * e.speed * 3.4;
        if (e.stateT <= 0) {
          e.state = 'rest';
          e.stateT = 0.55;
        }
      } else {
        e.vx *= 1 - 3 * dt;
        e.vy *= 1 - 3 * dt;
        if (e.stateT <= 0) {
          e.state = 'seek';
          e.stateT = 0.4;
        }
      }
      break;
    }
    case 'spitter': {
      // Holds a ring around the keeper and spits aimed shots from it.
      let mx = 0;
      let my = 0;
      if (dist > 340) {
        mx = nx;
        my = ny;
      } else if (dist < 250) {
        mx = -nx;
        my = -ny;
      }
      mx += -ny * 0.6 * e.strafeDir;
      my += nx * 0.6 * e.strafeDir;
      const ml = Math.hypot(mx, my) || 1;
      e.vx = (mx / ml) * e.speed;
      e.vy = (my / ml) * e.speed;
      e.shootT -= dt;
      if (e.shootT <= 0 && dist < 560) {
        world.spawnEnemyBullet(e.x, e.y, nx * ENEMY_BULLET.speed, ny * ENEMY_BULLET.speed);
        e.shootT = 2.1;
      }
      break;
    }
    case 'brute': {
      e.vx = nx * e.speed;
      e.vy = ny * e.speed;
      break;
    }
    case 'boss1': {
      updateBoss1(e, world, dt, nx, ny, dist);
      break;
    }
    case 'boss2': {
      updateBoss2(e, world, dt, nx, ny, dist);
      break;
    }
    default: {
      e.vx = nx * e.speed;
      e.vy = ny * e.speed;
    }
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
  clampToField(e);
}

/** The Hollow Lantern: slow chase, radial bursts, and it calls drifters to its side. */
function updateBoss1(e, world, dt, nx, ny, dist) {
  if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
    e.phase = 2;
    world.showBanner('THE LANTERN CRACKS', 'it burns faster now', 2.0);
  }
  e.vx = nx * e.speed * (dist > 200 ? 1 : 0.3);
  e.vy = ny * e.speed * (dist > 200 ? 1 : 0.3);
  e.shootT -= dt;
  if (e.shootT <= 0) {
    const count = e.phase === 2 ? 12 : 8;
    const offset = world.rng.range(0, Math.PI * 2);
    for (let i = 0; i < count; i += 1) {
      const a = offset + (i / count) * Math.PI * 2;
      world.spawnEnemyBullet(e.x, e.y, Math.cos(a) * 210, Math.sin(a) * 210);
    }
    if (e.phase === 2) {
      for (let k = -1; k <= 1; k += 1) {
        const a = angleTo(e, world.player.x, world.player.y) + k * 0.22;
        world.spawnEnemyBullet(e.x, e.y, Math.cos(a) * 300, Math.sin(a) * 300);
      }
    }
    e.shootT = e.phase === 2 ? 2.4 : 3.2;
  }
  e.summonT -= dt;
  if (e.summonT <= 0) {
    const alive = world.enemies.length;
    if (alive < 14) {
      for (let i = 0; i < 2; i += 1) {
        const a = world.rng.range(0, Math.PI * 2);
        world.spawnEnemy('drifter', e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, false);
      }
    }
    e.summonT = 7;
  }
}

/** The Night Warden: a spiral of shots, a telegraphed charge, and swarm calls. */
function updateBoss2(e, world, dt, nx, ny, dist) {
  if (e.hp < e.maxHp * 0.5 && e.phase === 1) {
    e.phase = 2;
    world.showBanner('THE WARDEN UNMASKS', 'the spiral tightens', 2.0);
  }
  e.stateT -= dt;
  if (e.state === 'charge') {
    e.vx = e.lungeX * e.speed * 4.4;
    e.vy = e.lungeY * e.speed * 4.4;
    if (e.stateT <= 0) {
      e.state = 'seek';
      e.stateT = 0.6;
      e.chargeT = e.phase === 2 ? 4.5 : 6;
    }
  } else if (e.state === 'aim') {
    e.vx *= 1 - 4 * dt;
    e.vy *= 1 - 4 * dt;
    if (e.stateT <= 0) {
      e.state = 'charge';
      e.stateT = 0.5;
      e.lungeX = nx;
      e.lungeY = ny;
    }
  } else {
    e.vx = nx * e.speed * (dist > 180 ? 1 : 0.25);
    e.vy = ny * e.speed * (dist > 180 ? 1 : 0.25);
    e.chargeT -= dt;
    if (e.chargeT <= 0 && dist < 520) {
      e.state = 'aim';
      e.stateT = 0.6;
    }
  }
  // A slow spiral: one shot per tick, the angle walking around the circle.
  e.shootT -= dt;
  if (e.shootT <= 0) {
    e.spiralAngle += 0.55;
    const a = e.spiralAngle;
    world.spawnEnemyBullet(e.x, e.y, Math.cos(a) * 195, Math.sin(a) * 195);
    if (e.phase === 2) {
      world.spawnEnemyBullet(e.x, e.y, Math.cos(a + Math.PI) * 195, Math.sin(a + Math.PI) * 195);
    }
    e.shootT = e.phase === 2 ? 0.1 : 0.14;
  }
  e.summonT -= dt;
  if (e.summonT <= 0) {
    if (world.enemies.length < 16) {
      for (let i = 0; i < 4; i += 1) {
        const a = world.rng.range(0, Math.PI * 2);
        world.spawnEnemy('swarm', e.x + Math.cos(a) * 80, e.y + Math.sin(a) * 80, false);
      }
    }
    e.summonT = 8;
  }
}

/** Draw one enemy: a distinct silhouette per kind, a flash when hit, a ring when elite. */
export function drawEnemy(ctx, e, time) {
  const scaleIn = e.spawnT > 0 ? 1 - e.spawnT / SPAWN_IN : 1;
  const r = e.radius * (0.4 + 0.6 * scaleIn);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha = 0.35 + 0.65 * scaleIn;

  // A soft glow behind everything, so shapes read on the dark floor.
  const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.1);
  glow.addColorStop(0, e.color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= 0.35;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35 + 0.65 * scaleIn;

  ctx.rotate(e.kind === 'darter' || e.kind === 'swarm' ? e.angle : 0);
  ctx.fillStyle = e.color;
  ctx.strokeStyle = e.core;
  ctx.lineWidth = 2;
  switch (e.kind) {
    case 'drifter': {
      // A wisp: a round body with a wavy tail.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      const wob = Math.sin(time * 5 + e.wobble) * r * 0.3;
      ctx.moveTo(-r * 0.7, r * 0.4);
      ctx.quadraticCurveTo(-r * 0.4 + wob, r * 1.5, 0, r * 1.2);
      ctx.quadraticCurveTo(r * 0.4 - wob, r * 1.5, r * 0.7, r * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'darter': {
      // A sharp arrowhead, telegraphing red as it aims.
      if (e.state === 'aim') {
        ctx.fillStyle = '#ff2e4d';
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
        ctx.globalAlpha *= 0.4;
        ctx.fill();
        ctx.globalAlpha = 0.35 + 0.65 * scaleIn;
        ctx.fillStyle = e.color;
      }
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.8, r * 0.85);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.8, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'spitter': {
      // A spiky blob with a dark mouth.
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.25 : r * 0.8;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0a0e24';
      ctx.beginPath();
      ctx.arc(r * 0.3, 0, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'brute': {
      // A heavy hexagon with a cracked core.
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = e.core;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.2);
      ctx.lineTo(0, r * 0.1);
      ctx.lineTo(r * 0.5, -r * 0.3);
      ctx.stroke();
      break;
    }
    case 'swarm': {
      // A tiny darting triangle.
      ctx.beginPath();
      ctx.moveTo(r * 1.4, 0);
      ctx.lineTo(-r, r * 0.9);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r, -r * 0.9);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'boss1': {
      // A great cracked lantern with a burning eye.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a1a08';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.7);
      ctx.lineTo(-r * 0.2, -r * 0.1);
      ctx.lineTo(-r * 0.55, r * 0.5);
      ctx.moveTo(r * 0.5, -r * 0.6);
      ctx.lineTo(r * 0.15, 0);
      ctx.lineTo(r * 0.6, r * 0.55);
      ctx.stroke();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0d00';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'boss2': {
      // A crowned shade: a wide hood, horns, two burning eyes.
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.6);
      ctx.quadraticCurveTo(-r * 1.1, -r * 0.6, 0, -r);
      ctx.quadraticCurveTo(r * 1.1, -r * 0.6, r, r * 0.6);
      ctx.quadraticCurveTo(0, r * 1.15, -r, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = e.core;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.55);
      ctx.lineTo(-r * 1.05, -r * 1.25);
      ctx.moveTo(r * 0.7, -r * 0.55);
      ctx.lineTo(r * 1.05, -r * 1.25);
      ctx.stroke();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.1, r * 0.13, 0, Math.PI * 2);
      ctx.arc(r * 0.32, -r * 0.1, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Elites wear a gold ring.
  if (e.elite) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A hit flashes the shape pale for an instant — capped, so a boss under constant
  // fire shimmers instead of washing out to a white disc.
  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(0.5, e.flash * 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
