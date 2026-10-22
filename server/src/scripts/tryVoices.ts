// Hear the storyteller voices side by side: `npm run try:voices`
// Writes one MP3 per voice into media/voice-samples/ and prints how to play them.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { narrateCast } from '../ai/voice.js';
import { ensureMediaDir } from '../media.js';

const LINE =
  'Once upon a time, a little hero found a glowing door in the forest. "Wow!" she gasped. "What could be inside?" She pushed it open, and... WHOOSH! A hundred tiny stars flew out!';
const NARRATORS = ['Ruth', 'Danielle', 'Joanna', 'Matthew', 'Salli', 'Stephen', 'Amy', 'Brian', 'Olivia'];

async function main() {
  if (config.mode !== 'aws') throw new Error('Set MODE=aws in server/.env first.');
  await ensureMediaDir();
  const dir = path.join(config.mediaDir, 'voice-samples');
  await fs.mkdir(dir, { recursive: true });
  for (const v of NARRATORS) {
    const r = await narrateCast([{ speaker: 0, voice: v, text: LINE }]);
    if (!r.audioUrl) {
      console.log(`${v.padEnd(9)} failed (see warnings above)`);
      continue;
    }
    const file = path.join(config.mediaDir, path.basename(new URL(r.audioUrl).pathname));
    const out = path.join(dir, `${v}.mp3`);
    await fs.copyFile(file, out);
    console.log(`${v.padEnd(9)} ${out}`);
  }
  console.log(`\nPlay one:   xdg-open ${path.join(dir, 'Ruth.mp3')}\nPick one:   set POLLY_VOICE=<name> in server/.env and restart the server.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
