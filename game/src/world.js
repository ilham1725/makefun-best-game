// The simulation: one world, one fixed step, everything the game is. The keeper moves,
// shoots and levels; waves arrive on schedule; kills drop embers and sometimes gifts;
// the combo rewards aggression. The world never reads the wall clock or the network —
// the same seed and the same inputs always play the same game, which is what makes the
// staged screenshots honest. Sounds are reported as events; the loop plays them.

import { COMBO, COMBO_MILESTONES, DASH, ENEMY_BULLET, FIELD, PLAYER, STEP, WAVE_COUNT, xpForLevel } from './config.js';
import { createRandom } from './random.js';
import { createBoss, createEnemy, updateEnemy } from './enemies.js';
import { applyPickup, createPickup } from './pickups.js';
import { baseStats, rollUpgrades } from './upgrades.js';
import { waveDef, waveSpawns } from './waves.js';
import { createParticles } from './particles.js';

/** Events a step can report, as a bitmask. */
export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_VICTORY = 4;
export const EVENT_LEVELUP = 8;
export const EVENT_WAVE = 16;
export const EVENT_BOSS = 32;
export const EVENT_KILL = 64;
export const EVENT_PICKUP = 128;
export const EVENT_NOVA = 256;
export const EVENT_DASH = 512;
export const EVENT_MILESTONE = 1024;

/** Seconds between nova bursts, once the keeper owns the upgrade. */
const NOVA_INTERVAL = 7;
const NOVA_RADIUS = 200;
/** How far off the floor a spawn point sits. */
const SPAWN_MARGIN = 40;

/**
 * A fresh world. Give it a seed (a number) and every reset replays the same game from
 * the same random stream — the screenshot staging relies on that to re-run to an exact
 * frame. Give it a generator instead and resets keep drawing from it.
 */
