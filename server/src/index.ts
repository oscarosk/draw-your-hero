import http from 'node:http';
import path from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { ensureMediaDir, startMediaCleanup } from './media.js';
import { attachPhone, attachTv, receiveDrawing, roomExists, startRoomCleanup } from './rooms.js';
import { bookUrl, loadBook } from './books.js';
import { contentType, getObject } from './storage.js';

const app = express();
app.disable('x-powered-by');

// Allow the TV web build (different origin) to load media and call the API.
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode: config.mode, imageMode: config.imageMode });
});

// Phone page: /p/ABCD
app.get('/p/:code', (req, res) => {
  if (!roomExists(req.params.code)) {
    res.status(404).sendFile(path.join(config.publicDir, 'phone', 'not-found.html'));
    return;
  }
  res.sendFile(path.join(config.publicDir, 'phone', 'index.html'));
});
app.use('/phone', express.static(path.join(config.publicDir, 'phone'), { maxAge: '5m' }));
app.use('/static', express.static(config.assetsDir, { maxAge: '1h' }));
// Drawings, narration and photos (S3 on AWS, local disk otherwise).
app.get('/media/:name', async (req, res) => {
  try {
    const data = await getObject(req.params.name);
    if (!data || req.params.name.startsWith('book-')) {
      res.sendStatus(404);
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type(contentType(req.params.name)).send(data);
  } catch (e) {
    console.warn('[media]', (e as Error).message);
    res.sendStatus(502);
  }
});

// The TV app's web build (built with `yarn build:tv-web`), so anyone can try the
// TV experience in a browser at this server's address. Arrow keys + Enter = remote.
app.use(express.static(path.join(config.publicDir, 'tv'), { maxAge: '5m' }));

// Storybook keepsake: /book/<id> (private link, deleted with the media after 24 h).
app.get('/book/:id', async (req, res) => {
  if (!(await loadBook(req.params.id))) {
    res.status(404).sendFile(path.join(config.publicDir, 'book', 'gone.html'));
    return;
  }
  res.sendFile(path.join(config.publicDir, 'book', 'index.html'));
});
app.use('/book-assets', express.static(path.join(config.publicDir, 'book'), { maxAge: '5m' }));
app.get('/api/books/:id', async (req, res) => {
  const book = await loadBook(req.params.id);
  if (!book) {
    res.sendStatus(404);
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(book);
});
app.get('/qr/book/:id.png', async (req, res) => {
  if (!(await loadBook(req.params.id))) {
    res.sendStatus(404);
    return;
  }
  const png = await QRCode.toBuffer(bookUrl(req.params.id), { width: 360, margin: 1, color: { dark: '#1B1640', light: '#FFF8E7' } });
  res.type('png').send(png);
});

// QR code the TV shows; it encodes the phone join URL.
app.get('/qr/:code.png', async (req, res) => {
  const code = req.params.code.toUpperCase();
  if (!roomExists(code)) {
    res.sendStatus(404);
    return;
  }
  const png = await QRCode.toBuffer(`${config.publicUrl}/p/${code}`, {
    width: 520,
    margin: 1,
    color: { dark: '#1B1640', light: '#FFF8E7' },
  });
  res.type('png').send(png);
});

// Drawing upload from the phone (PNG data URL of the cut-out drawing).
app.post('/api/rooms/:code/drawing', express.json({ limit: '8mb' }), async (req, res) => {
  const dataUrl: unknown = req.body?.image;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    res.status(400).json({ error: 'Expected a PNG image' });
    return;
  }
  const png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (png.length > 6 * 1024 * 1024) {
    res.status(413).json({ error: 'Image too large' });
    return;
  }
  try {
    res.json({ ok: true });
    // Optional: the original paper photo (small JPEG) and where the drawing sits in it.
    const photoUrl: unknown = req.body?.photo;
    const crop: unknown = req.body?.crop;
    const aspect: unknown = req.body?.photoAspect;
    const photo =
      typeof photoUrl === 'string' && photoUrl.startsWith('data:image/jpeg;base64,') && photoUrl.length < 1_500_000
        ? Buffer.from(photoUrl.slice('data:image/jpeg;base64,'.length), 'base64')
        : undefined;
    const cropOk = Array.isArray(crop) && crop.length === 4 && crop.every((n) => typeof n === 'number' && n >= 0 && n <= 1);
    await receiveDrawing(req.params.code, png, typeof req.body?.fingerprint === 'string' ? req.body.fingerprint : undefined, photo && cropOk && typeof aspect === 'number' && aspect > 0.2 && aspect < 5 ? { photo, crop: crop as [number, number, number, number], aspect } : undefined);
  } catch (e) {
    console.warn('[drawing]', (e as Error).message);
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname !== '/ws/tv' && url.pathname !== '/ws/phone') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname === '/ws/tv') {
      attachTv(ws, url.searchParams.get('code') || undefined);
    } else {
      const code = url.searchParams.get('code') || '';
      if (!attachPhone(ws, code)) {
        ws.send(JSON.stringify({ t: 'error', message: 'That code was not found. Check the code on your TV.' }));
        ws.close();
      }
    }
  });
});

// Keep connections alive through proxies and tunnels.
setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.ping();
  }
}, 25000).unref();

await ensureMediaDir();
startMediaCleanup();
startRoomCleanup();

server.listen(config.port, () => {
  console.log(`Draw Your Hero story service on http://localhost:${config.port}`);
  console.log(`  mode=${config.mode} imageMode=${config.imageMode} region=${config.region} publicUrl=${config.publicUrl}`);
});
