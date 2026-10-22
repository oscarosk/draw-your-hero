// Little sound effects for web (and any platform with HTMLAudioElement).
// Vega uses sfx.kepler.ts, which Metro picks automatically.
import { getServerUrl } from './serverConfig';

export type Sfx = 'sparkle' | 'pop' | 'whoosh' | 'chime' | 'question' | 'tada' | 'boing';

const VOLUME: Record<Sfx, number> = { sparkle: 0.6, pop: 0.45, whoosh: 0.35, chime: 0.5, question: 0.45, tada: 0.6, boing: 0.5 };
const lastPlayed: Partial<Record<Sfx, number>> = {};
let scale = 1;

/** Bedtime mode: softer effects. */
export function setSfxQuiet(quiet: boolean): void {
  scale = quiet ? 0.3 : 1;
}

export function playSfx(name: Sfx): void {
  if (typeof Audio === 'undefined') return;
  const now = Date.now();
  if (now - (lastPlayed[name] ?? 0) < 120) return; // no machine-gun repeats
  lastPlayed[name] = now;
  try {
    const a = new Audio(`${getServerUrl()}/static/sfx/${name}.mp3`);
    a.volume = VOLUME[name] * scale;
    a.play().catch(() => undefined);
  } catch {
    // sound is a nice-to-have
  }
}
