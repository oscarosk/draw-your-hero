import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './config.js';

// Where children's drawings, narration and storybooks live.
//  - On AWS: an S3 bucket whose lifecycle rule deletes everything after a day.
//  - Locally: the media/ folder, cleaned up by media.ts on the same schedule.

const s3 = config.mediaBucket ? new S3Client({ region: config.region }) : undefined;
const SAFE = /^[a-z0-9-]+(\/[a-z0-9-]+)?\.(png|jpg|mp3|json)$/;

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', mp3: 'audio/mpeg', json: 'application/json' };
export const contentType = (key: string) => TYPES[key.split('.').pop() || ''] || 'application/octet-stream';

export async function putObject(key: string, data: Buffer): Promise<void> {
  if (!SAFE.test(key)) throw new Error(`Bad storage key: ${key}`);
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: config.mediaBucket, Key: key, Body: data, ContentType: contentType(key) }));
    return;
  }
  const file = path.join(config.mediaDir, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

export async function getObject(key: string): Promise<Buffer | undefined> {
  if (!SAFE.test(key)) return undefined;
  if (s3) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: config.mediaBucket, Key: key }));
      return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : undefined;
    } catch (e) {
      const name = (e as Error).name;
      if (name === 'NoSuchKey' || name === 'AccessDenied') return undefined;
      throw e;
    }
  }
  try {
    return await fs.readFile(path.join(config.mediaDir, key));
  } catch {
    return undefined;
  }
}

export const usingS3 = () => !!s3;
