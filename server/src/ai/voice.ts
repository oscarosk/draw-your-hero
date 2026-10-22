import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { config } from '../config.js';
import { saveMedia } from '../media.js';

const client = new PollyClient({ region: config.region });

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

const PREFIX = '<speak><prosody rate="92%">';
const SUFFIX = '</prosody></speak>';

export interface Narration {
  audioUrl?: string;
  /** Start time in ms of each word of the spoken text (split on whitespace), for read-along highlighting. */
  wordTimes?: number[];
}

/**
 * Narrates a line with Amazon Polly in the narrator's voice. Returns the MP3 URL
 * plus the start time of every word, so the TV can highlight words as they are
 * read. In demo mode or on failure it returns {} and the TV reads on a timer.
 */
export async function narrateWithMarks(text: string, calm = false): Promise<Narration> {
  if (!text.trim()) return {};
  const r = await narrateCast([{ speaker: 0, voice: config.pollyVoice, text }], calm);
  return { audioUrl: r.audioUrl, wordTimes: r.wordTimes };
}

// ---------------------------------------------------------------------------
// A cast of voices: each line is read by its character's voice, then the
// pieces are joined into one MP3 with one set of read-along timings.
// ---------------------------------------------------------------------------

/** Neural voices the storyteller can cast, with a hint for the model. */
export const VOICES: Record<string, string> = {
  Ivy: 'young girl, bright and curious',
  Kevin: 'young boy, cheerful',
  Justin: 'young boy, excited and quick',
  Joey: 'friendly young man, goofy',
  Salli: 'warm young woman, kind',
  Kimberly: 'bubbly young woman',
  Kendra: 'calm, gentle woman',
  Matthew: 'deep friendly man, like a gentle giant',
  Amy: 'British woman, clever and posh',
  Brian: 'British man, wise old storyteller',
  Emma: 'British woman, soft and dreamy',
  Arthur: 'British man, polite and funny',
  Olivia: 'Australian woman, adventurous',
};

export interface Line {
  /** 0 narrator, 1 hero, 2 other character. */
  speaker: number;
  voice: string;
  text: string;
}

export interface CastNarration extends Narration {
  /** Speaker of every word of the joined text. */
  wordSpeakers?: number[];
}

/**
 * Voices with a generative variant: Polly's most expressive engine, which sounds
 * like a real storyteller (excited, surprised, gentle) instead of reading flatly.
 * Child voices (Ivy, Kevin, Justin) only exist as neural voices.
 */
const GENERATIVE = new Set(['Ruth', 'Danielle', 'Joanna', 'Matthew', 'Salli', 'Stephen', 'Tiffany', 'Amy', 'Brian', 'Olivia', 'Kajal']);
const generativeBroken = new Set<string>();

interface Synth {
  audio?: Buffer;
  marks?: string;
  escaped: string;
  prefix: string;
  /** Marks came from the neural twin of a generative voice: stretch them to fit the audio. */
  stretch?: boolean;
}

async function speak(ssml: string, voice: string, engine: string, format: 'mp3' | 'json'): Promise<Buffer | undefined> {
  const out = await client.send(
    new SynthesizeSpeechCommand({
      Text: ssml,
      TextType: 'ssml',
      VoiceId: voice as never,
      Engine: engine as never,
      OutputFormat: format,
      SampleRate: format === 'mp3' ? '24000' : undefined,
      SpeechMarkTypes: format === 'json' ? ['word'] : undefined,
    }),
  );
  return out.AudioStream ? Buffer.from(await out.AudioStream.transformToByteArray()) : undefined;
}

async function synth(text: string, voice: string, rate: string, calm: boolean): Promise<Synth> {
  const escaped = escapeXml(text);

  if (config.pollyGenerative && GENERATIVE.has(voice) && !generativeBroken.has(voice)) {
    // The generative engine understands only part of SSML: keep it simple.
    const genPrefix = calm ? '<speak><prosody rate="88%">' : '<speak>';
    const genSuffix = calm ? '</prosody></speak>' : '</speak>';
    const markPrefix = '<speak><prosody rate="100%">';
    try {
      const [audio, marks] = await Promise.all([
        speak(genPrefix + escaped + genSuffix, voice, 'generative', 'mp3').catch(async (e) => {
          if (!calm) throw e;
          return speak('<speak>' + escaped + '</speak>', voice, 'generative', 'mp3'); // prosody refused: plain
        }),
        // Generative voices give no speech marks; the neural twin's marks, stretched, are close enough.
        speak(markPrefix + escaped + SUFFIX, voice, 'neural', 'json')
          .then((b) => b?.toString('utf8'))
          .catch(() => undefined),
      ]);
      if (audio) return { audio, marks, escaped, prefix: markPrefix, stretch: true };
    } catch (e) {
      const err = e as Error;
      console.warn(`[polly] generative ${voice} failed, using neural:`, err.message);
      // Remember only real "not available" answers, not a passing hiccup.
      if (/Validation|engine|not support|InvalidSsml/i.test(`${err.name} ${err.message}`)) generativeBroken.add(voice);
    }
  }

  const prefix = `<speak><prosody rate="${rate}">`;
  const ssml = prefix + escaped + SUFFIX;
  const [a, m] = await Promise.allSettled([speak(ssml, voice, config.pollyEngine, 'mp3'), speak(ssml, voice, config.pollyEngine, 'json')]);
  if (a.status === 'rejected') console.warn(`[polly] ${voice} failed:`, (a.reason as Error).message);
  return {
    audio: a.status === 'fulfilled' ? a.value : undefined,
    marks: m.status === 'fulfilled' ? m.value?.toString('utf8') : undefined,
    escaped,
    prefix,
  };
}

