// Windward Air: Island Circuit — the hand-in program (Node 22, standard library only).
//
// What this program does, in order:
//   1. Surveys the entry beside it (game/ and screenshots/) and refuses to hand in
//      anything the scorer's gate would refuse: a missing index.html, a game path
//      over 1000 bytes, more than 993 game files or 48 MiB of game, fewer than 3
//      or more than 4 screenshots, or a screenshot over 256 KiB or not a whole
//      PNG/JPEG. Failing here is cheaper than failing at the gate.
//   2. Copies game/ and screenshots/ into the output directory.
//   3. Writes dossier.json with the vendored make.fun library, byte for byte the
//      summary the judge reads.
//   4. Writes manifest.json: the survey itself (file counts, byte totals, the
//      screenshot dimensions it measured), so a human can see what was handed in.
//
// The game is plain static files: serve game/ with `node serve.ts` and open
// game/index.html in a desktop browser; it plays fully offline.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The gate's caps, mirrored from the competition's scoring reference so the
// survey in step 1 judges the entry by the same numbers the scorer will.
const GATE = {
  textMaxBytes: 163840,
  screenshotsMax: 4,
  screenshotsMin: 3,
  screenshotMaxBytes: 262144,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(reason) {
  throw new Error(`windward-air hand-in refused: ${reason}`);
}

/** Every file under dir, as paths relative to dir, sorted so runs agree byte for byte. */
function listFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(relative(dir, path));
    }
  };
  walk(dir);
  return found;
}

/** The pixel size of a PNG or JPEG, read from its own header bytes; null if neither. */
function imageSize(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) { at += 1; continue; }
      const marker = bytes[at + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { format: 'jpeg', width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      }
      at += 2 + bytes.readUInt16BE(at + 2);
    }
  }
  return null;
}

/** Step 1: survey game/ and screenshots/ and refuse anything the gate would refuse. */
function survey() {
  const gameDir = join(here, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const gameFiles = listFiles(gameDir);
  if (gameFiles.length > GATE.gameMaxFiles) fail(`game/ holds ${gameFiles.length} files, over the ${GATE.gameMaxFiles} cap`);
  let gameBytes = 0;
  for (const name of gameFiles) {
    if (Buffer.byteLength(join('game', name)) > GATE.gamePathMaxBytes) fail(`game path too long: ${name}`);
    gameBytes += statSync(join(gameDir, name)).size;
  }
  if (gameBytes > GATE.gameMaxBytes) fail(`game/ totals ${gameBytes} bytes, over the ${GATE.gameMaxBytes} cap`);

  const shotsDir = join(here, 'screenshots');
  const shotNames = existsSync(shotsDir) ? listFiles(shotsDir) : [];
  if (shotNames.length < GATE.screenshotsMin || shotNames.length > GATE.screenshotsMax) {
    fail(`screenshots/ holds ${shotNames.length} images; the gate wants ${GATE.screenshotsMin} to ${GATE.screenshotsMax}`);
  }
  const shots = shotNames.map((name) => {
    const bytes = readFileSync(join(shotsDir, name));
    if (bytes.length > GATE.screenshotMaxBytes) fail(`screenshot ${name} is ${bytes.length} bytes, over the ${GATE.screenshotMaxBytes} cap`);
    const size = imageSize(bytes);
    if (!size) fail(`screenshot ${name} is not a whole PNG or JPEG`);
    return { name, bytes: bytes.length, ...size };
  });
  return { gameFiles: gameFiles.length, gameBytes, shots };
}

const report = survey();

// Step 2: copy the entry into the output directory.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Step 3: the dossier, written by the vendored library under the gate's caps.
// (Before the manifest, so the dossier's bytes are exactly the library's own.)
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: GATE.textMaxBytes,
    screenshots: { max: GATE.screenshotsMax, max_bytes: GATE.screenshotMaxBytes },
    game_max_files: GATE.gameMaxFiles,
    game_max_bytes: GATE.gameMaxBytes,
    game_path_max_bytes: GATE.gamePathMaxBytes,
  }),
);

// Step 4: the manifest — what was handed in, in the survey's own numbers.
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify({ game: 'Windward Air: Island Circuit', ...report }, null, 2)}\n`);
