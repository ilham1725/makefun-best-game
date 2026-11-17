// Juice: sparks, ember bursts, floating damage numbers, drifting background motes and
// trauma-based screen shake. Particles are pooled (no allocation mid-frame), each one a
// short-lived dot with velocity, drag and a fade; the shake decays on its own and the
// renderer reads the current offset once per frame.

import { FIELD } from './config.js';

const MAX_PARTICLES = 400;
const MAX_TEXTS = 24;
const MOTES = 46;

/**
 * One particle system for the whole game: bursts on kills and hits, drifting motes behind
 * everything, and the shake that sells the heavy moments.
 */
export function createParticles() {
  const parts = [];
  const texts = [];
  const motes = [];
  let trauma = 0;
  let moteSeed = 1234567;

  function moteRandom() {
    moteSeed = (moteSeed * 1664525 + 1013904223) >>> 0;
    return moteSeed / 4294967296;
  }

  for (let i = 0; i < MOTES; i += 1) {
    motes.push({
      x: moteRandom() * FIELD.width,
      y: moteRandom() * FIELD.height,
      r: 1 + moteRandom() * 2.2,
      vy: -(4 + moteRandom() * 10),
      drift: moteRandom() * Math.PI * 2,
      alpha: 0.15 + moteRandom() * 0.4,
    });
  }

  return {
    /** A radial burst of sparks. */
    burst(x, y, color, count = 12, speed = 220) {
      for (let i = 0; i < count; i += 1) {
        if (parts.length >= MAX_PARTICLES) parts.shift();
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const v = speed * (0.4 + Math.random() * 0.9);
        parts.push({
          x, y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          life: 0.35 + Math.random() * 0.4,
          maxLife: 0.75,
          r: 1.5 + Math.random() * 2.5,
          color,
        });
      }
    },
    /** A rising ember trail, for pickups and level-ups. */
    embers(x, y, color, count = 8) {
      for (let i = 0; i < count; i += 1) {
        if (parts.length >= MAX_PARTICLES) parts.shift();
        parts.push({
          x: x + (Math.random() - 0.5) * 24,
          y: y + (Math.random() - 0.5) * 24,
          vx: (Math.random() - 0.5) * 30,
          vy: -40 - Math.random() * 60,
          life: 0.5 + Math.random() * 0.5,
          maxLife: 1,
          r: 1.5 + Math.random() * 2,
          color,
        });
      }
    },
    /** A number or short word that floats up and fades. */
    text(x, y, str, color = '#ffd166', size = 18) {
      if (texts.length >= MAX_TEXTS) texts.shift();
      texts.push({ x, y, str, color, size, life: 0.9, maxLife: 0.9 });
    },
    /** Add shake; 1 is a heavy hit, 0.3 a nudge. */
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    /** The offset the renderer should apply this frame. */
    offset() {
      if (trauma <= 0.01) return { x: 0, y: 0 };
      const s = trauma * trauma * 14;
      return {
        x: (Math.random() * 2 - 1) * s,
        y: (Math.random() * 2 - 1) * s,
      };
    },
    update(dt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        const t = texts[i];
        t.life -= dt;
        t.y -= 42 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
      for (const m of motes) {
        m.y += m.vy * dt;
        m.x += Math.sin(m.drift + m.y * 0.01) * 6 * dt;
        if (m.y < -6) {
          m.y = FIELD.height + 6;
          m.x = Math.random() * FIELD.width;
        }
      }
    },
    drawBackground(ctx) {
      for (const m of motes) {
        ctx.globalAlpha = m.alpha * 0.7;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    draw(ctx) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const t of texts) {
        ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
        ctx.font = `700 ${t.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
  };
}
