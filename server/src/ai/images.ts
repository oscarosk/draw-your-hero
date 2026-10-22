import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';
import { saveMedia } from '../media.js';

const client = new BedrockRuntimeClient({ region: config.canvasRegion });

const STYLE =
  "Soft watercolor children's picture-book background, warm gentle colors, hand-painted texture, " +
  'wide empty landscape, open clear space in the lower middle for a character, no people, no animals, no characters, no text';

const NEGATIVE = 'people, person, animal, creature, character, face, text, letters, words, watermark, scary, dark, blood, weapon';

/**
 * Paints a background with Amazon Nova Canvas. The same seed is used for every
 * page of one story, which keeps the painting style consistent from page to page.
 * Returns undefined on any failure so the TV can fall back to its own scenes.
 */
export async function paintScene(scene: string, seed: number): Promise<string | undefined> {
  if (config.imageMode !== 'canvas') return undefined;
  const body = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: `${STYLE}. Scene: ${scene}`.slice(0, 1000),
      negativeText: NEGATIVE,
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      width: 1280,
      height: 720,
      cfgScale: 7,
      quality: 'standard',
      seed: seed % 858993459,
    },
  };
  try {
    const res = await client.send(
      new InvokeModelCommand({
        modelId: config.canvasModelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      }),
    );
    const json = JSON.parse(new TextDecoder().decode(res.body)) as { images?: string[]; error?: string };
    const b64 = json.images?.[0];
    if (!b64) {
      console.warn('[canvas] no image returned', json.error);
      return undefined;
    }
    return await saveMedia(Buffer.from(b64, 'base64'), 'png');
  } catch (e) {
    console.warn('[canvas] failed:', (e as Error).message);
    return undefined;
  }
}
