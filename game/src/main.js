// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, upgrade, paused, game over
// and victory.
//
// ?seed=N fixes the run. ?shot=title|play|upgrade|boss|victory|end stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot. ?pilot=1 hands the controls to the autopilot (a test aid that plays the
// real game in real time); ?speed=N runs the loop N times faster for the same purpose.

import { BEST_KEY, STEP } from './config.js';
import {
  ACTION_CARD_1, ACTION_CARD_2, ACTION_CARD_3, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createWorld, EVENT_BOSS, EVENT_DASH, EVENT_HIT, EVENT_KILL, EVENT_LEVELUP, EVENT_MILESTONE, EVENT_NOVA, EVENT_OVER, EVENT_PICKUP, EVENT_VICTORY, EVENT_WAVE } from './world.js';
import { createAudio } from './audio.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY,
  RESTART_BUTTON, START_BUTTON, cardRect, createRenderer, hitButton,
} from './render.js';
import { autopilot, bestCardIndex, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** The pilot waits this long (real seconds) on the upgrade screen before picking. */
const PILOT_PICK_DELAY = 0.7;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const pilotMode = params.get('pilot') === '1';
const speedParam = Number.parseFloat(params.get('speed') ?? '1');
const speed = Number.isFinite(speedParam) && speedParam > 0 ? Math.min(16, speedParam) : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, {
      best: scene.best, upgrades: world.pendingUpgrades, hoverCard: -1, muted: false,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = false;
  try {
    muted = window.localStorage.getItem('glimmerhold-muted') === '1';
    audio.setMuted(muted);
  } catch {
    // Nothing to do.
  }
  let accumulator = 0;
  let last = performance.now();
  let upgradeShownAt = 0;
  let lastKillSound = 0;
  world.attract = true;

  // The debug hook the automated play-through reads: the screen and the numbers.
  function publishDebug() {
    window.__glimmerhold = {
      screen,
      wave: world.wave,
      hp: world.player.hp,
      maxHp: world.player.stats.maxHp,
      score: world.score,
      level: world.player.level,
      kills: world.kills,
      enemies: world.enemies.length,
      pendingUpgrades: world.pendingUpgrades ? world.pendingUpgrades.map((u) => u.id) : null,
      over: world.over,
      victory: world.victory,
      playTime: world.playTime,
      dashCd: world.player.dashCd,
      weapon: world.player.stats.weapon,
    };
  }

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.attract = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startPad();
    audio.click();
    announce(`Playing. Wave 1. ${world.player.hp} hearts.`);
  }

  function endGame(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_OVER;
    if (world.score > best) {
      best = world.score;
      saveBest(best);
    }
    audio.stopPad();
    if (victory) {
      audio.victory();
      announce(`Victory! Score ${world.score}. Best ${best}.`);
    } else {
      audio.gameOver();
      announce(`Game over. Score ${world.score}. Best ${best}.`);
    }
  }

  function toggleMute() {
    muted = !muted;
    audio.setMuted(muted);
    try {
      window.localStorage.setItem('glimmerhold-muted', muted ? '1' : '0');
    } catch {
      // Nothing to do.
    }
  }

  function pickCard(index) {
    if (!world.pendingUpgrades || index >= world.pendingUpgrades.length) return;
    const card = world.pendingUpgrades[index];
    if (!world.applyUpgrade(card.id)) return;
    audio.click();
    audio.levelUp();
    if (world.levelUpsPending > 0 && world.pendingUpgrades) {
      upgradeShownAt = performance.now();
      announce(`Level ${world.player.level}. Another blessing awaits.`);
    } else {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  world.onEvent = (event) => {
    if (event & EVENT_HIT) audio.hurt();
    if (event & EVENT_KILL) {
      const now = performance.now();
      if (now - lastKillSound > 90) {
        lastKillSound = now;
        audio.enemyDie();
      }
    }
    if (event & EVENT_PICKUP) audio.pickup();
    if (event & EVENT_NOVA) audio.nova();
    if (event & EVENT_DASH) audio.dash();
    if (event & EVENT_MILESTONE) audio.milestone();
    if (event & EVENT_WAVE) audio.waveStart();
    if (event & EVENT_BOSS) audio.bossRoar();
    if (event & EVENT_LEVELUP && screen === SCREEN_PLAY) {
      screen = SCREEN_UPGRADE;
      upgradeShownAt = performance.now();
      audio.levelUp();
      announce(`Level ${world.player.level}. Choose a blessing.`);
    }
    if (event & EVENT_OVER) endGame(false);
    if (event & EVENT_VICTORY) endGame(true);
  };

  function handleActions(now) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) toggleMute();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_CARD_1) pickCard(0);
      else if (actions & ACTION_CARD_2) pickCard(1);
      else if (actions & ACTION_CARD_3) pickCard(2);
    }
    const click = input.takeClick();
    if (click) {
      audio.unlock();
      if (screen === SCREEN_TITLE && hitButton(START_BUTTON, click)) startGame();
      else if ((screen === SCREEN_OVER || screen === SCREEN_VICTORY) && hitButton(RESTART_BUTTON, click)) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_UPGRADE) {
        for (let i = 0; i < 3; i += 1) {
          if (hitButton(cardRect(i), click)) {
            pickCard(i);
            break;
          }
        }
      }
    }
    // The pilot starts on its own and picks its cards after a beat, so a test run
    // can watch every screen without a human hand.
    if (pilotMode) {
      if (screen === SCREEN_TITLE && now > 600) startGame();
      else if (screen === SCREEN_UPGRADE && now - upgradeShownAt > PILOT_PICK_DELAY * 1000) {
        pickCard(bestCardIndex(world.pendingUpgrades));
      }
    }
  }

  function stepWorld() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, ax: 0, ay: 0, firing: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const ctrl = pilotMode
      ? autopilot(world)
      : {
        mx: input.direction().x,
        my: input.direction().y,
        ax: input.aim().x,
        ay: input.aim().y,
        firing: input.firing(),
        dash: input.takeDash(),
      };
    world.step(STEP, ctrl, false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME) * speed;
    last = now;
    handleActions(now);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        stepWorld();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const aim = input.aim();
    let hoverCard = -1;
    if (screen === SCREEN_UPGRADE) {
      for (let i = 0; i < 3; i += 1) {
        if (hitButton(cardRect(i), aim)) hoverCard = i;
      }
    }
    renderer.draw(world, screen, {
      best, upgrades: world.pendingUpgrades, hoverCard, muted,
    });
    publishDebug();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Glimmerhold. Press Space or click Start to play.');
  publishDebug();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
