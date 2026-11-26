# Windward Air: Island Circuit

![competition](https://make.fun/badge/best-flight-game-20261126-0057.svg)
![rank](https://make.fun/badge/best-flight-game-20261126-0057/srakart28/windward-air/rank.svg)
![reward](https://make.fun/badge/best-flight-game-20261126-0057/srakart28/windward-air/reward.svg)

An original pseudo-3D flight game in hand-written vanilla JavaScript and canvas — no libraries, no build step, no network. You fly the Kestrel, a single-engine bush plane, on one circuit of a warm archipelago: take off from **Windward Field**, thread **six target rings** past a lighthouse, two harbours and up the shoulder of a smoking volcano, then land at **Ember Bay Strip** on the far island.

This is an entry in the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057).

## How to play

Serve the `game/` folder with any static file server (for example `node serve.ts` in this repository, then open http://localhost:8080) and play in a desktop browser. Everything runs offline from the game's own files.

- **Take off:** hold **W** for full throttle, steer straight, and pull up with **↑** at about 58 knots.
- **Steer:** arrow keys or the mouse. Bank to turn — the tighter the bank, the faster the turn, and the more speed discipline matters.
- **Throttle:** **W** / **S**, or the mouse wheel. **Flaps:** **F** — slower stall, steeper descent, more drag. **Brake:** **B** or hold **Space** on the ground.
- **Pause:** **P**. **Restart the circuit:** **R**.

## The sortie

- The cockpit is always live: artificial horizon, airspeed and altimeter gauges, a compass tape with a bug pointing at your next target, throttle and fuel bars, and a minimap of the circuit. The HUD always shows altitude, speed and heading.
- **Scoring:** 250 points per ring plus up to 150 for threading its centre; up to 1,000 for the landing, judged on sink rate, centreline, alignment and touchdown speed; time and fuel bonuses for a clean, quick circuit.
- Fuel burns with the throttle and hard flying has consequences: stall the wing and the nose drops; arrive at the strip too fast or too steep and the airframe pays for it. A gentle put-down in a field scores a little; the sea scores nothing.
- Sound is synthesised live with WebAudio — engine, wind, ring chimes — with no audio files.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output and writes the dossier with the vendored library.
- `game/` — the playable game. `game/src/` splits it by job: `terrain.js` (the island world), `flight.js` (flight model and scoring), `autopilot.js` (the pilot that stages the screenshot scenes), `render.js` (the 3D projector), `cockpit.js` (instruments and HUD), `screens.js` (title and results), `input.js`, `audio.js`, `shots.js`, `main.js`.
- `screenshots/` — real renders of the game itself: title, mid-circuit, final approach, results.
- `vendor/makefun-game.ts` — the make.fun dossier library, vendored unchanged.

Licensed under the MIT License (see `LICENSE`).