export function createWorld(seedOrRng) {
  const seed = typeof seedOrRng === 'number' ? seedOrRng : null;
  const rng = seed === null ? seedOrRng : createRandom(seed);
  const world = {
    seed,
    rng,
    particles: createParticles(),
    player: null,
    enemies: [],
    bullets: [],
    ebullets: [],
    embers: [],
    pickups: [],
    wave: 0,
    waveT: 0,
    waveDef: null,
    surgeAt: 0,
    surgeDone: false,
    spawnQueue: [],
    boss: null,
    score: 0,
    kills: 0,
    combo: 0,
    comboT: 0,
    bestCombo: 0,
    milestone: 0,
    milestoneT: 0,
    time: 0,
    playTime: 0,
    banner: null,
    levelUpsPending: 0,
    pendingUpgrades: null,
    /** The blessings taken this run, in order — the end screens show the build. */
    build: [],
    over: false,
    victory: false,
    attract: false,
    shotsFired: 0,
    shotsHit: 0,
    embersCollected: 0,
    wavesCleared: 0,
    lastEmberSound: 0,
    onEvent: null,
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      hp: PLAYER.maxHp,
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      stats: baseStats(),
      fireT: 0,
      invulnT: 0,
      shieldT: 0,
      spreadT: 0,
      novaT: NOVA_INTERVAL,
      dashT: 0,
      dashCd: 0,
      dashX: 0,
      dashY: 0,
      dashing: false,
      wispT: 0,
      secondWindUsed: false,
      muzzleT: 0,
      aimX: FIELD.width / 2,
      aimY: FIELD.height / 2 - 100,
      moving: false,
    };
  }

  function edgePoint() {
    const edge = rng.int(0, 3);
    if (edge === 0) return { x: rng.range(0, FIELD.width), y: SPAWN_MARGIN };
    if (edge === 1) return { x: rng.range(0, FIELD.width), y: FIELD.height - SPAWN_MARGIN };
    if (edge === 2) return { x: SPAWN_MARGIN, y: rng.range(0, FIELD.height) };
    return { x: FIELD.width - SPAWN_MARGIN, y: rng.range(0, FIELD.height) };
  }

  function startWave(n) {
    const def = waveDef(n);
    if (!def) return;
    world.wave = n;
    world.waveT = 0;
    world.waveDef = def;
    world.surgeAt = def.surge ? 8 : 0;
    world.surgeDone = false;
    world.spawnQueue = waveSpawns(n);
    world.banner = { text: def.banner, sub: def.sub, t: 2.6, dur: 2.6 };
    if (def.boss) {
      const boss = createBoss(def.boss, FIELD.width / 2, 150);
      world.enemies.push(boss);
      world.boss = boss;
      // Boss waves get the framed intro card, named for the boss itself.
      world.banner = { text: def.sub, sub: `wave ${n} of ${WAVE_COUNT}`, t: 3.2, dur: 3.2, boss: true };
      emit(EVENT_BOSS);
    } else {
      emit(EVENT_WAVE);
    }
  }

  function emit(event) {
    if (world.onEvent) world.onEvent(event);
  }

  function scoreFor(enemy) {
    const mult = Math.min(COMBO.cap, 1 + Math.min(world.combo, 20) * COMBO.step);
    return Math.round(enemy.score * mult);
  }

  function dropEmbers(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const v = rng.range(40, 170);
      world.embers.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: 0,
      });
    }
  }

  function maybeDropPickup(enemy) {
    let chance = 0.05;
    if (enemy.elite) chance = 1;
    else if (enemy.kind === 'brute') chance = 0.35;
    else if (enemy.boss) chance = 1;
    if (!rng.chance(chance)) return;
    const kinds = ['spread', 'shield', 'heal', 'magnet'];
    const kind = kinds[rng.int(0, kinds.length - 1)];
    world.pickups.push(createPickup(kind, enemy.x, enemy.y));
    if (enemy.boss) {
      world.pickups.push(createPickup('heal', enemy.x + 40, enemy.y));
    }
  }

  function killEnemy(enemy, index) {
    world.enemies.splice(index, 1);
    world.kills += 1;
    world.combo += 1;
    world.comboT = COMBO.window;
    world.bestCombo = Math.max(world.bestCombo, world.combo);
    const gained = scoreFor(enemy);
    world.score += gained;
    world.particles.burst(enemy.x, enemy.y, enemy.color, enemy.boss ? 40 : enemy.elite ? 22 : 12, enemy.boss ? 320 : 220);
    world.particles.text(enemy.x, enemy.y - enemy.radius - 6, `+${gained}`, '#ffd166', enemy.boss ? 26 : 16);
    if (enemy.elite || enemy.boss) world.particles.shake(enemy.boss ? 0.7 : 0.35);
    dropEmbers(enemy.x, enemy.y, enemy.xp);
    maybeDropPickup(enemy);
    if (enemy.kind === 'brute') {
      // A brute falls apart into two drifters.
      for (let i = 0; i < 2; i += 1) {
        const a = rng.range(0, Math.PI * 2);
        world.enemies.push(createEnemy('drifter', enemy.x + Math.cos(a) * 24, enemy.y + Math.sin(a) * 24, rng, false));
      }
    }
    if (enemy.mod === 'splitting') {
      // A splitting elite bursts into two swarm wisps.
      for (let i = 0; i < 2; i += 1) {
        const a = rng.range(0, Math.PI * 2);
        world.enemies.push(createEnemy('swarm', enemy.x + Math.cos(a) * 20, enemy.y + Math.sin(a) * 20, rng, false));
      }
    }
    // Combo milestones pay out a burst of experience the first time each is reached.
    for (const m of COMBO_MILESTONES) {
      if (world.combo >= m.at && world.milestone < m.at) {
        world.milestone = m.at;
        world.milestoneT = 1.6;
        world.player.xp += m.xp;
        world.particles.text(world.player.x, world.player.y - 42, `COMBO x${m.at}! +${m.xp} XP`, '#ffd166', 22);
        world.particles.burst(world.player.x, world.player.y, '#ffd166', 14, 260);
        emit(EVENT_MILESTONE);
      }
    }
    if (enemy.boss) {
      world.boss = null;
      world.particles.burst(enemy.x, enemy.y, '#ffffff', 30, 380);
    }
    emit(EVENT_KILL);
  }

  function hurtPlayer(damage, fromX, fromY) {
    const player = world.player;
    if (player.invulnT > 0 || world.over || world.victory) return;
    if (player.shieldT > 0) return;
    player.hp -= damage;
    player.invulnT = PLAYER.invulnTime;
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x + (dx / d) * 26));
    player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y + (dy / d) * 26));
    world.particles.burst(player.x, player.y, '#ff5d73', 18, 260);
    world.particles.shake(0.55);
    world.combo = 0;
    world.comboT = 0;
    emit(EVENT_HIT);
    if (player.hp <= 0) {
      // Second Wind: once per run, the lantern refuses to die.
      if (player.stats.secondWind > 0 && !player.secondWindUsed) {
        player.secondWindUsed = true;
        player.hp = 1;
        player.invulnT = 2;
        world.showBanner('SECOND WIND', 'the lantern refuses to die', 2.0);
        world.particles.burst(player.x, player.y, '#ffd166', 40, 380);
        world.particles.shake(0.6);
        return;
      }
      player.hp = 0;
      world.over = true;
      world.particles.burst(player.x, player.y, '#ffd166', 60, 340);
      world.particles.shake(1);
      emit(EVENT_OVER);
    }
  }

  function fireVolley() {
    const player = world.player;
    const stats = player.stats;
    const weapon = stats.weapon || 'ember';
    const aim = Math.atan2(player.aimY - player.y, player.aimX - player.x);
    player.muzzleT = 0.06;
    if (weapon === 'lance') {
      // The lance: one slow, heavy bolt that pierces everything it crosses.
      const crit = rng.chance(stats.crit);
      world.bullets.push({
        x: player.x + Math.cos(aim) * 24,
        y: player.y + Math.sin(aim) * 24,
        vx: Math.cos(aim) * stats.bulletSpeed * 0.85,
        vy: Math.sin(aim) * stats.bulletSpeed * 0.85,
        damage: stats.damage * 3 * (crit ? 3 : 1),
        pierce: stats.pierce + 2,
        life: stats.bulletLife * 1.2,
        crit,
        kind: 'lance',
        hit: [],
      });
      world.shotsFired += 1;
      player.fireT = stats.fireInterval * 1.7;
      return;
    }
    const count = stats.projectiles + (player.spreadT > 0 ? 2 : 0) + (weapon === 'spread' ? 2 : 0);
    const spread = weapon === 'spread' ? 0.24 : 0.11;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * spread;
      const a = aim + offset;
      const crit = rng.chance(stats.crit);
      world.bullets.push({
        x: player.x + Math.cos(a) * 20,
        y: player.y + Math.sin(a) * 20,
        vx: Math.cos(a) * stats.bulletSpeed,
        vy: Math.sin(a) * stats.bulletSpeed,
        damage: stats.damage * (crit ? 3 : 1),
        pierce: stats.pierce,
        life: stats.bulletLife * (weapon === 'spread' ? 0.8 : 1),
        crit,
        kind: weapon,
        hit: [],
      });
    }
    world.shotsFired += count;
    player.fireT = stats.fireInterval;
  }

  function fireNova() {
    const player = world.player;
    const damage = 2 * player.stats.nova;
    world.particles.burst(player.x, player.y, '#ffd166', 26, 420);
    world.particles.shake(0.25);
    for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
      const e = world.enemies[i];
      if (Math.hypot(e.x - player.x, e.y - player.y) <= NOVA_RADIUS + e.radius) {
        e.hp -= damage;
        e.flash = 1;
        if (e.hp <= 0) killEnemy(e, i);
      }
    }
    emit(EVENT_NOVA);
  }

  function checkLevelUp() {
    const player = world.player;
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.xpNext = xpForLevel(player.level);
      world.levelUpsPending += 1;
      if (!world.pendingUpgrades) world.pendingUpgrades = rollUpgrades(rng, 3);
      world.particles.embers(player.x, player.y, '#8affc1', 16);
      emit(EVENT_LEVELUP);
    }
  }

  /** Step the world once. `ctrl` carries movement, aim and fire; attract mode idles. */
  function step(dt, ctrl, attractMode) {
    world.time += dt;
    world.particles.update(dt);
    if (world.banner) {
      world.banner.t -= dt;
      if (world.banner.t <= 0) world.banner = null;
    }

    if (attractMode) {
      stepAttract(dt);
      return 0;
    }
    if (world.over || world.victory) {
      updateEmbers(dt);
      return 0;
    }
    world.playTime += dt;
    const player = world.player;

    // Timers.
    player.fireT -= dt;
    player.invulnT = Math.max(0, player.invulnT - dt);
    player.shieldT = Math.max(0, player.shieldT - dt);
    player.spreadT = Math.max(0, player.spreadT - dt);
    player.muzzleT = Math.max(0, player.muzzleT - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    world.milestoneT = Math.max(0, world.milestoneT - dt);
    if (world.comboT > 0) {
      world.comboT -= dt;
      if (world.comboT <= 0) world.combo = 0;
    }

    // Move the keeper.
    const mx = ctrl.mx || 0;
    const my = ctrl.my || 0;
    const ml = Math.hypot(mx, my);
    player.moving = ml > 0.1;
    if (ml > 0.1) {
      const speed = player.stats.speed;
      player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x + (mx / ml) * speed * dt));
      player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y + (my / ml) * speed * dt));
    }
    player.aimX = ctrl.ax;
    player.aimY = ctrl.ay;

    // Dash: a burst in the move direction (or the aim, when standing still), with
    // mercy frames for the burst and a breath after. One press, one dash.
    if (ctrl.dash && player.dashCd <= 0 && !player.dashing) {
      player.dashing = true;
      player.dashT = DASH.duration;
      player.dashCd = DASH.cooldown * player.stats.dashCdMul;
      player.invulnT = Math.max(player.invulnT, DASH.duration + DASH.invulnAfter);
      if (ml > 0.1) {
        player.dashX = mx / ml;
        player.dashY = my / ml;
      } else {
        const a = Math.atan2(player.aimY - player.y, player.aimX - player.x);
        player.dashX = Math.cos(a);
        player.dashY = Math.sin(a);
      }
      world.particles.burst(player.x, player.y, '#ffd166', 10, 200);
      emit(EVENT_DASH);
    }
    if (player.dashing) {
      player.dashT -= dt;
      const ds = player.stats.speed * DASH.speedMul;
      player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x + player.dashX * ds * dt));
      player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y + player.dashY * ds * dt));
      world.particles.embers(player.x, player.y, '#ffd166', 1);
      if (player.dashT <= 0) player.dashing = false;
    }

    // Shoot.
    if (ctrl.firing && player.fireT <= 0) fireVolley();

    // Nova.
    if (player.stats.nova > 0) {
      player.novaT -= dt;
      if (player.novaT <= 0) {
        player.novaT = NOVA_INTERVAL;
        fireNova();
      }
    }

    // Wisp companions fire on their own at the nearest foe in reach.
    if (player.stats.wisp > 0) {
      player.wispT -= dt;
      if (player.wispT <= 0) {
        player.wispT = 0.5;
        const foe = world.nearestEnemy(player.x, player.y);
        if (foe && Math.hypot(foe.x - player.x, foe.y - player.y) < 460) {
          const a = Math.atan2(foe.y - player.y, foe.x - player.x);
          world.bullets.push({
            x: player.x + Math.cos(a) * 26,
            y: player.y + Math.sin(a) * 26,
            vx: Math.cos(a) * 560,
            vy: Math.sin(a) * 560,
            damage: 1,
            pierce: 0,
            life: 0.9,
            crit: false,
            kind: 'wisp',
            wisp: true,
            hit: [],
          });
        }
      }
    }

    // Waves: feed the schedule, then check for a clear.
    world.waveT += dt;
    while (world.spawnQueue.length > 0 && world.spawnQueue[0].at <= world.waveT) {
      const spawn = world.spawnQueue.shift();
      const p = edgePoint();
      world.enemies.push(createEnemy(spawn.kind, p.x, p.y, rng, spawn.elite));
    }
    // Surge waves: halfway in, the swarm descends all at once.
    if (world.surgeAt > 0 && !world.surgeDone && world.waveT >= world.surgeAt) {
      world.surgeDone = true;
      world.showBanner('THE SURGE IS HERE', 'the swarm descends', 2.2);
      for (let i = 0; i < 6; i += 1) {
        const p = edgePoint();
        world.enemies.push(createEnemy('swarm', p.x, p.y, rng, false));
      }
      emit(EVENT_WAVE);
    }
    if (world.spawnQueue.length === 0 && world.enemies.length === 0 && !world.boss) {
      world.wavesCleared += 1;
      // A wave cleared pays a bonus, bigger the deeper the night.
      const bonus = world.wave * 50;
      world.score += bonus;
      world.particles.text(player.x, player.y - 42, `WAVE BONUS +${bonus}`, '#8affc1', 20);
      if (world.wave >= WAVE_COUNT) {
        world.victory = true;
        emit(EVENT_VICTORY);
      } else {
        startWave(world.wave + 1);
      }
    }

    // Enemies act.
    for (const e of world.enemies) updateEnemy(e, world, dt);

    // Bullets fly and hit.
    updateBullets(dt);

    // Enemy shots fly and threaten.
    updateEnemyBullets(dt);

    // Embers drift, magnetise and get collected.
    updateEmbers(dt);
    checkLevelUp();

    // Pickups bob and wait.
    updatePickups(dt);

    // Contact with the keeper hurts.
    for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
      const e = world.enemies[i];
      if (e.spawnT > 0) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < e.radius + PLAYER.radius) {
        if (player.shieldT > 0) {
          e.hp -= 2;
          e.flash = 1;
          world.particles.burst(e.x, e.y, '#7fe7ff', 8, 200);
          if (e.hp <= 0) killEnemy(e, i);
        } else {
          hurtPlayer(e.damage, e.x, e.y);
          // Thorn Cloak: the attacker takes damage back for the touch.
          if (player.stats.thorns > 0) {
            e.hp -= player.stats.thorns;
            e.flash = 1;
            if (e.hp <= 0) killEnemy(e, i);
          }
          // The attacker is knocked back too, so one touch is one hit.
          const nx = (e.x - player.x) / (d || 1);
          const ny = (e.y - player.y) / (d || 1);
          e.x += nx * 30;
          e.y += ny * 30;
        }
      }
    }
    return 0;
  }

  function stepAttract(dt) {
    // The title screen's living backdrop: drifters wander, nobody fights.
    while (world.enemies.length < 7) {
      world.enemies.push(createEnemy('drifter', rng.range(80, FIELD.width - 80), rng.range(80, FIELD.height - 80), rng, false));
      const e = world.enemies[world.enemies.length - 1];
      e.wx = rng.range(80, FIELD.width - 80);
      e.wy = rng.range(80, FIELD.height - 80);
    }
    for (const e of world.enemies) {
      e.t += dt;
      if (e.wx === undefined || Math.hypot(e.wx - e.x, e.wy - e.y) < 30) {
        e.wx = rng.range(80, FIELD.width - 80);
        e.wy = rng.range(80, FIELD.height - 80);
      }
      const dx = e.wx - e.x;
      const dy = e.wy - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * 0.4 * dt;
      e.y += (dy / d) * e.speed * 0.4 * dt;
      e.angle = Math.atan2(dy, dx);
    }
  }

  function updateBullets(dt) {
    for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
      const b = world.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = world.enemies.length - 1; j >= 0; j -= 1) {
          const e = world.enemies[j];
          if (e.spawnT > 0 || b.hit.includes(e)) continue;
          const rr = e.radius + 6;
          if (Math.abs(e.x - b.x) < rr && Math.abs(e.y - b.y) < rr && Math.hypot(e.x - b.x, e.y - b.y) < rr) {
            b.hit.push(e);
            if (!b.wisp) world.shotsHit += 1;
            e.hp -= b.damage;
            e.flash = 1;
            world.particles.burst(b.x, b.y, b.crit ? '#ffe066' : '#ffb347', b.crit ? 8 : 4, 160);
            if (b.crit) world.particles.text(e.x, e.y - e.radius - 4, `${b.damage}!`, '#ffe066', 20);
            if (e.hp <= 0) {
              killEnemy(e, j);
            } else if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
              break;
            }
          }
        }
      }
      if (dead) world.bullets.splice(i, 1);
    }
  }

  function updateEnemyBullets(dt) {
    const player = world.player;
    for (let i = world.ebullets.length - 1; i >= 0; i -= 1) {
      const b = world.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead && player.invulnT <= 0 && player.shieldT <= 0) {
        const rr = ENEMY_BULLET.radius + PLAYER.radius - 4;
        if (Math.hypot(b.x - player.x, b.y - player.y) < rr) {
          hurtPlayer(1, b.x, b.y);
          dead = true;
        }
      } else if (!dead && player.shieldT > 0) {
        const rr = ENEMY_BULLET.radius + PLAYER.radius;
        if (Math.hypot(b.x - player.x, b.y - player.y) < rr) dead = true;
      }
      if (dead) world.ebullets.splice(i, 1);
    }
  }

  function updateEmbers(dt) {
    const player = world.player;
    if (!player) return;
    for (let i = world.embers.length - 1; i >= 0; i -= 1) {
      const m = world.embers[i];
      m.t += dt;
      const dx = player.x - m.x;
      const dy = player.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < player.stats.magnet) {
        const pull = 900 * (1 - d / (player.stats.magnet * 1.6));
        m.vx += (dx / d) * pull * dt;
        m.vy += (dy / d) * pull * dt;
      }
      m.vx *= 1 - 2.4 * dt;
      m.vy *= 1 - 2.4 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (d < PLAYER.radius + 10) {
        world.embers.splice(i, 1);
        player.xp += 1;
        world.embersCollected += 1;
        if (world.time - world.lastEmberSound > 0.06) {
          world.lastEmberSound = world.time;
          world.particles.embers(m.x, m.y, '#8affc1', 2);
        }
      }
    }
  }

  function updatePickups(dt) {
    const player = world.player;
    for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
      const p = world.pickups[i];
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) {
        world.pickups.splice(i, 1);
        continue;
      }
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      if (d < 130) {
        p.x += ((player.x - p.x) / (d || 1)) * 260 * dt;
        p.y += ((player.y - p.y) / (d || 1)) * 260 * dt;
      }
      if (d < PLAYER.radius + 16) {
        world.pickups.splice(i, 1);
        applyPickup(world, p.kind);
        world.particles.burst(p.x, p.y, '#ffd166', 14, 220);
        emit(EVENT_PICKUP);
      }
    }
  }

  world.reset = function reset() {
    if (world.seed !== null) world.rng.seed(world.seed);
    world.player = freshPlayer();
    world.enemies = [];
    world.bullets = [];
    world.ebullets = [];
    world.embers = [];
    world.pickups = [];
    world.wave = 0;
    world.waveT = 0;
    world.waveDef = null;
    world.surgeAt = 0;
    world.surgeDone = false;
    world.spawnQueue = [];
    world.boss = null;
    world.score = 0;
    world.kills = 0;
    world.combo = 0;
    world.comboT = 0;
    world.bestCombo = 0;
    world.milestone = 0;
    world.milestoneT = 0;
    world.time = 0;
    world.playTime = 0;
    world.banner = null;
    world.levelUpsPending = 0;
    world.pendingUpgrades = null;
    world.build = [];
    world.over = false;
    world.victory = false;
    world.shotsFired = 0;
    world.shotsHit = 0;
    world.embersCollected = 0;
    world.wavesCleared = 0;
    world.lastEmberSound = 0;
    world.particles = createParticles();
    startWave(1);
  };

  world.step = step;

  /** A foe for the bosses' summons (spawns at the given spot, no schedule). */
  world.spawnEnemy = function spawnEnemy(kind, x, y, elite) {
    world.enemies.push(createEnemy(kind, x, y, rng, elite));
  };

  /** A hostile shot, fired by a spitter or a boss. */
  world.spawnEnemyBullet = function spawnEnemyBullet(x, y, vx, vy) {
    world.ebullets.push({ x, y, vx, vy, life: ENEMY_BULLET.life });
  };

  /** Show a centre-screen banner for a few seconds. */
  world.showBanner = function showBanner(text, sub, seconds) {
    world.banner = { text, sub, t: seconds, dur: seconds };
  };

  /** Take one pending upgrade by id; returns false when it is not offered. */
  world.applyUpgrade = function applyUpgrade(id) {
    if (!world.pendingUpgrades) return false;
    const found = world.pendingUpgrades.find((u) => u.id === id);
    if (!found) return false;
    found.apply(world.player.stats, world);
    world.build.push(found.name);
    world.levelUpsPending -= 1;
    world.pendingUpgrades = world.levelUpsPending > 0 ? rollUpgrades(rng, 3) : null;
    world.particles.embers(world.player.x, world.player.y, '#ffd166', 14);
    return true;
  };

  /** The closest live enemy to a point, or null. */
  world.nearestEnemy = function nearestEnemy(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (e.spawnT > 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  };

  /** The closest loose ember to a point, or null. */
  world.nearestEmber = function nearestEmber(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const m of world.embers) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  };

  world.reset();
  return world;
}
