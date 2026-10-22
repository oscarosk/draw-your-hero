import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';
import {
  HERO_ACTIONS,
  MOODS,
  SETTINGS,
  WEATHERS,
  type Mood,
  type Weather,
  type HeroAction,
  type HeroCard,
  type Setting,
  type StoryAct,
  type StoryPage,
  type StoryQuestion,
} from '../types.js';
import { isStoryTextSafe } from './safety.js';
import { VOICES } from './voice.js';

const client = new BedrockRuntimeClient({ region: config.region });

const STORYTELLER_SYSTEM = `You are a warm, playful storyteller who makes up picture-book stories together with a young child (ages 4 to 9).
Rules you always follow:
- Gentle, kind, funny and safe. No violence, weapons, injury, death, romance, scary or sad endings, brands, or real people.
- Simple words a 5-year-old knows. Short sentences.
- The child is your co-author: when they give an idea or answer, it becomes a real, important part of the story, using their own words where you can.
- Never mention that a drawing was imperfect. Every drawing is wonderful.
- Never use names of famous characters, brands or franchises, even if the child mentions them; use original names and descriptions instead.
- Reply with JSON only. No markdown, no commentary.`;

function extractJson<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(start, end + 1)) as T;
}

async function converse(messages: Message[], maxTokens: number, temperature = 0.8): Promise<string> {
  const command = new ConverseCommand({
    modelId: config.textModelId,
    system: [{ text: STORYTELLER_SYSTEM }],
    messages,
    inferenceConfig: { maxTokens, temperature, topP: 0.9 },
    ...(config.guardrailId
      ? {
          guardrailConfig: {
            guardrailIdentifier: config.guardrailId,
            guardrailVersion: config.guardrailVersion,
            trace: 'disabled' as const,
          },
        }
      : {}),
  });
  const res = await client.send(command);
  if (res.stopReason === 'guardrail_intervened') {
    throw new GuardrailError('Guardrail intervened');
  }
  const blocks = res.output?.message?.content ?? [];
  const text = blocks.map((b) => ('text' in b ? b.text : '')).join('');
  if (!text) throw new Error('Empty model output');
  return text;
}

export class GuardrailError extends Error {}

/**
 * Selective guarding: Amazon Bedrock Guardrails check only the blocks marked
 * as guardContent (what the child said) plus everything the model writes back,
 * not our own storyteller instructions, which mention the very things the
 * story must avoid.
 */
function guarded(texts: string[]): ContentBlock[] {
  if (!config.guardrailId) return [];
  return texts.filter((t) => t && t.trim()).map((t) => ({ guardContent: { text: { text: t } } }) as ContentBlock);
}

