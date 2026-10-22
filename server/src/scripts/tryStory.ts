// Run with: npm run try:story
// Plays a whole story through the live AI pipeline in the terminal (no TV
// needed), so you can check Bedrock, tool use, casting and Polly quickly.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { describeHero, describeProp, pickFlavor, writeAct, type StorySoFar } from '../ai/bedrock.js';
import { narrateCast } from '../ai/voice.js';

const t0 = Date.now();
const lap = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const png = await fs.readFile(path.join(config.assetsDir, 'demo-hero.png'));
const hero = await describeHero(png).catch((e) => {
  console.error('describeHero failed:', (e as Error).name, (e as Error).message);
  process.exit(1);
});
console.log(`[${lap()}] HERO`, hero);

const story: StorySoFar = { hero, idea: hero.ideas?.[0] ?? 'Goes on a trip to the moon', acts: [], answers: [], flavor: pickFlavor(), drawAct: 0, drawings: [] };
console.log(`[${lap()}] STYLE`, story.flavor?.genre);

for (let i = 0; i < 3; i++) {
  const act = await writeAct(story, i);
  console.log(`\n[${lap()}] PART ${i + 1}${act.title ? `: ${act.title}` : ''}`);
  if (i === 0) console.log('  PLAN', story.plan);
  for (const p of act.pages) {
    console.log(`  - [${p.setting}/${p.mood}/${p.weather}] ${p.props?.join('') ?? ''} ${p.drawing ? '(child drawing)' : ''}`);
    for (const l of p.lines) console.log(`      ${['narrator', 'HERO', 'FRIEND'][l.speaker]}: ${l.text}`);
  }
  if (i === 0) {
    const voice = await narrateCast(
      act.pages[0].lines.map((l) => ({ speaker: l.speaker, voice: l.speaker === 1 ? hero.voice || 'Kevin' : l.speaker === 2 ? story.plan?.friend?.voice || 'Joey' : config.pollyVoice, text: l.text })),
    );
    console.log(`  [${lap()}] VOICES page 1:`, voice.audioUrl ? `audio ok, ${voice.wordTimes?.length} word timings, speakers ${voice.wordSpeakers?.join('')}` : 'NO AUDIO');
  }
  story.acts.push(act);
  if (act.question) {
    console.log(`  QUESTION (${act.question.kind}${act.question.drawWhat ? `: ${act.question.drawWhat}` : ''}): ${act.question.prompt}  [${act.question.options.join(' | ')}]`);
    if (act.question.kind === 'draw') {
      const label = await describeProp(png, act.question.drawWhat || 'something');
      console.log(`  [${lap()}] child "drew": ${label}`);
      story.drawings!.push({ label, url: 'https://example/drawing.png' });
      story.lastDrawingAct = i;
      story.answers.push(`${label} (the child drew it)`);
    } else story.answers.push(act.question.options[1]);
  }
}
console.log(`\nDone in ${lap()}.`);
