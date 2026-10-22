import type { HeroCard, Mood, Setting, StoryAct, StoryPage, Weather } from '../types.js';
import type { StorySoFar } from './bedrock.js';

// Demo mode: a hand-written story template that still uses the child's own
// idea and answers, so the whole experience works without any AWS account.

const SETTING_WORDS: Array<[RegExp, Setting]> = [
  [/moon|star|space|rocket|planet|alien/i, 'space'],
  [/sea|ocean|boat|ship|pirate|island/i, 'ocean'],
  [/fish|mermaid|underwater|whale|dolphin/i, 'underwater'],
  [/beach|sand|shell/i, 'beach'],
  [/castle|king|queen|princess|prince|dragon/i, 'castle'],
  [/snow|ice|winter|penguin|cold/i, 'snow'],
  [/jungle|monkey|tiger|parrot/i, 'jungle'],
  [/forest|tree|wood|bear|owl/i, 'forest'],
  [/desert|camel|pyramid/i, 'desert'],
  [/city|town|car|bus|train|school/i, 'city'],
  [/cave|tunnel|underground/i, 'cave'],
  [/volcano|lava|fire/i, 'volcano'],
  [/sky|cloud|fly|bird|balloon/i, 'sky'],
  [/night|sleep|dream|bed/i, 'night'],
];

export function pickSetting(text: string, fallback: Setting = 'meadow'): Setting {
  for (const [re, setting] of SETTING_WORDS) if (re.test(text)) return setting;
  return fallback;
}

const SCENES: Record<Setting, string> = {
  meadow: 'a sunny meadow with soft green hills and wildflowers',
  forest: 'a friendly forest with tall trees and dappled light',
  jungle: 'a lush jungle with big leaves and hanging vines',
  ocean: 'a sparkling blue ocean with gentle waves under a bright sky',
  underwater: 'a calm underwater garden with coral and bubbles',
  beach: 'a warm sandy beach with shells and a calm sea',
  sky: 'a wide sky full of fluffy clouds at sunrise',
  space: 'deep blue space with twinkling stars and a big round moon',
  night: 'a quiet starry night over rolling hills',
  castle: 'a tall storybook castle on a green hill with flags',
  desert: 'golden sand dunes under a warm orange sky',
  snow: 'a snowy valley with pine trees and soft snowflakes',
  city: 'a colourful little town with rooftops and a clock tower',
  cave: 'a glittering cave full of glowing crystals',
  volcano: 'a sleepy volcano with warm glowing rocks and palm trees',
};

// Things that might turn up in each place, so demo scenes vary too.
const PROPS: Record<Setting, string[]> = {
  meadow: ['🦋', '🌻', '🐞', '🎈', '🐰'],
  forest: ['🍄', '🦉', '🦊', '🌰', '🐿️'],
  jungle: ['🦜', '🐒', '🍌', '🐸', '🦋'],
  ocean: ['⛵', '🐳', '🐬', '🦀', '🧭'],
  underwater: ['🐙', '🐠', '🐢', '🦑', '💎'],
  beach: ['🦀', '🐚', '🏖️', '🪁', '🍉'],
  sky: ['🎈', '🪁', '🌈', '🐦', '☁️'],
  space: ['🚀', '🪐', '👾', '🛸', '⭐'],
  night: ['🦉', '🌙', '⭐', '🏮', '🦔'],
  castle: ['👑', '🐉', '🗝️', '🦄', '🛡️'],
  desert: ['🐪', '🌵', '🦎', '🏺', '🧭'],
  snow: ['⛄', '🐧', '❄️', '🦭', '🧣'],
  city: ['🚌', '🎪', '🍦', '🚲', '🐕'],
  cave: ['💎', '🦇', '🔦', '🗝️', '🕯️'],
  volcano: ['🦖', '🥚', '🌋', '💎', '🔥'],
};
const WEATHER_FOR: Partial<Record<Setting, Weather[]>> = {
  meadow: ['clear', 'leaves', 'sparkles'],
  forest: ['clear', 'leaves', 'fog', 'rain'],
  jungle: ['clear', 'rain', 'leaves'],
  ocean: ['clear', 'rain', 'sparkles'],
  underwater: ['bubbles'],
  beach: ['clear', 'sparkles'],
  sky: ['clear', 'sparkles', 'rain'],
  space: ['stars', 'sparkles'],
  night: ['stars', 'fog', 'clear'],
  castle: ['sparkles', 'clear', 'fog'],
  desert: ['clear'],
  snow: ['snow'],
  city: ['clear', 'rain'],
  cave: ['sparkles', 'fog'],
  volcano: ['clear', 'fog'],
};
const pickOne = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function page(text: string, setting: Setting, heroAction: StoryPage['heroAction'], heroSide: StoryPage['heroSide'], mood?: Mood): StoryPage {
  const props = Math.random() < 0.75 ? [pickOne(PROPS[setting])] : undefined;
  return { text, setting, scene: SCENES[setting], heroAction, heroSide, mood, weather: pickOne(WEATHER_FOR[setting] ?? ['clear']), props };
}

