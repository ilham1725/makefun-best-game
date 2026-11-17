// A small seeded generator (mulberry32) so every run with the same seed plays the same
// way: the same spawns, the same upgrade cards, the same screenshot. The world never
// touches Math.random; only the boot code picks a seed when the page gives it none.

/**
 * Build a generator from a 32-bit seed. Every method draws from the same stream, so two
 * generators fed the same seed produce the same sequence forever.
 */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** Restart the stream from a seed, so a run can be replayed exactly. */
    seed(s) {
      state = s >>> 0;
    },
    /** A float in [0, 1). */
    next,
    /** A float in [a, b). */
    range(a, b) {
      return a + (b - a) * next();
    },
    /** An integer in [a, b] inclusive. */
    int(a, b) {
      return a + Math.floor(next() * (b - a + 1));
    },
    /** One element of a non-empty array, uniformly. */
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** -1 or 1 with equal odds. */
    sign() {
      return next() < 0.5 ? -1 : 1;
    },
  };
}
