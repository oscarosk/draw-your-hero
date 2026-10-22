// Run with: npm run check:aws
// Verifies that this AWS account can use every service Draw Your Hero needs.
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { config } from '../config.js';

async function check(name: string, fn: () => Promise<string>): Promise<boolean> {
  process.stdout.write(`- ${name} ... `);
  try {
    const detail = await fn();
    console.log(`OK ${detail}`);
    return true;
  } catch (e) {
    const err = e as Error & { name?: string };
    console.log(`FAILED\n    ${err.name}: ${err.message}`);
    return false;
  }
}

console.log(`Checking AWS access (text region ${config.region}, canvas region ${config.canvasRegion})\n`);

// New accounts sometimes get quota on only one way of calling a model (in-region,
// a geographic cross-region profile, or a global profile), so try each one.
const geo = config.region.startsWith('ap-southeast-2') || config.region.startsWith('ap-southeast-4') ? ['au', 'apac'] : config.region.startsWith('ap-') ? ['apac'] : config.region.startsWith('eu-') ? ['eu'] : ['us'];
const candidates = [
  config.textModelId,
  ...geo.map((g) => `${g}.amazon.nova-lite-v1:0`),
  'global.amazon.nova-2-lite-v1:0',
  ...geo.map((g) => `${g}.amazon.nova-2-lite-v1:0`),
  'amazon.nova-micro-v1:0',
  ...geo.map((g) => `${g}.amazon.nova-micro-v1:0`),
].filter((v, i, a) => a.indexOf(v) === i);

const working: string[] = [];
for (const modelId of candidates) {
  const ok = await check(`Bedrock ${modelId}`, async () => {
    const client = new BedrockRuntimeClient({ region: config.region });
    const res = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: 'Say hello to a dragon in five words.' }] }],
        inferenceConfig: { maxTokens: 40 },
      }),
    );
    const out = res.output?.message?.content?.map((c) => ('text' in c ? c.text : '')).join('') ?? '';
    return `-> "${out.trim()}"`;
  });
  if (ok) working.push(modelId);
}
const text = working.length > 0;

const polly = await check(`Polly ${config.pollyVoice} (${config.pollyEngine})`, async () => {
  const client = new PollyClient({ region: config.region });
  const res = await client.send(
    new SynthesizeSpeechCommand({
      Text: 'Once upon a time.',
      OutputFormat: 'mp3',
      VoiceId: config.pollyVoice as never,
      Engine: config.pollyEngine,
    }),
  );
  const bytes = await res.AudioStream?.transformToByteArray();
  return `-> ${bytes?.length ?? 0} bytes of audio`;
});

const canvas = await check(`Nova Canvas ${config.canvasModelId} in ${config.canvasRegion}`, async () => {
  const client = new BedrockRuntimeClient({ region: config.canvasRegion });
  const res = await client.send(
    new InvokeModelCommand({
      modelId: config.canvasModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        taskType: 'TEXT_IMAGE',
        textToImageParams: { text: 'a watercolor meadow with soft hills' },
        imageGenerationConfig: { numberOfImages: 1, width: 512, height: 512, quality: 'standard' },
      }),
    }),
  );
  const json = JSON.parse(new TextDecoder().decode(res.body)) as { images?: string[] };
  return `-> ${json.images?.length ?? 0} image(s)`;
});

console.log('');
if (text && polly) {
  console.log(`Ready for MODE=aws. In .env set:\n  MODE=aws\n  TEXT_MODEL_ID=${working[0]}\n  IMAGE_MODE=${canvas ? 'canvas' : 'none'}`);
} else if (text) {
  console.log(`Bedrock works (TEXT_MODEL_ID=${working[0]}) but Polly does not. Share the Polly error above.`);
} else {
  console.log('Not ready for MODE=aws yet. Keep MODE=demo and share the errors above.');
}
