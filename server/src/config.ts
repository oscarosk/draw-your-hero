import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num('PORT', 8787),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:8787').replace(/\/+$/, ''),
  mode: (process.env.MODE === 'aws' ? 'aws' : 'demo') as 'aws' | 'demo',
  region: process.env.AWS_REGION || 'ap-southeast-2',
  textModelId: process.env.TEXT_MODEL_ID || 'amazon.nova-lite-v1:0',
  imageMode: (process.env.IMAGE_MODE === 'canvas' ? 'canvas' : 'none') as 'canvas' | 'none',
  canvasRegion: process.env.CANVAS_REGION || 'us-east-1',
  canvasModelId: process.env.CANVAS_MODEL_ID || 'amazon.nova-canvas-v1:0',
  pollyVoice: process.env.POLLY_VOICE || 'Ruth',
  /** Use Polly's generative engine (expressive, storyteller-like) for voices that have it. */
  pollyGenerative: (process.env.POLLY_GENERATIVE || 'true') !== 'false',
  pollyEngine: (process.env.POLLY_ENGINE || 'neural') as 'neural' | 'standard' | 'generative' | 'long-form',
  guardrailId: process.env.GUARDRAIL_ID || '',
  guardrailVersion: process.env.GUARDRAIL_VERSION || 'DRAFT',
  maxStoriesPerDay: num('MAX_STORIES_PER_DAY', 80),
  mediaTtlHours: num('MEDIA_TTL_HOURS', 24),
  mediaDir: path.resolve(here, '..', 'media'),
  /** S3 bucket for drawings, narration and storybooks (with a lifecycle rule). Empty = local disk. */
  mediaBucket: process.env.MEDIA_BUCKET || '',
  /** DynamoDB table for hero memories (with a TTL attribute). Empty = local JSON file. */
  heroesTable: process.env.HEROES_TABLE || '',
  /** CloudWatch metrics namespace. Empty = no custom metrics. */
  metricsNamespace: process.env.METRICS_NAMESPACE || '',
  publicDir: path.resolve(here, '..', 'public'),
  assetsDir: path.resolve(here, '..', 'assets'),
};

export type Config = typeof config;
