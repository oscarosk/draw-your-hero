import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { putObject } from './storage.js';

/**
 * Stores generated media (drawings, paintings, narration) on local disk and
 * serves it under /media. Every file is deleted after MEDIA_TTL_HOURS, so
 * children's drawings are never kept longer than a day.
 */
export async function ensureMediaDir(): Promise<void> {
  await fs.mkdir(config.mediaDir, { recursive: true });
}

export async function saveMedia(data: Buffer, ext: 'png' | 'jpg' | 'mp3'): Promise<string> {
  const name = `${crypto.randomUUID()}.${ext}`;
  await putObject(name, data);
  return `${config.publicUrl}/media/${name}`;
}

export async function cleanupMedia(): Promise<number> {
  const cutoff = Date.now() - config.mediaTtlHours * 3600 * 1000;
  let removed = 0;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(config.mediaDir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(config.mediaDir, entry);
    try {
      const stat = await fs.stat(full);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(full);
        removed++;
      }
    } catch {
      // ignore files removed concurrently
    }
  }
  return removed;
}

export function startMediaCleanup(): void {
  if (config.mediaBucket) return; // the S3 lifecycle rule does this on AWS
  const run = () =>
    cleanupMedia()
      .then((n) => n && console.log(`[media] removed ${n} expired file(s)`))
      .catch((e) => console.warn('[media] cleanup failed', e));
  run();
  setInterval(run, 30 * 60 * 1000).unref();
}
