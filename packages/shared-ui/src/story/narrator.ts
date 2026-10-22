// Narration player for web (and any platform with HTMLAudioElement).
// Vega uses narrator.kepler.ts, which Metro picks automatically.

export interface Narrator {
  /** Plays a line; resolves true when it finished, false if it couldn't play. */
  play(url: string): Promise<boolean>;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Milliseconds into the current line, or undefined if nothing is playing. */
  positionMs(): number | undefined;
}

class WebNarrator implements Narrator {
  private audio: HTMLAudioElement | null = null;
  private finish: ((ok: boolean) => void) | null = null;

  play(url: string): Promise<boolean> {
    this.stop();
    if (typeof Audio === 'undefined') return Promise.resolve(false);
    return new Promise((resolve) => {
      const audio = new Audio(url);
      this.audio = audio;
      this.finish = resolve;
      audio.onended = () => this.done(true);
      audio.onerror = () => this.done(false);
      audio.play().catch(() => this.done(false));
    });
  }

  pause(): void {
    this.audio?.pause();
  }

  positionMs(): number | undefined {
    return this.audio ? this.audio.currentTime * 1000 : undefined;
  }

  resume(): void {
    this.audio?.play().catch(() => this.done(false));
  }

  stop(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    this.done(false);
  }

  private done(ok: boolean): void {
    const f = this.finish;
    this.finish = null;
    f?.(ok);
  }
}

export const narrator: Narrator = new WebNarrator();
