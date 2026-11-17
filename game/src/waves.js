// The ten waves: who comes, how many, how fast. Early waves teach one kind at a time;
// the middle waves mix them and grow elites; waves 5 and 10 belong to the bosses, with a
// trickle of small foes so the arena never feels empty. A wave is a spawn schedule — a
// list of {kind, at, elite} — plus a banner line the renderer shows when it begins.

import { WAVE_COUNT } from './config.js';

/** One spawn entry: a kind, the seconds into the wave it appears, elite or not. */
function at(kind, seconds, elite = false) {
  return { kind, at: seconds, elite };
}

/** Spread `count` spawns of a kind across a time window. */
function spread(kind, count, from, to, eliteEvery = 0) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? from : from + ((to - from) * i) / (count - 1);
    list.push(at(kind, t, eliteEvery > 0 && (i + 1) % eliteEvery === 0));
  }
  return list;
}

/** A cluster of swarm wisps arriving together. */
function swarmCluster(count, seconds) {
  const list = [];
  for (let i = 0; i < count; i += 1) list.push(at('swarm', seconds + i * 0.25));
  return list;
}

const WAVES = [
  null, // waves are 1-based; index 0 is never used
  {
    banner: 'WAVE 1', sub: 'the drifters come',
    spawns: [...spread('drifter', 8, 0.5, 9)],
  },
  {
    banner: 'WAVE 2', sub: 'the dark thickens',
    spawns: [...spread('drifter', 9, 0.5, 11), ...swarmCluster(3, 5), ...swarmCluster(3, 9)],
  },
  {
    banner: 'WAVE 3', sub: 'darters on the wind',
    surge: true,
    spawns: [...spread('drifter', 7, 0.5, 10), ...spread('darter', 6, 2, 12), ...swarmCluster(4, 7)],
  },
  {
    banner: 'WAVE 4', sub: 'spitters keep their distance',
    spawns: [...spread('drifter', 6, 0.5, 10), ...spread('darter', 5, 2, 11), ...spread('spitter', 4, 3, 12), at('drifter', 6, true)],
  },
  {
    banner: 'WAVE 5', sub: 'THE HOLLOW LANTERN',
    boss: 1,
    spawns: [...spread('drifter', 6, 8, 30), ...spread('swarm', 4, 16, 28)],
  },
  {
    banner: 'WAVE 6', sub: 'brutes walk the dark',
    spawns: [...spread('drifter', 8, 0.5, 12), ...spread('darter', 6, 2, 13), ...spread('spitter', 5, 3, 14), ...spread('brute', 2, 6, 10), at('darter', 8, true)],
  },
  {
    banner: 'WAVE 7', sub: 'the swarm descends',
    surge: true,
    spawns: [...spread('darter', 7, 0.5, 12), ...spread('spitter', 6, 2, 13), ...spread('brute', 3, 4, 12), ...swarmCluster(5, 5), ...swarmCluster(5, 10), at('brute', 9, true)],
  },
  {
    banner: 'WAVE 8', sub: 'elites rise',
    spawns: [...spread('drifter', 8, 0.5, 12, 4), ...spread('darter', 7, 1, 13), ...spread('spitter', 6, 2, 14), ...spread('brute', 3, 5, 13), at('spitter', 7, true)],
  },
  {
    banner: 'WAVE 9', sub: 'hold the light',
    spawns: [...spread('drifter', 10, 0.5, 13, 5), ...spread('darter', 8, 1, 14), ...spread('spitter', 7, 2, 15), ...spread('brute', 4, 4, 14), ...swarmCluster(6, 8), at('brute', 10, true)],
  },
  {
    banner: 'WAVE 10', sub: 'THE NIGHT WARDEN',
    boss: 2,
    spawns: [...spread('swarm', 8, 10, 40), ...spread('darter', 6, 14, 38), ...spread('spitter', 4, 20, 36)],
  },
];

/** The definition of wave n (1-based), or null past the last wave. */
export function waveDef(n) {
  if (n < 1 || n > WAVE_COUNT) return null;
  return WAVES[n];
}

/** A fresh copy of a wave's spawn list, earliest first. */
export function waveSpawns(n) {
  const def = waveDef(n);
  if (!def) return [];
  return def.spawns.slice().sort((a, b) => a.at - b.at);
}
