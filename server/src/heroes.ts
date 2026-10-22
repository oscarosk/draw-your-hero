import fs from 'node:fs/promises';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import type { HeroCard } from './types.js';

// Remembers heroes between stories so a child who photographs the same drawing
// again gets "Look who's back!" and an episode 2. Only text is kept (name,
// voice, friends, titles), never the drawing itself, and memories expire.
//  - On AWS: a DynamoDB table; its TTL attribute deletes memories after 7 days.
//  - Locally: data/heroes.json.

const FILE = () => path.join(config.mediaDir, '..', 'data', 'heroes.json');
const KEEP_DAYS = 7;
const MAX_DISTANCE = 0.11; // share of the 256 silhouette bits allowed to differ

export interface HeroMemory {
  fp: string;
  card: Omit<HeroCard, 'imageUrl' | 'returning'>;
  titles: string[];
  friends: string[];
  drawn: string[];
  lastSeen: number;
}

let cache: HeroMemory[] | undefined;
let cacheAt = 0;

const ddb = config.heroesTable ? DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region })) : undefined;

async function load(): Promise<HeroMemory[]> {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  if (ddb) {
    // Small table (one row per hero); a short-lived cache keeps it to one scan a minute.
    if (cache && Date.now() - cacheAt < 60000) return cache;
    const items: HeroMemory[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const out = await ddb.send(new ScanCommand({ TableName: config.heroesTable, ExclusiveStartKey: start }));
      for (const it of out.Items ?? []) items.push(it as unknown as HeroMemory);
      start = out.LastEvaluatedKey;
    } while (start);
    cache = items.filter((m) => m.lastSeen > cutoff);
    cacheAt = Date.now();
    return cache;
  }
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE(), 'utf8')) as HeroMemory[];
  } catch {
    cache = [];
  }
  cache = cache.filter((m) => m.lastSeen > cutoff);
  return cache;
}

async function persist(changed: HeroMemory): Promise<void> {
  if (ddb) {
    await ddb.send(
      new PutCommand({
        TableName: config.heroesTable,
        Item: { ...changed, expiresAt: Math.floor(changed.lastSeen / 1000) + KEEP_DAYS * 86400 },
      }),
    );
    return;
  }
  await fs.mkdir(path.dirname(FILE()), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify(cache ?? []));
}

function distance(a: string, b: string): number {
  if (a.length !== b.length || !/^[0-9a-f]+$/.test(a + b)) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff / (a.length * 4);
}

/** Finds a remembered hero whose drawing has (almost) the same silhouette. */
export async function recallHero(fp?: string): Promise<HeroMemory | undefined> {
  if (!fp) return undefined;
  const all = await load();
  if (fp === 'demo') return all.find((m) => m.fp === 'demo');
  let best: HeroMemory | undefined;
  let bestD = MAX_DISTANCE;
  for (const m of all) {
    const d = distance(fp, m.fp);
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

export async function rememberStory(fp: string | undefined, card: HeroMemory['card'], story: { title?: string; friend?: string; drawn?: string[] }): Promise<void> {
  if (!fp) return;
  const all = await load();
  let m = all.find((x) => x.fp === fp) ?? (fp === 'demo' ? undefined : all.find((x) => distance(fp, x.fp) <= MAX_DISTANCE));
  if (!m) {
    m = { fp, card, titles: [], friends: [], drawn: [], lastSeen: Date.now() };
    all.push(m);
  }
  m.card = card;
  m.lastSeen = Date.now();
  if (story.title) m.titles = [...m.titles, story.title].slice(-5);
  if (story.friend && !m.friends.includes(story.friend)) m.friends = [...m.friends, story.friend].slice(-4);
  for (const d of story.drawn ?? []) if (!m.drawn.includes(d)) m.drawn = [...m.drawn, d].slice(-6);
  if (all.length > 500) all.sort((a, b) => b.lastSeen - a.lastSeen).splice(500);
  await persist(m);
}
