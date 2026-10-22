import fs from 'node:fs/promises';
import path from 'node:path';
import type { WebSocket } from 'ws';
import { config } from './config.js';
import { saveMedia } from './media.js';
import { describeHero, describeProp, writeAct, pickFlavor, GuardrailError, type StagedPage, type StorySoFar } from './ai/bedrock.js';
import { paintScene } from './ai/images.js';
import { narrateCast, narrateWithMarks, type Line } from './ai/voice.js';
import { demoAct, DEMO_FRIEND_NAMES, DEMO_HERO, IDEA_SUGGESTIONS, randomIdeas } from './ai/demo.js';
import { cleanChildText } from './ai/safety.js';
import { bookUrl, saveBook } from './books.js';
import { recallHero, rememberStory } from './heroes.js';
import { metric } from './metrics.js';
import type { FromPhone, FromTv, HeroCard, Stage, StoryAct, ToPhone, ToTv } from './types.js';

interface Room {
  code: string;
  tv: WebSocket | null;
  phones: Set<WebSocket>;
  stage: Stage;
  hero?: HeroCard;
  story?: StorySoFar & { seed: number };
  /** Incremented on every reset so stale async work stops sending. */
  generation: number;
  /** Stage to enter once the TV has finished playing the current act. */
  awaiting?: Stage;
  /** The finished storybook, once the story ends. */
  bookId?: string;
  bedtime?: boolean;
  /** Silhouette fingerprint of the hero drawing, for remembering heroes. */
  heroFp?: string;
  lastActive: number;
}

const rooms = new Map<string, Room>();
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const HERO_NAMES = ['Pip', 'Blaze', 'Captain Wiggles', 'Momo', 'Sir Sparkle', 'Bibi', 'Zoom'];

let storiesToday = 0;
let storiesDay = new Date().toDateString();

function newCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function send(ws: WebSocket | null | undefined, msg: unknown): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function toTv(room: Room, msg: ToTv): void {
  send(room.tv, msg);
}

function toPhones(room: Room, msg: ToPhone): void {
  for (const p of room.phones) send(p, msg);
}

function setStage(room: Room, stage: Stage, message?: string): void {
  room.stage = stage;
  room.lastActive = Date.now();
  toTv(room, { t: 'stage', stage, message });
  syncPhones(room, message);
}

function syncPhones(room: Room, message?: string): void {
  const lastAct = room.story?.acts[room.story.acts.length - 1];
  toPhones(room, {
    t: 'state',
    stage: room.stage,
    heroName: room.hero?.name,
    heroImageUrl: room.hero?.imageUrl,
    question: room.stage === 'question' ? lastAct?.question : undefined,
    ideaSuggestions: room.stage === 'need-idea' ? room.hero?.ideas ?? IDEA_SUGGESTIONS : undefined,
    bookUrl: room.stage === 'done' && room.bookId ? bookUrl(room.bookId) : undefined,
    bedtime: room.bedtime,
    message,
  });
}

