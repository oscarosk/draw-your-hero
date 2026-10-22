// A small, fast first line of defence for what children say. Amazon Bedrock
// Guardrails (when GUARDRAIL_ID is set) runs on every model call as well.

const BLOCKED = [
  'kill',
  'killed',
  'killing',
  'murder',
  'blood',
  'bloody',
  'gun',
  'guns',
  'shoot',
  'shooting',
  'knife',
  'stab',
  'dead',
  'die',
  'dies',
  'death',
  'bomb',
  'suicide',
  'sex',
  'sexy',
  'naked',
  'drugs',
  'beer',
  'drunk',
  'hate',
  'stupid',
  'idiot',
  'damn',
  'hell',
  'shit',
  'fuck',
];

const SOFTEN: Record<string, string> = {
  monster: 'friendly monster',
  fight: 'race',
  fighting: 'racing',
  battle: 'big contest',
  scary: 'surprising',
  zombie: 'sleepy dancing zombie',
  ghost: 'giggly ghost',
};

export interface CleanResult {
  text: string;
  changed: boolean;
}

/** Trims, limits length, softens mild words and replaces anything unsuitable. */
export function cleanChildText(raw: string, fallback: string): CleanResult {
  let text = (raw || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return { text: fallback, changed: true };

  const words = text.toLowerCase().split(/[^a-z']+/);
  if (words.some((w) => BLOCKED.includes(w))) {
    return { text: fallback, changed: true };
  }

  let changed = false;
  text = text.replace(/\b[a-z]+\b/gi, (w) => {
    const repl = SOFTEN[w.toLowerCase()];
    if (repl) {
      changed = true;
      return repl;
    }
    return w;
  });
  return { text, changed };
}

/** Checks model output before it reaches a child. */
export function isStoryTextSafe(text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z']+/);
  return !words.some((w) => BLOCKED.includes(w));
}
