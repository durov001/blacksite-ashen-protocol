// BLACKSITE: ASHEN PROTOCOL — entry program (Node 22, standard library only).
// Hands the game in: copies game/ and screenshots/ from beside this file into
// /output (or $MAKEFUN_OUTPUT_DIR outside the grader) and writes the dossier
// the judge reads, with the vendored make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Check the handoff with: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's own caps: the text cap shapes the dossier's bytes; the rest refuse
// an entry the scorer would refuse (too many or too large screenshots, game/
// over its file count or byte budget — game/ shares /output's 1000-entry cap
// with screenshots/ and dossier.json). The build is deterministic: two runs
// of this program write the same bytes, as the grader requires.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
