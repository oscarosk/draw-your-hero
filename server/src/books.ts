import crypto from 'node:crypto';
import { config } from './config.js';
import { getObject, putObject } from './storage.js';
import type { HeroCard, StoryAct, StoryPage } from './types.js';

// A finished story saved as a little storybook that parents can open on the
// phone, replay, print or share. Books live next to the media files and are
// deleted with them after MEDIA_TTL_HOURS, like everything else a child makes.

export interface Book {
  id: string;
  title: string;
  createdAt: string;
  bedtime?: boolean;
  hero: Pick<HeroCard, 'name' | 'look' | 'personality' | 'imageUrl'>;
  idea: string;
  drawings: { label: string; url: string }[];
  pages: Pick<StoryPage, 'text' | 'setting' | 'variant' | 'mood' | 'weather' | 'props' | 'drawing' | 'audioUrl' | 'heroAction' | 'heroSide'>[];
}

const ID = /^[a-f0-9]{24}$/;

export async function saveBook(input: Omit<Book, 'id' | 'createdAt' | 'pages'> & { acts: StoryAct[] }): Promise<string> {
  const id = crypto.randomBytes(12).toString('hex');
  const book: Book = {
    id,
    createdAt: new Date().toISOString(),
    title: input.title,
    bedtime: input.bedtime,
    hero: input.hero,
    idea: input.idea,
    drawings: input.drawings,
    pages: input.acts.flatMap((a) =>
      a.pages.map((p) => ({
        text: p.text,
        setting: p.setting,
        variant: p.variant,
        mood: p.mood,
        weather: p.weather,
        props: p.props,
        drawing: p.drawing,
        audioUrl: p.audioUrl,
        heroAction: p.heroAction,
        heroSide: p.heroSide,
      })),
    ),
  };
  await putObject(`book-${id}.json`, Buffer.from(JSON.stringify(book)));
  return id;
}

export async function loadBook(id: string): Promise<Book | undefined> {
  if (!ID.test(id)) return undefined;
  try {
    const raw = await getObject(`book-${id}.json`);
    return raw ? (JSON.parse(raw.toString('utf8')) as Book) : undefined;
  } catch {
    return undefined;
  }
}

export const bookUrl = (id: string) => `${config.publicUrl}/book/${id}`;