/** Retries once on malformed JSON, which small models produce occasionally. */
async function converseJson<T>(messages: Message[], maxTokens: number, validate: (v: T) => T): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await converse(messages, maxTokens, attempt === 0 ? 0.8 : 0.5);
      return validate(extractJson<T>(text));
    } catch (e) {
      if (e instanceof GuardrailError) throw e;
      lastErr = e;
      console.warn(`[bedrock] attempt ${attempt + 1} failed:`, (e as Error).message);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 1. Read the drawing
// ---------------------------------------------------------------------------

interface RawHero {
  name?: string;
  look?: string;
  personality?: string;
  pronoun?: string;
  ideas?: string[];
  voice?: string;
}

export async function describeHero(png: Buffer): Promise<Omit<HeroCard, 'imageUrl'>> {
  const content: ContentBlock[] = [
    { image: { format: 'png', source: { bytes: png } } },
    {
      text: `This is a drawing a young child just made on paper, cut out from the page. It will be the hero of a story.
Describe what the child drew, kindly and simply. If it is hard to tell, imagine a friendly creature that matches its colours and shapes.
If it looks like a person, call them "a brave kid" or similar; never guess who a real person is.
If it looks like a famous cartoon, game, movie or brand character, do NOT name that character or brand anywhere: describe it only by its look (e.g. "a round green monster with a giant smile") and treat it as the child's own original hero.
If a name is written on the drawing and it is not a famous character or brand, use it. Otherwise invent a fun, original name of one or two easy words (for example "Captain Wiggles", "Blaze", "Pip").
Also invent 3 short, different adventure ideas that suit THIS drawing (its shape, colours, what it might love or be good at). Each idea is max 7 words, starts with a verb, and could follow the hero's name (e.g. "Finds a sunken pirate ship", "Builds a friend out of spare parts", "Teaches the clouds to dance"). Make them surprising and fun, not generic.
Cast a voice for the hero from this list, matching how the drawing looks and feels: ${Object.entries(VOICES).map(([k, d]) => `${k} (${d})`).join('; ')}.
Return JSON: {"name": string, "look": string (max 12 words, starts with "a" or "an"), "personality": string (max 8 words), "pronoun": "they" | "she" | "he" | "it", "ideas": [string, string, string], "voice": string}`,
    },
    ...guarded(['A child made a drawing for a picture-book story.']),
  ];
  return converseJson<RawHero>([{ role: 'user', content }], 400, (v) => v).then((v) => ({
    ideas: Array.isArray(v.ideas)
      ? v.ideas
          .map((i) => tidy(i, 60).replace(/[.!]+$/, ''))
          .filter((i) => i && isStoryTextSafe(i))
          .slice(0, 3)
      : undefined,
    voice: VOICES[String(v.voice)] && String(v.voice) !== config.pollyVoice ? String(v.voice) : 'Kevin',
    name: tidy(v.name, 24) || 'Pip',
    look: tidy(v.look, 90) || 'a friendly little creature',
    personality: tidy(v.personality, 60) || 'curious and kind',
    pronoun: (['they', 'she', 'he', 'it'].includes(String(v.pronoun)) ? v.pronoun : 'they') as HeroCard['pronoun'],
  }));
}

// ---------------------------------------------------------------------------
// 2. Write one act of the story
// ---------------------------------------------------------------------------

export interface StorySoFar {
  hero: Omit<HeroCard, 'imageUrl'>;
  idea: string;
  acts: StoryAct[];
  answers: string[]; // answers[0] answers act 0's question, etc.
  /** Picked once per story so no two stories feel the same. */
  flavor?: StoryFlavor;
  /** Made by the storyteller in part 1. */
  plan?: StoryPlan;
  /** Which part's question asks the child to draw something. */
  drawAct?: number;
  /** Things the child drew during the story. */
  drawings?: { label: string; url: string; role?: 'friend' | 'thing' }[];
  /** Whether the "draw it!" moment asks for the friend (who then talks) or an object. */
  drawKind?: 'friend' | 'thing';
  /** The part whose question the latest drawing answered. */
  lastDrawingAct?: number;
  /** Bedtime mode: calm, cosy and sleepy. */
  bedtime?: boolean;
}

export interface StoryFlavor {
  genre: string;
  questions: [string, string];
}

const GENRES = [
  'a silly, giggly comedy full of funny surprises and sound words like "Boing!" and "Splosh!"',
  'a gentle mystery with clues to follow and a happy discovery at the end',
  'a big brave adventure with a daring journey and a clever plan',
  'a warm friendship story where a new friend is met and helped',
  'a magical fairy tale with a little bit of sparkle and a kind wish',
  'an explorer story full of wonder about nature, the sea or the stars',
];

const QUESTION_STYLES = [
  'ask what the hero finds or sees (e.g. "What does Pip find inside the shell?")',
  'ask what the hero should SAY to someone (e.g. "What should Pip say to the shy dragon?")',
  'ask WHO should come and help (e.g. "Who should help Pip cross the river?")',
  'ask what the hero should USE or BRING (e.g. "What should Pip use to reach the moon?")',
  'ask where the hero should go next (e.g. "Where should Pip fly to next?")',
  'ask what silly or surprising thing happens (e.g. "What silly thing does the cloud do?")',
];

export function pickFlavor(): StoryFlavor {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const q1 = pick(QUESTION_STYLES);
  let q2 = pick(QUESTION_STYLES);
  while (q2 === q1) q2 = pick(QUESTION_STYLES);
  return { genre: pick(GENRES), questions: [q1, q2] };
}

interface RawAct {
  title?: string;
  pages?: Array<{ text?: string; setting?: string; scene?: string; heroAction?: string; heroSide?: string; mood?: string; weather?: string; props?: string[] }>;
  question?: { prompt?: string; options?: string[] };
}

export interface StoryPlan {
  /** One line per remaining part: where the story is heading. */
  beats: string[];
  /** A friend the hero meets, with the Polly voice cast for them. */
  friend?: { name: string; voice: string };
}

interface RawLine {
  speaker?: string;
  text?: string;
}

interface RawPage {
  lines?: RawLine[];
  text?: string;
  setting?: string;
  scene?: string;
  heroAction?: string;
  heroSide?: string;
  mood?: string;
  weather?: string;
  props?: string[];
  useDrawing?: boolean;
}

interface RawStaged {
  plan?: { beats?: string[]; friendName?: string; friendVoice?: string };
  title?: string;
  pages?: RawPage[];
  question?: { kind?: string; prompt?: string; options?: string[]; drawWhat?: string };
}

/** A staged page before narration: its lines and who says them. */
export interface StagedPage extends StoryPage {
  lines: { speaker: 0 | 1 | 2; text: string }[];
}

const STAGE_TOOL = 'stage_story_part';

function stageToolSchema(actIndex: number, final: boolean) {
  const page = {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        description: 'The page as 1-4 lines in reading order. Narration uses speaker "narrator". Spoken dialogue uses "hero" or "friend" (just the words said, no quote marks, no "she said").',
        items: { type: 'object', properties: { speaker: { type: 'string', enum: ['narrator', 'hero', 'friend'] }, text: { type: 'string' } }, required: ['speaker', 'text'] },
      },
      setting: { type: 'string', enum: [...SETTINGS] },
      scene: { type: 'string', description: 'Background-only description for an illustrator, max 18 words, no characters.' },
      heroAction: { type: 'string', enum: [...HERO_ACTIONS] },
      heroSide: { type: 'string', enum: ['left', 'center', 'right'] },
      mood: { type: 'string', enum: [...MOODS] },
      weather: { type: 'string', enum: [...WEATHERS] },
      props: { type: 'array', items: { type: 'string' }, description: '0-2 single emoji of objects, animals or friends on this page. Never people, flags or weapons.' },
      useDrawing: { type: 'boolean', description: "True when something the child DREW appears on this page." },
    },
    required: ['lines', 'setting', 'scene', 'heroAction', 'heroSide', 'mood', 'weather'],
  };
  const properties: Record<string, unknown> = { pages: { type: 'array', items: page } };
  const required = ['pages'];
  if (actIndex === 0) {
    properties.title = { type: 'string', description: 'Story title, max 6 words.' };
    properties.plan = {
      type: 'object',
      description: 'Your plan for the rest of the story, so all three parts fit together.',
      properties: {
        beats: { type: 'array', items: { type: 'string' }, description: 'Two short lines: what part 2 and part 3 will be about.' },
        friendName: { type: 'string', description: 'Name of the kind friend the hero will meet (an animal or creature).' },
        friendVoice: { type: 'string', enum: Object.keys(VOICES) },
      },
      required: ['beats', 'friendName', 'friendVoice'],
    };
    required.push('title', 'plan');
  }
  if (!final) {
    properties.question = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['say', 'draw'] },
        prompt: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        drawWhat: { type: 'string', description: 'For kind "draw": the thing to draw, e.g. "a key".' },
      },
      required: ['kind', 'prompt', 'options'],
    };
    required.push('question');
  }
  return { type: 'object', properties, required };
}

