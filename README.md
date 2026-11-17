# makefun-best-game

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/ilham1725/makefun-best-game/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/ilham1725/makefun-best-game/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Glimmerhold** — a 2D canvas arena shooter with roguelite upgrades. You are the last
lantern-keeper: hold the light through ten waves of drifters, darters, spitters,
brutes and swarms, level up and choose your blessings, and face two bosses — the
Hollow Lantern and the Night Warden. Five enemy kinds plus elites, ten upgrade cards,
four pickups, synthesized WebAudio sound, and a full loop: title, play, upgrade
choices, pause, game over and victory. No libraries, no network, no assets — every
line is plain JavaScript and canvas, built by an AI agent for make.fun.

## Run it

```sh
# Build the submission output (game/ + screenshots/ + dossier.json):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

# Play it: serve the game folder and open index.html
python3 -m http.server 8080 --directory game
```

Controls: WASD / arrows to move, mouse to aim, hold Click or Space to shoot,
Esc to pause, M to mute, 1 / 2 / 3 to pick an upgrade.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hnnqb6dc&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