/**
 * Reads a page line by line in each character's voice and joins the audio.
 * Falls back to the narrator voice for any line whose voice fails.
 */
export async function narrateCast(lines: Line[], calm = false): Promise<CastNarration> {
  if (config.mode !== 'aws' || !lines.length) return {};
  const parts = await Promise.all(
    lines.map(async (l) => {
      const rate = calm ? (l.speaker === 0 ? '82%" volume="soft' : '90%" volume="soft') : l.speaker === 0 ? '92%' : '100%';
      let r = await synth(l.text, l.voice, rate, calm);
      if (!r.audio && l.voice !== config.pollyVoice) r = await synth(l.text, config.pollyVoice, rate, calm);
      return { ...r, line: l };
    }),
  );
  if (parts.some((p) => !p.audio)) return {};

  const wordTimes: number[] = [];
  const wordSpeakers: number[] = [];
  let offset = 0;
  for (const p of parts) {
    const n = p.line.text.split(/\s+/).filter(Boolean).length;
    const dur = mp3DurationMs(p.audio!);
    let times = (p.marks && alignMarks(p.escaped, p.marks, p.prefix)) || Array.from({ length: n }, (_, i) => (dur * (i + 0.2)) / Math.max(1, n));
    if (p.stretch && p.marks && times.length) {
      // Fit the neural timings onto the (differently paced) generative audio.
      const neuralEnd = times[times.length - 1] + 420;
      const k = dur > 0 ? dur / neuralEnd : 1;
      times = times.map((t) => t * k);
    }
    for (const t of times) wordTimes.push(Math.round(t + offset));
    for (let i = 0; i < n; i++) wordSpeakers.push(p.line.speaker);
    offset += dur;
  }
  try {
    const audioUrl = await saveMedia(Buffer.concat(parts.map((p) => p.audio!)), 'mp3');
    return { audioUrl, wordTimes, wordSpeakers };
  } catch (e) {
    console.warn('[polly] could not save audio:', (e as Error).message);
    return {};
  }
}

/** Length of an MP3 (MPEG-1/2/2.5 layer III), from its frame headers. */
export function mp3DurationMs(buf: Buffer): number {
  const BITRATES = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let i = 0;
  if (buf.slice(0, 3).toString('latin1') === 'ID3') i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  let ms = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const ver = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3;
    const bi = (buf[i + 2] >> 4) & 15;
    const si = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) {
      i++;
      continue;
    }
    const rate = RATES[ver][si];
    const kbps = (ver === 3 ? BITRATES[1] : BITRATES[2])[bi];
    const samples = ver === 3 ? 1152 : 576;
    const len = Math.floor(((samples / 8) * kbps * 1000) / rate) + pad;
    if (len < 4) break;
    ms += (samples / rate) * 1000;
    i += len;
  }
  return ms;
}

/** Kept for callers that only need audio. */
export async function narrate(text: string): Promise<string | undefined> {
  return (await narrateWithMarks(text)).audioUrl;
}

/**
 * Maps Polly word marks (byte offsets into the SSML) onto the words of the text.
 * Escaping never adds whitespace, so the words of the escaped text line up 1:1
 * with the words of the original text.
 */
export function alignMarks(escaped: string, raw: string, prefix = PREFIX): number[] | undefined {
  const tokens: { start: number; end: number }[] = [];
  const re = /\S+/g;
  const prefixBytes = Buffer.byteLength(prefix);
  let m: RegExpExecArray | null;
  while ((m = re.exec(escaped))) {
    const start = prefixBytes + Buffer.byteLength(escaped.slice(0, m.index));
    tokens.push({ start, end: start + Buffer.byteLength(m[0]) });
  }
  if (!tokens.length) return undefined;

  const times: (number | undefined)[] = new Array(tokens.length).fill(undefined);
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const mark = JSON.parse(line) as { time: number; type: string; start: number; end: number };
    if (mark.type !== 'word') continue;
    const i = tokens.findIndex((t) => mark.start >= t.start && mark.start < t.end);
    if (i >= 0 && times[i] === undefined) times[i] = mark.time;
  }

  // Fill gaps (punctuation-only tokens, etc.) from their neighbours.
  if (times[0] === undefined) times[0] = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i] !== undefined) continue;
    let j = i + 1;
    while (j < times.length && times[j] === undefined) j++;
    const prev = times[i - 1]!;
    const next = j < times.length ? times[j]! : prev + 400 * (j - i + 1);
    for (let k = i; k < j; k++) times[k] = Math.round(prev + ((next - prev) * (k - i + 1)) / (j - i + 1));
    i = j - 1;
  }
  return times as number[];
}
