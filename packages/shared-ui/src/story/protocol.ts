// Copy of server/src/types.ts: the protocol between the story service and the TV.
// Keep the two files in sync.

export const SETTINGS = [
  'meadow',
  'forest',
  'jungle',
  'ocean',
  'underwater',
  'beach',
  'sky',
  'space',
  'night',
  'castle',
  'desert',
  'snow',
  'city',
  'cave',
  'volcano',
] as const;
export type Setting = (typeof SETTINGS)[number];

export const MOODS = ['morning', 'day', 'sunset', 'night'] as const;
export type Mood = (typeof MOODS)[number];

export const WEATHERS = ['clear', 'rain', 'snow', 'fog', 'stars', 'sparkles', 'leaves', 'bubbles'] as const;
export type Weather = (typeof WEATHERS)[number];

export const HERO_ACTIONS = ['walk', 'jump', 'fly', 'swim', 'dance', 'wave', 'sleep'] as const;
export type HeroAction = (typeof HERO_ACTIONS)[number];

export interface HeroCard {
  name: string;
  /** Short, kind description of what the child drew, e.g. "a purple dragon with tiny wings". */
  look: string;
  personality: string;
  imageUrl: string;
  /** Pronoun the story uses; kept neutral by default. */
  pronoun: 'they' | 'she' | 'he' | 'it';
  /** Three adventure ideas invented for this particular drawing. */
  ideas?: string[];
  /** Amazon Polly voice the AI cast for this hero. */
  voice?: string;
  /** The original photo of the paper, and where the drawing sits in it ([x, y, w, h], 0..1), for the reveal. */
  photoUrl?: string;
  photoCrop?: [number, number, number, number];
  /** Width / height of the photo. */
  photoAspect?: number;
  /** Set when this drawing has been on an adventure before. */
  returning?: { episode: number; lastTitle?: string; friends?: string[]; drawn?: string[] };
}

export interface StoryPage {
  text: string;
  setting: Setting;
  /** Short visual description of the background, used for image generation. */
  scene: string;
  heroAction: HeroAction;
  heroSide: 'left' | 'center' | 'right';
  /** Time of day: recolours the painted scene. */
  mood?: Mood;
  /** Weather or magic drifting through the scene. */
  weather?: Weather;
  /** Up to two story objects shown in the scene, as emoji (e.g. a cake, a door). */
  props?: string[];
  /** Which painting of the setting to use (0-2). */
  variant?: number;
  /** A drawing the child made during the story (e.g. the key they drew), shown in the scene. */
  drawing?: string;
  /** 'friend': the drawing is a character who walks and talks beside the hero. */
  drawingRole?: 'friend' | 'thing';
  /** Who speaks each word of `text`: 0 narrator, 1 the hero, 2 another character. */
  wordSpeakers?: number[];
  imageUrl?: string;
  audioUrl?: string;
  /** Start time (ms) of each word of `text`, for read-along highlighting. */
  wordTimes?: number[];
}

export interface StoryQuestion {
  /** Spoken and shown on the TV, e.g. "What does Blaze find inside the cave?" */
  prompt: string;
  /** Two short suggestions the remote can pick; the child can also say anything. */
  options: [string, string];
  /** 'draw' asks the child to draw something on paper and photograph it. */
  kind?: 'say' | 'draw';
  /** What to draw, e.g. "a key". */
  drawWhat?: string;
  /** Drawing a friend (who will talk) or a thing. */
  drawRole?: 'friend' | 'thing';
  audioUrl?: string;
  wordTimes?: number[];
}

export interface StoryAct {
  index: number; // 0, 1, 2
  title?: string;
  pages: StoryPage[];
  question?: StoryQuestion;
  final: boolean;
}

export type Stage = 'waiting-phone' | 'need-drawing' | 'reading-drawing' | 'need-idea' | 'telling' | 'question' | 'done' | 'error';

// ---- Messages server -> TV ----
export type ToTv =
  | { t: 'room'; code: string; joinUrl: string; qrUrl: string; mode: 'aws' | 'demo' }
  | { t: 'phone'; connected: boolean }
  | { t: 'stage'; stage: Stage; message?: string }
  | { t: 'hero'; hero: HeroCard; greeting: { text: string; audioUrl?: string; wordTimes?: number[] } }
  | { t: 'act_start'; index: number; title?: string; pageCount: number }
  | { t: 'page'; act: number; index: number; page: StoryPage }
  | { t: 'act_end'; act: number; question?: StoryQuestion; final: boolean }
  | { t: 'heard'; text: string; from: 'phone' | 'tv' }
  | { t: 'prop'; imageUrl: string; label: string; role?: 'friend' | 'thing'; name?: string }
  | { t: 'mode'; bedtime: boolean }
  | { t: 'story_saved'; storyId: string }
  | { t: 'error'; message: string };

// ---- Messages TV -> server ----
export type FromTv =
  | { t: 'idea'; text: string; bedtime?: boolean }
  | { t: 'answer'; text: string }
  | { t: 'demo' }
  | { t: 'again' } // new story, same hero
  | { t: 'reset' } // new hero
  | { t: 'reached'; what: 'question' | 'end' } // TV finished the pages of an act
  | { t: 'ping' };

// ---- Messages server -> phone ----
export type ToPhone =
  | {
      t: 'state';
      stage: Stage;
      heroName?: string;
      heroImageUrl?: string;
      question?: StoryQuestion;
      ideaSuggestions?: string[];
      /** Link to the finished storybook (stage 'done'). */
      bookUrl?: string;
      bedtime?: boolean;
      message?: string;
    }
  | { t: 'error'; message: string };

// ---- Messages phone -> server ----
export type FromPhone = { t: 'idea'; text: string; bedtime?: boolean } | { t: 'answer'; text: string } | { t: 'ping' };