/**
 * The storyteller agent stages one part of the story through a tool call:
 * it writes the lines, casts who says them, and art-directs every page
 * (place, time of day, weather, props). A plan made in part 1 keeps the three
 * parts coherent, and the child's answers and drawings steer every part.
 */
export async function writeAct(story: StorySoFar, actIndex: number): Promise<StoryAct & { pages: StagedPage[] }> {
  const { hero } = story;
  const final = actIndex >= 2;
  const lastAnswer = story.answers[actIndex - 1];
  const drawHere = !final && story.drawAct === actIndex;
  const latestDrawing = story.drawings?.[story.drawings.length - 1];

  const soFar = story.acts
    .map((act, i) => {
      const pages = act.pages.map((p) => p.text).join(' ');
      const q = act.question ? `\nThe storyteller asked: "${act.question.prompt}"\nThe child answered: "${story.answers[i] ?? ''}"` : '';
      return `Part ${i + 1}: ${pages}${q}`;
    })
    .join('\n');

  const task = [
    `Stage part ${actIndex + 1} of 3 of the story with the ${STAGE_TOOL} tool.`,
    actIndex === 0
      ? `Part 1: a title, and 3 pages that introduce ${hero.name} and start the child's idea. Also make your plan for parts 2 and 3, and invent the kind friend ${hero.name} will meet (cast a voice for them).`
      : '',
    actIndex === 1
      ? `Part 2: the FIRST page must make the child's answer ("${lastAnswer}") happen right away, as an exciting surprise. 2 or 3 pages. Bring in the friend if they have not appeared yet.`
      : '',
    final
      ? `Part 3: the FIRST page must make the child's answer ("${lastAnswer}") happen right away. 3 pages that finish the adventure warmly and happily, ending cosily.`
      : '',
    story.plan ? `YOUR PLAN: ${story.plan.beats.map((b, i) => `part ${i + 2}: ${b}`).join('; ')}. Friend: ${story.plan.friend?.name ?? 'a new friend'}. Adapt the plan to the child's answers.` : '',
    latestDrawing && latestDrawing.role === 'friend'
      ? `THE CHILD DREW THE FRIEND ${(story.plan?.friend?.name ?? 'the friend').toUpperCase()}: ${latestDrawing.label}. From now on ${story.plan?.friend?.name ?? 'the friend'} looks exactly like that, is with ${hero.name} on every page, and talks a lot (speaker "friend"). Mention how they look once, kindly.`
      : latestDrawing
        ? `THE CHILD DREW ${latestDrawing.label.toUpperCase()} on paper and it is now part of the story. Make it important on these pages and set "useDrawing": true on every page where it appears.`
        : '',
  ]
    .filter(Boolean)
    .join('\n');

  const flavor = story.flavor;
  const style = story.bedtime
    ? `BEDTIME STORY: calm, cosy and gentle, for a child about to sleep. Soft adventures, no loud or exciting surprises, no sound words like BOOM. Moods move from "sunset" to "night"; weather mostly "stars", "fog" or "clear". Part 3 ends with ${hero.name} and friends yawning and falling asleep somewhere snug.
Let the adventure visit at least two different settings over the whole story.`
    : flavor
    ? `STORY STYLE: ${flavor.genre}. Keep this style, but the child's idea always comes first.
Make it fun to read aloud: a little repetition, a sound word now and then. Write it to be performed: exclamation marks for excitement ("And then... SPLASH!"), "..." before a surprise, questions that pull the listener in ("Can you guess what was inside?"). An expressive storyteller voice will read your punctuation.
Let the adventure visit at least two different settings over the whole story.`
    : '';

  let questionRule = '';
  if (!final) {
    const friendName = story.plan?.friend?.name;
    questionRule = drawHere && story.drawKind === 'friend'
      ? `QUESTION: kind "draw". ${friendName ? `The friend ${friendName}` : 'The kind friend from your plan'} appears now (or is heard nearby if they have not appeared yet), and we don't know what they look like yet! Ask the child to DRAW them, e.g. "Who's that hiding behind the tree? It's ${friendName ?? 'a new friend'}! Can you draw ${friendName ?? 'them'} for ${hero.name}?". Set drawWhat to the friend's name. Give 2 short "options" as a backup describing what the friend could look like (e.g. "A fluffy purple cat").`
      : drawHere
      ? `QUESTION: kind "draw". Invent a moment in THIS story where ${hero.name} needs or finds a special object, animal or helper, and ask the child to DRAW it on paper. It must follow naturally from your last page (do not invent a locked door unless your story has one). Pattern: "<what just happened>! Can you draw <the thing> for ${hero.name}?". Set drawWhat to the thing (2-4 words, starting with "a"). Give 2 short "options" as a backup that are versions of that same thing.`
      : `QUESTION: kind "say". ${flavor ? flavor.questions[actIndex] ?? flavor.questions[0] : 'Ask what happens next'}. Speak directly to the child, max 14 words. Give exactly 2 short fun "options" (max 5 words each).`;
  }

  const back = hero.returning;
  const memory =
    back && actIndex === 0
      ? `THIS IS EPISODE ${back.episode} for ${hero.name}. Earlier adventures: ${back.lastTitle ?? 'one before'}${back.friends?.length ? `; old friends: ${back.friends.join(', ')}` : ''}${back.drawn?.length ? `; things the child drew before: ${back.drawn.join(', ')}` : ''}. Mention one of these lovingly on the first page (an old friend could even visit), then follow the new idea.`
      : back && story.plan?.friend
        ? ''
        : '';
  const prompt = `HERO: ${hero.name}, ${hero.look}. Personality: ${hero.personality}. Pronoun: ${hero.pronoun}.
THE CHILD'S IDEA FOR THE STORY: "${story.idea}"
${memory}
${style}
${soFar ? `STORY SO FAR:\n${soFar}\n` : ''}
${task}

Every page: 2 to 3 short sentences, at most 35 words in total, as 2 to 4 lines.
DIALOGUE IS IMPORTANT: put the words characters SAY in their own line with speaker "hero" or "friend" (no quote marks, no "said"). Narration lines never contain quoted speech. ${hero.name} speaks on most pages; the friend speaks whenever they are on the page.
Example page lines: [{"speaker":"narrator","text":"${hero.name} peeked behind the big red door."},{"speaker":"hero","text":"Hello? Is anybody there?"},{"speaker":"friend","text":"Just me! Want to see something amazing?"}]
${actIndex > 0 ? 'Do NOT repeat or retell anything from the story so far. Carry on from exactly where the last part ended.' : ''}
Mention ${hero.name} by name at least once per part.
Change "mood" as time passes (a bedtime ending is "night"). Use "weather" to match what happens (rain, sparkles for magic, stars for wishes, fog for mystery); "clear" is fine often.
${questionRule}`;

  const raw = await converseTool<RawStaged>(prompt, STAGE_TOOL, 'Stage one part of the picture-book story: lines, cast, art direction and the question for the child.', stageToolSchema(actIndex, final), 3000, (v, attempt) => {
    if (!Array.isArray(v.pages) || v.pages.length === 0) throw new Error('No pages');
    if (attempt < 2 && v.pages.length < (actIndex === 1 || attempt === 1 ? 2 : 3)) throw new Error(`Only ${v.pages.length} page(s)`);
    if (!final && (!v.question?.prompt || !Array.isArray(v.question.options))) throw new Error('No question');
    return v;
  }, [story.idea, ...story.answers]);

  if (actIndex === 0 && raw.plan) {
    const friendVoice = VOICES[String(raw.plan.friendVoice)] ? String(raw.plan.friendVoice) : 'Joey';
    story.plan = {
      beats: (raw.plan.beats ?? []).map((b) => tidy(b, 140)).filter(Boolean).slice(0, 2),
      friend: raw.plan.friendName ? { name: tidy(raw.plan.friendName, 30), voice: friendVoice } : undefined,
    };
  }

  const pages: StagedPage[] = raw.pages!.slice(0, 4).map((p) => {
    const rawLines = (Array.isArray(p.lines) && p.lines.length ? p.lines : [{ speaker: 'narrator', text: p.text }])
      .map((l) => ({ speaker: (l.speaker === 'hero' ? 1 : l.speaker === 'friend' ? 2 : 0) as 0 | 1 | 2, text: tidy(l.text, 200).replace(/^["“']|["”']$/g, '') }))
      .filter((l) => l.text);
    const lines = mergeLines(rawLines.flatMap((l) => (l.speaker === 0 ? splitSpeech(l.text, hero.name, story.plan?.friend?.name) : [l]))).slice(0, 5);
    // On screen, dialogue gets quote marks so children see who is talking.
    const text = lines.map((l) => (l.speaker ? `“${l.text}”` : l.text)).join(' ');
    return {
      lines,
      text: tidy(text, 300),
      setting: (SETTINGS as readonly string[]).includes(String(p.setting)) ? (p.setting as Setting) : 'meadow',
      scene: tidy(p.scene, 160) || 'a sunny meadow with soft hills',
      heroAction: (HERO_ACTIONS as readonly string[]).includes(String(p.heroAction)) ? (p.heroAction as HeroAction) : 'walk',
      heroSide: p.heroSide === 'left' || p.heroSide === 'right' ? p.heroSide : 'center',
      mood: (MOODS as readonly string[]).includes(String(p.mood)) ? (p.mood as Mood) : undefined,
      weather: (WEATHERS as readonly string[]).includes(String(p.weather)) ? (p.weather as Weather) : undefined,
      props: cleanProps(p.props),
      // A drawn friend is in every scene from now on; a drawn object only where the story uses it.
      drawing: latestDrawing && (latestDrawing.role === 'friend' || p.useDrawing) ? latestDrawing.url : undefined,
      drawingRole: latestDrawing && (latestDrawing.role === 'friend' || p.useDrawing) ? latestDrawing.role ?? 'thing' : undefined,
    };
  });
  // The child's drawing always shows up at least on the first page after they drew it.
  if (latestDrawing && story.drawings!.length > 0 && story.acts.length === actIndex && !pages.some((p) => p.drawing) && story.lastDrawingAct === actIndex - 1) {
    pages[0].drawing = latestDrawing.url;
    pages[0].drawingRole = latestDrawing.role ?? 'thing';
  }

  const allText = pages.map((p) => p.text).join(' ') + ' ' + (raw.question?.prompt ?? '');
  if (!isStoryTextSafe(allText) || pages.some((p) => !p.text)) {
    throw new Error('Unsafe or empty story text');
  }

  let question: StoryQuestion | undefined;
  if (!final && raw.question) {
    const opts = (raw.question.options ?? []).map((o) => tidy(o, 40)).filter(Boolean);
    const isDraw = drawHere || raw.question.kind === 'draw';
    let prompt = tidy(raw.question.prompt, 140);
    const what = tidy(raw.question.drawWhat, 40) || 'something wonderful';
    if (isDraw && !/\bdraw\b/i.test(prompt)) prompt = `${prompt.replace(/[.!?]*$/, '!')} Can you draw ${what} for ${hero.name}?`;
    question = {
      prompt,
      options: [opts[0] || 'A secret treasure', opts[1] || 'A sleepy friend'],
      kind: isDraw ? 'draw' : 'say',
      drawWhat: isDraw ? what : undefined,
      drawRole: isDraw ? (drawHere && story.drawKind === 'friend' ? 'friend' : 'thing') : undefined,
    };
  }

  return { index: actIndex, title: actIndex === 0 ? tidy(raw.title, 50) || `${hero.name}'s Big Day` : undefined, pages, question, final };
}

// ---------------------------------------------------------------------------
// 3. Read a drawing the child made during the story
// ---------------------------------------------------------------------------

export async function describeProp(png: Buffer, asked: string): Promise<string> {
  const content: ContentBlock[] = [
    { image: { format: 'png', source: { bytes: png } } },
    {
      text: `A young child was asked to draw ${asked} for a story, and drew this. Name what they drew in a few kind words (max 6 words, start with "a" or "an", mention its colour), e.g. "a purple key with a star". If it is hard to tell, assume it is ${asked}.
Return JSON: {"label": string}`,
    },
    ...guarded([`A child drew ${asked} for a picture-book story.`]),
  ];
  const v = await converseJson<{ label?: string }>([{ role: 'user', content }], 120, (x) => x);
  const label = tidy(v.label, 60).replace(/[.!]+$/, '');
  return label && isStoryTextSafe(label) ? label : asked;
}

/** Small models sometimes send nested objects as JSON strings; parse them back. */
function unstringify(v: unknown, depth = 0): unknown {
  if (depth > 4) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try {
        return unstringify(JSON.parse(t), depth + 1);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => unstringify(x, depth + 1));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = unstringify(x, depth + 1);
    // A single page object instead of a list of pages.
    if (o.pages && !Array.isArray(o.pages) && typeof o.pages === 'object') o.pages = [o.pages];
    return o;
  }
  return v;
}

/** Structured output through a tool call (Bedrock Converse tool use). */
async function converseTool<T>(
  prompt: string,
  name: string,
  description: string,
  schema: unknown,
  maxTokens: number,
  validate: (v: T, attempt: number) => T,
  childWords: string[] = [],
): Promise<T> {
  let lastRaw: unknown;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const command = new ConverseCommand({
        modelId: config.textModelId,
        system: [{ text: STORYTELLER_SYSTEM.replace('Reply with JSON only. No markdown, no commentary.', `Always answer by calling the ${name} tool.`) }],
        messages: [{ role: 'user', content: [{ text: prompt }, ...guarded(childWords.length ? childWords : ['A picture-book story for a young child.'])] }],
        inferenceConfig: { maxTokens, temperature: attempt === 0 ? 0.8 : 0.5, topP: 0.9 },
        toolConfig: {
          tools: [{ toolSpec: { name, description, inputSchema: { json: schema as never } } }],
          toolChoice: { any: {} },
        },
        ...(config.guardrailId
          ? { guardrailConfig: { guardrailIdentifier: config.guardrailId, guardrailVersion: config.guardrailVersion, trace: 'disabled' as const } }
          : {}),
      });
      const res = await client.send(command);
      if (res.stopReason === 'guardrail_intervened') throw new GuardrailError('Guardrail intervened');
      if (res.stopReason === 'max_tokens') console.warn(`[bedrock] ${name}: answer was cut off (max_tokens)`);
      const blocks = res.output?.message?.content ?? [];
      const use = blocks.find((b) => 'toolUse' in b && b.toolUse);
      let value: unknown;
      if (use && 'toolUse' in use && use.toolUse?.input) value = use.toolUse.input;
      else value = extractJson<T>(blocks.map((b) => ('text' in b ? b.text : '')).join('')); // plain JSON text instead of a tool call
      lastRaw = value;
      return validate(unstringify(value) as T, attempt);
    } catch (e) {
      if (e instanceof GuardrailError) throw e;
      lastErr = e;
      console.warn(`[bedrock] ${name} attempt ${attempt + 1} failed:`, (e as Error).message);
      if (attempt === 2 && lastRaw) console.warn('[bedrock] last answer was:', JSON.stringify(lastRaw).slice(0, 600));
    }
  }
  throw lastErr;
}

type StagedLine = { speaker: 0 | 1 | 2; text: string };

/**
 * Small models sometimes write speech inside narration ("Pip said, 'Hi!'").
 * Pull the quoted words out into their own line so the character's voice says them.
 */
export function splitSpeech(text: string, heroName: string, friendName?: string): StagedLine[] {
  const re = /(^|[\s,:—-])(?:“([^”]+)”|"([^"]+)"|'(.+?)'(?=[\s.,!?;:]|$))/g;
  const out: StagedLine[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const firstName = heroName.split(' ').pop()!.toLowerCase();
  while ((m = re.exec(text))) {
    const said = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (said.split(/\s+/).length < 2 && !/[!?]/.test(said)) continue; // not speech, just a quoted word
    const before = text.slice(last, m.index + m[1].length).trim();
    const after = text.slice(re.lastIndex, re.lastIndex + 40).toLowerCase();
    const near = (before.slice(-40) + ' ' + after).toLowerCase();
    const speaker: 1 | 2 = friendName && near.includes(friendName.toLowerCase()) && !near.includes(firstName) ? 2 : near.includes(firstName) || /\b(it|she|he|they) (said|asked|shouted|cried|wondered|whispered)/.test(near) ? 1 : 2;
    if (before) out.push({ speaker: 0, text: before.replace(/[,:]\s*$/, '.') });
    // Someone greeting the hero by name is not the hero.
    out.push({ speaker: said.toLowerCase().includes(firstName) ? 2 : speaker, text: said });
    last = re.lastIndex;
  }
  if (!out.length) {
    // An opening quote that never closes: "Giggle thought, 'I want to jump in!"
    const open = /^(.*?[\s,:])['"“](.{3,})$/.exec(text);
    if (open && !/['"”]/.test(open[2])) {
      const before = open[1].trim().replace(/[,:]\s*$/, '.');
      const near = before.toLowerCase();
      const speaker: 1 | 2 = friendName && near.includes(friendName.toLowerCase()) && !near.includes(firstName) ? 2 : near.includes(firstName) || /\b(it|she|he|they)\b/.test(near) ? 1 : 2;
      const said = open[2].trim();
      return [...(before ? [{ speaker: 0 as const, text: before }] : []), { speaker: said.toLowerCase().includes(firstName) ? 2 : speaker, text: said }];
    }
    return [{ speaker: 0, text }];
  }
  let rest = text.slice(last).trim();
  // Drop leftover speech tags like "Captain Starshine wondered." after the quote.
  if (/^[^.!?]{0,40}\b(said|asked|shouted|cried|wondered|whispered|called|laughed)\b[^.!?]{0,30}[.!?]?$/i.test(rest)) rest = '';
  if (rest && /\w/.test(rest)) out.push({ speaker: 0, text: rest });
  return out;
}

/** Joins consecutive lines by the same speaker (and fragments that were split mid-sentence). */
export function mergeLines(lines: StagedLine[]): StagedLine[] {
  const out: StagedLine[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === l.speaker) prev.text = `${prev.text} ${l.text}`.replace(/\s+/g, ' ');
    else out.push({ ...l });
  }
  return out;
}

const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*$/u;
// People and body parts are left out: the child's drawing is the only person-like character.
const NO_PEOPLE = /[\u{1F466}-\u{1F487}\u{1F574}-\u{1F57A}\u{1F645}-\u{1F64F}\u{1F6B4}-\u{1F6B6}\u{1F90C}-\u{1F91F}\u{1F926}\u{1F930}-\u{1F93E}\u{1F9B0}-\u{1F9B9}\u{1F9CD}-\u{1F9DF}\u{1F3C3}-\u{1F3CC}\u{1F44A}-\u{1F450}\u{1F3F4}\u{1F1E6}-\u{1F1FF}\u{1F52B}\u{1F4A3}\u{1F5E1}\u{2694}\u{1F480}\u{2620}]/u;

function cleanProps(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length <= 8 && EMOJI.test(x) && !NO_PEOPLE.test(x))
    .slice(0, 2);
  return out.length ? out : undefined;
}

function tidy(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