function lowerFirst(s: string): string {
  // Leave names alone ("Pip"), lower the start of phrases ("A singing snail").
  if (!s || /^[A-Z][a-z]+(\s|$)/.test(s) && !/^(A|An|The|Some|One)\s/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Names for a friend the child draws when no AI is around to name it. */
export const DEMO_FRIEND_NAMES = ['Pip', 'Bobo', 'Mimi', 'Tumble', 'Zuzu', 'Noodle', 'Wobble', 'Kiki'];

/** Turns the child's idea into something that follows the hero's name. */
function ideaAsAction(idea: string): string {
  const s = lowerFirst(idea.trim());
  if (/^(a|an|the|some|my|our)\b/.test(s)) return `goes on ${s}`;
  if (/^(to|go|find|fly|swim|visit|make|bake|meet|learn|play|build|climb|see)\b/.test(s)) return `is going to ${s.replace(/^to\s+/, '')}`;
  return s;
}

function stripEnd(s: string): string {
  return s.replace(/[.!?\s]+$/, '');
}

export const DEMO_HERO: Omit<HeroCard, 'imageUrl'> = {
  name: 'Captain Wiggles',
  look: 'a round orange creature with a big smile and wobbly arms',
  personality: 'brave, giggly and very curious',
  pronoun: 'they',
};

export const IDEA_SUGGESTIONS = [
  'Goes on a trip to the moon',
  'Finds a secret door in the forest',
  'Learns to swim with the fishes',
  'Bakes the biggest cake ever',
];

/** A big pool so the demo offers different ideas every time. */
const IDEA_POOL = [
  'Goes on a trip to the moon',
  'Finds a secret door in the forest',
  'Learns to swim with the fishes',
  'Bakes the biggest cake ever',
  'Rescues a lost baby dragon',
  'Teaches the clouds to dance',
  'Finds a treasure map in a bottle',
  'Builds a rocket out of boxes',
  'Visits a castle made of candy',
  'Helps a penguin find its way home',
  'Discovers a crystal cave',
  'Rides a whale across the sea',
  'Throws a party for the stars',
  'Follows a glowing butterfly',
  'Catches a wish from a shooting star',
  'Opens a shop for sleepy owls',
];

export function randomIdeas(n = 3): string[] {
  const pool = [...IDEA_POOL];
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

export function demoAct(story: StorySoFar, actIndex: number): StoryAct {
  const { hero } = story;
  const n = hero.name;
  const idea = stripEnd(story.idea || IDEA_SUGGESTIONS[0]);
  const s1 = pickSetting(idea);

  if (actIndex === 0) {
    return {
      index: 0,
      title: `${n} and the Big Idea`,
      final: false,
      pages: [
        page(`Once upon a time, there was ${hero.look}. Everyone called them ${n}.`, 'meadow', 'wave', 'center', 'morning'),
        page(`One morning, ${n} jumped out of bed with a big idea. Today, ${n} ${ideaAsAction(idea)}!`, 'meadow', 'jump', 'left'),
        page(`So off went ${n}, with a happy hum and a wobbly wiggle, all the way to ${SCENES[s1]}.`, s1, 'walk', 'right'),
      ],
      question:
        story.drawAct === 0
          ? {
              prompt: `Ooh! ${n} found a treasure chest, but it's empty! Can you draw the treasure inside?`,
              options: ['A tiny glowing door', 'A giggling cloud'],
              kind: 'draw',
              drawWhat: 'a treasure',
              drawRole: 'thing',
            }
          : {
              prompt: `Ooh! What do you think ${n} finds there first?`,
              options: ['A tiny glowing door', 'A giggling cloud'],
            },
    };
  }

  const answer = stripEnd(
    (story.answers[actIndex - 1] || 'a big surprise').replace(/\s+looks like .*\(the child drew them\)$/, '').replace(/\s*\(the child drew it\)/, ''),
  );
  if (actIndex === 1) {
    const s2 = pickSetting(answer, s1);
    return {
      index: 1,
      final: false,
      pages: [
        page(
          `And there it was: ${lowerFirst(answer)}! ${n} gasped. "That is the most amazing thing I have ever seen!"`,
          s2,
          'jump',
          'left',
        ),
        page(`${n} tiptoed closer. Something wonderful was about to happen, and it needed a friend just like ${n}.`, s2, 'walk', 'center'),
      ],
      question:
        story.drawAct === 1
          ? {
              prompt: `${n} needs a friend to help! Can you draw a new friend for ${n}?`,
              options: ['A singing snail', 'A dragon who loves hugs'],
              kind: 'draw',
              drawWhat: 'a friend',
              drawRole: 'friend',
            }
          : {
              prompt: `Who comes along to help ${n}?`,
              options: ['A singing snail', 'A dragon who loves hugs'],
            },
    };
  }

  const s3 = pickSetting(answer, s1);
  return {
    index: 2,
    final: true,
    pages: [
      page(
        `Then along came ${lowerFirst(answer)}! "Let's do it together," they said, and ${n} smiled the biggest smile.`,
        s3,
        'dance',
        'right',
      ),
      page(`Side by side they laughed and played until the sky turned pink and gold.`, s3, 'jump', 'center', 'sunset'),
      page(`That night, ${n} curled up warm and cosy, already dreaming about tomorrow's adventure. The end.`, 'night', 'sleep', 'center', 'night'),
    ],
  };
}
