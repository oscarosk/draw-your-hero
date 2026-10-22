// Narration player for Fire TV on Vega OS, using the W3C media AudioPlayer
// from @amazon-devices/react-native-w3cmedia (same API as Amazon's
// vega-audio-sample). One player per line keeps state simple and reliable.
import { AudioPlayer } from '@amazon-devices/react-native-w3cmedia';
import type { Narrator } from './narrator';

class VegaNarrator implements Narrator {
  private player: AudioPlayer | null = null;
  private finish: ((ok: boolean) => void) | null = null;
  private token = 0;

  async play(url: string): Promise<boolean> {
    this.stop();
    const token = ++this.token;
    const player = new AudioPlayer();
    this.player = player;
    const result = new Promise<boolean>((resolve) => {
      this.finish = resolve;
    });
    try {
      await player.initialize();
      if (token !== this.token) {
        player.deinitialize().catch(() => undefined);
        return false;
      }
      player.addEventListener('ended', () => this.done(token, true));
      player.addEventListener('error', () => this.done(token, false));
      player.autoplay = false;
      player.src = url;
      player.play();
    } catch (e) {
      console.warn('[narrator.kepler] could not play', e);
      this.done(token, false);
    }
    return result;
  }

  positionMs(): number | undefined {
    try {
      const t = (this.player as unknown as { currentTime?: number } | null)?.currentTime;
      return typeof t === 'number' && Number.isFinite(t) ? t * 1000 : undefined;
    } catch {
      return undefined;
    }
  }

  pause(): void {
    try {
      this.player?.pause();
    } catch {
      // ignore
    }
  }

  resume(): void {
    try {
      this.player?.play();
    } catch {
      // ignore
    }
  }

  stop(): void {
    const player = this.player;
    this.player = null;
    if (player) {
      try {
        player.pause();
      } catch {
        // ignore
      }
      player.deinitialize().catch(() => undefined);
    }
    const f = this.finish;
    this.finish = null;
    f?.(false);
  }

  private done(token: number, ok: boolean): void {
    if (token !== this.token) return;
    const f = this.finish;
    this.finish = null;
    f?.(ok);
  }
}

export const narrator: Narrator = new VegaNarrator();
