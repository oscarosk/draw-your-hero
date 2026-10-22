// Little sound effects on Fire TV (Vega), using a short-lived W3C media
// AudioPlayer per effect, separate from the narration player. If the device
// refuses extra players, effects switch themselves off and narration carries on.
import { AudioPlayer } from '@amazon-devices/react-native-w3cmedia';
import { getServerUrl } from './serverConfig';

export type Sfx = 'sparkle' | 'pop' | 'whoosh' | 'chime' | 'question' | 'tada' | 'boing';

const VOLUME: Record<Sfx, number> = { sparkle: 0.6, pop: 0.45, whoosh: 0.35, chime: 0.5, question: 0.45, tada: 0.6, boing: 0.5 };
const lastPlayed: Partial<Record<Sfx, number>> = {};
let scale = 1;

/** Bedtime mode: softer effects. */
export function setSfxQuiet(quiet: boolean): void {
  scale = quiet ? 0.3 : 1;
}
let active = 0;
let failures = 0;

export function playSfx(name: Sfx): void {
  if (failures >= 3 || active >= 2) return;
  const now = Date.now();
  if (now - (lastPlayed[name] ?? 0) < 150) return;
  lastPlayed[name] = now;
  active++;
  const player = new AudioPlayer();
  let finished = false;
  const done = (ok: boolean) => {
    if (finished) return;
    finished = true;
    active--;
    if (!ok) failures++;
    player.deinitialize().catch(() => undefined);
  };
  (async () => {
    try {
      await player.initialize();
      player.addEventListener('ended', () => done(true));
      player.addEventListener('error', () => done(false));
      try {
        (player as unknown as { volume: number }).volume = VOLUME[name] * scale;
      } catch {
        // volume control is optional
      }
      player.src = `${getServerUrl()}/static/sfx/${name}.mp3`;
      player.play();
      setTimeout(() => done(true), 4000); // safety net
    } catch {
      done(false);
    }
  })();
}