function aiAllowed(): boolean {
  const today = new Date().toDateString();
  if (today !== storiesDay) {
    storiesDay = today;
    storiesToday = 0;
  }
  return config.mode === 'aws' && storiesToday < config.maxStoriesPerDay;
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export function attachTv(ws: WebSocket, existingCode?: string): void {
  const wanted = existingCode?.toUpperCase();
  let room = wanted ? rooms.get(wanted) : undefined;
  if (!room) {
    // After a server restart the TV comes back with its old code: keep it, so
    // the phone (which still has that code) reconnects to the same room.
    const code = wanted && /^[A-Z]{4}$/.test(wanted) ? wanted : newCode();
    room = { code, tv: null, phones: new Set(), stage: 'waiting-phone', generation: 0, lastActive: Date.now() };
    rooms.set(room.code, room);
  }
  const r = room;
  r.tv = ws;
  r.lastActive = Date.now();
  send(ws, {
    t: 'room',
    code: r.code,
    joinUrl: `${config.publicUrl}/p/${r.code}`,
    qrUrl: `${config.publicUrl}/qr/${r.code}.png`,
    mode: config.mode,
  } satisfies ToTv);
  send(ws, { t: 'phone', connected: r.phones.size > 0 } satisfies ToTv);
  send(ws, { t: 'stage', stage: r.stage } satisfies ToTv);

  ws.on('message', (data) => {
    let msg: FromTv;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    handleTv(r, msg).catch((e) => console.error('[tv]', e));
  });
  ws.on('close', () => {
    if (r.tv === ws) r.tv = null;
  });
}

export function attachPhone(ws: WebSocket, code: string): boolean {
  const room = rooms.get(code.toUpperCase());
  if (!room) return false;
  room.phones.add(ws);
  room.lastActive = Date.now();
  if (room.stage === 'waiting-phone') setStage(room, 'need-drawing');
  else syncPhones(room);
  toTv(room, { t: 'phone', connected: true });

  ws.on('message', (data) => {
    let msg: FromPhone;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    handlePhone(room, msg).catch((e) => console.error('[phone]', e));
  });
  ws.on('close', () => {
    room.phones.delete(ws);
    toTv(room, { t: 'phone', connected: room.phones.size > 0 });
  });
  return true;
}

export function roomExists(code: string): boolean {
  return rooms.has(code.toUpperCase());
}

/** Rooms idle for 3 hours are removed. */
export function startRoomCleanup(): void {
  setInterval(
    () => {
      const cutoff = Date.now() - 3 * 3600 * 1000;
      for (const [code, room] of rooms) {
        if (room.lastActive < cutoff && !room.tv && room.phones.size === 0) rooms.delete(code);
      }
    },
    10 * 60 * 1000,
  ).unref();
}

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

async function handleTv(room: Room, msg: FromTv): Promise<void> {
  switch (msg.t) {
    case 'ping':
      return;
    case 'reached':
      if (room.awaiting) {
        const next = room.awaiting;
        room.awaiting = undefined;
        setStage(room, next);
      }
      return;
    case 'demo':
      return useDemoDrawing(room);
    case 'idea':
      if (room.stage === 'need-idea') return startStory(room, msg.text, 'tv', msg.bedtime);
      return;
    case 'answer':
      if (room.stage === 'question') return answer(room, msg.text, 'tv');
      return;
    case 'again':
      if (room.hero) {
        room.generation++;
        room.awaiting = undefined;
        room.story = undefined;
        setStage(room, 'need-idea');
      }
      return;
    case 'reset':
      room.generation++;
      room.awaiting = undefined;
      room.story = undefined;
      room.hero = undefined;
      setStage(room, room.phones.size > 0 ? 'need-drawing' : 'waiting-phone');
      return;
  }
}

async function handlePhone(room: Room, msg: FromPhone): Promise<void> {
  switch (msg.t) {
    case 'ping':
      return;
    case 'idea':
      if (room.stage === 'need-idea') return startStory(room, msg.text, 'phone', msg.bedtime);
      return;
    case 'answer':
      if (room.stage === 'question') return answer(room, msg.text, 'phone');
      return;
  }
}

// ---------------------------------------------------------------------------
// Drawing -> hero
// ---------------------------------------------------------------------------

export async function receiveDrawing(code: string, png: Buffer, fingerprint?: string, paper?: { photo: Buffer; crop: [number, number, number, number]; aspect: number }): Promise<void> {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new Error('Room not found');
  // Mid-story "draw it!" question: the drawing becomes part of the story.
  const asking = room.story?.acts[room.story.acts.length - 1]?.question;
  if (room.stage === 'question' && asking?.kind === 'draw' && room.story) return drawIntoStory(room, png, asking.drawWhat || 'something', asking.drawRole ?? 'thing');
  if (room.stage === 'reading-drawing' || room.stage === 'telling') throw new Error('Busy, try again in a moment');
  room.generation++;
  room.awaiting = undefined;
  room.story = undefined;
  const gen = room.generation;
  setStage(room, 'reading-drawing');
  const imageUrl = await saveMedia(png, 'png');
  room.heroFp = fingerprint && /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : undefined;
  const paperInfo = paper ? { photoUrl: await saveMedia(paper.photo, 'jpg'), photoCrop: paper.crop, photoAspect: paper.aspect } : undefined;
  await makeHero(room, gen, png, imageUrl, false, paperInfo);
}

async function useDemoDrawing(room: Room): Promise<void> {
  if (room.stage === 'reading-drawing' || room.stage === 'telling') return;
  room.generation++;
  room.awaiting = undefined;
  room.story = undefined;
  const gen = room.generation;
  setStage(room, 'reading-drawing');
  const png = await fs.readFile(path.join(config.assetsDir, 'demo-hero.png'));
  room.heroFp = 'demo';
  await makeHero(room, gen, png, `${config.publicUrl}/static/demo-hero.png`, true);
}

async function makeHero(
  room: Room,
  gen: number,
  png: Buffer,
  imageUrl: string,
  isDemoDrawing = false,
  paper?: Pick<HeroCard, 'photoUrl' | 'photoCrop' | 'photoAspect'>,
): Promise<void> {
  let card: Omit<HeroCard, 'imageUrl'>;
  const memory = await recallHero(room.heroFp).catch((e) => {
    console.warn('[heroes] recall failed:', (e as Error).message);
    return undefined;
  });
  if (memory) {
    // Same drawing as before: same name, same voice, and it remembers.
    card = {
      ...memory.card,
      returning: { episode: memory.titles.length + 1, lastTitle: memory.titles[memory.titles.length - 1], friends: memory.friends, drawn: memory.drawn },
    };
  } else if (aiAllowed()) {
    try {
      card = await describeHero(png);
      metric('HeroesDrawn');
    } catch (e) {
      console.warn('[hero] describe failed, using fallback:', (e as Error).message);
      metric('HeroFallbacks');
      card = isDemoDrawing ? DEMO_HERO : { ...DEMO_HERO, name: pickName(), look: 'a one-of-a-kind hero, drawn with love' };
    }
  } else {
    card = isDemoDrawing ? DEMO_HERO : { ...DEMO_HERO, name: pickName(), look: 'a one-of-a-kind hero, drawn with love' };
  }
  if (gen !== room.generation) return;

  const ideas = card.ideas && card.ideas.length >= 3 ? card.ideas : randomIdeas(3);
  const hero: HeroCard = { ...card, ideas, imageUrl, ...paper };
  room.hero = hero;
  const back = hero.returning;
  const greetingText = back
    ? `Look who's back! It's ${hero.name}!${back.lastTitle ? ` Last time was ${back.lastTitle}` : ''}${back.friends?.length ? `, with ${back.friends[back.friends.length - 1]}` : ''}. What should ${hero.name} do today?`
    : `Wow! Meet ${hero.name}, ${hero.look}! Where should ${hero.name}'s adventure begin? Tell me your idea!`;
  const voice = await narrateWithMarks(greetingText);
  if (gen !== room.generation) return;
  toTv(room, { t: 'hero', hero, greeting: { text: greetingText, ...voice } });
  setStage(room, 'need-idea');
}

function pickName(): string {
  return HERO_NAMES[Math.floor(Math.random() * HERO_NAMES.length)];
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

async function startStory(room: Room, rawIdea: string, from: 'tv' | 'phone', bedtime?: boolean): Promise<void> {
  if (!room.hero) return;
  room.bedtime = !!bedtime;
  room.bookId = undefined;
  toTv(room, { t: 'mode', bedtime: room.bedtime });
  const idea = cleanChildText(rawIdea, room.hero.ideas?.[0] ?? IDEA_SUGGESTIONS[0]).text;
  toTv(room, { t: 'heard', text: idea, from });
  if (aiAllowed()) storiesToday++;
  metric('StoriesStarted');
  room.story = {
    hero: room.hero,
    idea,
    acts: [],
    answers: [],
    flavor: pickFlavor(),
    // STORY_DRAW=friend|thing pins the "draw it" moment (handy when recording a demo).
    drawAct: process.env.STORY_DRAW === 'friend' ? 1 : process.env.STORY_DRAW === 'thing' ? 0 : Math.random() < 0.5 ? 0 : 1,
    drawKind: process.env.STORY_DRAW === 'thing' ? 'thing' : process.env.STORY_DRAW === 'friend' ? 'friend' : Math.random() < 0.7 ? 'friend' : 'thing',
    bedtime: room.bedtime,
    drawings: [],
    seed: Math.floor(Math.random() * 100000),
  };
  await tellAct(room, 0);
}

async function drawIntoStory(room: Room, png: Buffer, asked: string, role: 'friend' | 'thing'): Promise<void> {
  const story = room.story!;
  const gen = room.generation;
  setStage(room, 'telling', 'Adding your drawing to the story…');
  const url = await saveMedia(png, 'png');
  const friendName =
    role === 'friend'
      ? story.plan?.friend?.name ?? (config.mode === 'aws' && asked.length < 24 && !/^an? friend$/i.test(asked) ? asked : DEMO_FRIEND_NAMES[Math.floor(Math.random() * DEMO_FRIEND_NAMES.length)])
      : undefined;
  let label = role === 'friend' ? 'a wonderful new friend' : asked;
  if (config.mode === 'aws') {
    try {
      label = await describeProp(png, role === 'friend' ? `${friendName}, a friendly character` : asked);
    } catch (e) {
      console.warn('[prop] describe failed:', (e as Error).message);
    }
  }
  if (gen !== room.generation) return;
  story.drawings = [...(story.drawings ?? []), { label, url, role }];
  story.lastDrawingAct = story.acts.length - 1;
  toTv(room, { t: 'prop', imageUrl: url, label, role, name: friendName });
  toTv(room, { t: 'heard', text: role === 'friend' ? `Say hi to ${friendName}!` : `You drew ${label}!`, from: 'phone' });
  story.answers.push(role === 'friend' ? `${friendName} looks like ${label} (the child drew them)` : `${label} (the child drew it)`);
  await tellAct(room, story.acts.length);
}

async function answer(room: Room, rawAnswer: string, from: 'tv' | 'phone'): Promise<void> {
  if (!room.story) return;
  const act = room.story.acts[room.story.acts.length - 1];
  const fallback = act?.question?.options[0] ?? 'a big surprise';
  const text = cleanChildText(rawAnswer, fallback).text;
  toTv(room, { t: 'heard', text, from });
  room.story.answers.push(text);
  await tellAct(room, room.story.acts.length);
}

async function tellAct(room: Room, index: number): Promise<void> {
  const story = room.story;
  if (!story) return;
  const gen = room.generation;
  setStage(room, 'telling');

  let act: StoryAct;
  if (config.mode === 'aws') {
    const t0 = Date.now();
    try {
      act = await writeAct(story, index);
      metric('ActWriteSeconds', (Date.now() - t0) / 1000, 'Seconds');
    } catch (e) {
      const reason = e instanceof GuardrailError ? 'guardrail' : (e as Error).message;
      console.warn(`[story] act ${index} fell back to the built-in story (${reason})`);
      metric(e instanceof GuardrailError ? 'GuardrailBlocks' : 'StoryFallbacks');
      act = demoAct(story, index);
    }
  } else {
    act = demoAct(story, index);
  }
  if (gen !== room.generation) return;
  story.acts.push(act);

  toTv(room, { t: 'act_start', index, title: act.title, pageCount: act.pages.length });

  // Paint and narrate every page in parallel, but deliver them in order so the
  // TV can start playing page 1 while later pages are still being painted.
  // Bedtime: the sky goes from sunset to a starry night as the story goes on.
  if (story.bedtime) {
    for (const p of act.pages) {
      p.mood = index === 0 ? (p.mood === 'night' ? 'night' : 'sunset') : 'night';
      if (!p.weather || p.weather === 'rain' || p.weather === 'clear') p.weather = 'stars';
    }
  }

  // In demo mode the child's drawing shows on the first pages after they drew it.
  const latest = story.drawings?.[story.drawings.length - 1];
  if (latest && story.lastDrawingAct === index - 1 && !act.pages.some((p) => p.drawing)) {
    (latest.role === 'friend' ? act.pages : act.pages.slice(0, 2)).forEach((p) => {
      p.drawing = latest.url;
      p.drawingRole = latest.role ?? 'thing';
    });
  }
  // A drawn friend stays in every later scene too.
  if (latest?.role === 'friend' && (story.lastDrawingAct ?? 99) < index) {
    act.pages.forEach((p) => {
      p.drawing = latest.url;
      p.drawingRole = 'friend';
    });
  }

  const voiceOf = (speaker: number) => (speaker === 1 ? story.hero.voice || 'Kevin' : speaker === 2 ? story.plan?.friend?.voice || 'Joey' : config.pollyVoice);
  const ready = act.pages.map(async (page, i) => {
    // The first page also reads the act's title; its words are trimmed off the
    // read-along timings so they line up with the page text.
    const lead = i === 0 && act.title ? `${act.title}.` : '';
    const staged = (page as Partial<StagedPage>).lines;
    const speak = staged?.length
      ? narrateCast(
          [
          ...(lead ? [{ speaker: 0, voice: config.pollyVoice, text: lead }] : []),
          ...staged.map((l): Line => ({ speaker: l.speaker, voice: voiceOf(l.speaker), text: l.speaker ? `“${l.text}”` : l.text })),
          ],
          story.bedtime,
        )
      : narrateWithMarks(lead ? `${lead} ${page.text}` : page.text, story.bedtime);
    const [imageUrl, voice] = await Promise.all([paintScene(page.scene, story.seed + i), speak]);
    const skip = lead ? lead.split(/\s+/).length : 0;
    delete (page as Partial<StagedPage>).lines;
    // Each story gets its own painting of each place (3 per setting).
    const variant = [...page.setting].reduce((a, c) => a + c.charCodeAt(0), story.seed) % 3;
    const wordSpeakers = (voice as { wordSpeakers?: number[] }).wordSpeakers?.slice(skip);
    return { ...page, variant, imageUrl, audioUrl: voice.audioUrl, wordTimes: voice.wordTimes?.slice(skip), wordSpeakers };
  });
  const questionVoice = act.question ? narrateWithMarks(act.question.prompt) : Promise.resolve(undefined);

  for (let i = 0; i < ready.length; i++) {
    const page = await ready[i];
    act.pages[i] = page;
    if (gen !== room.generation) return;
    toTv(room, { t: 'page', act: index, index: i, page });
  }

  if (act.question) {
    const v = await questionVoice;
    act.question.audioUrl = v?.audioUrl;
    act.question.wordTimes = v?.wordTimes;
  }
  if (gen !== room.generation) return;
  toTv(room, { t: 'act_end', act: index, question: act.question, final: act.final });
  // The phone shows the question only once the TV has finished reading the
  // pages aloud, so the child isn't asked before they've heard the story.
  if (act.final) {
    metric('StoriesFinished');
    try {
      room.bookId = await saveBook({
        title: story.acts[0]?.title || `${story.hero.name}'s Adventure`,
        bedtime: story.bedtime,
        hero: { name: story.hero.name, look: story.hero.look, personality: story.hero.personality, imageUrl: room.hero?.imageUrl ?? '' },
        idea: story.idea,
        drawings: story.drawings ?? [],
        acts: story.acts,
      });
      if (gen === room.generation) toTv(room, { t: 'story_saved', storyId: room.bookId });
      const { returning: _r, imageUrl: _i, photoUrl: _p, photoCrop: _c, photoAspect: _a, ...card } = room.hero ?? ({} as HeroCard);
      if (room.hero) await rememberStory(room.heroFp, card, { title: story.acts[0]?.title, friend: story.plan?.friend?.name, drawn: story.drawings?.map((d) => d.label) });
    } catch (e) {
      console.warn('[book] could not save:', (e as Error).message);
    }
  }
  const next: Stage = act.final ? 'done' : 'question';
  if (room.tv) room.awaiting = next;
  else setStage(room, next);
}
