// Small effect sprites the TV animates on top of the scenes.
import { rng, cloud } from './lib.mjs';

const rad = (id, stops) =>
  `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

function star4(cx, cy, L, w, color) {
  return `<path d="M${cx},${cy - L} Q${cx + w},${cy - w} ${cx + L},${cy} Q${cx + w},${cy + w} ${cx},${cy + L} Q${cx - w},${cy + w} ${cx - L},${cy} Q${cx - w},${cy - w} ${cx},${cy - L} Z" fill="${color}"/>`;
}

function cloudSprite(seed, w) {
  const r = rng(seed);
  return { w, h: Math.round(w * 0.62), body: cloud(r, w / 2, w * 0.44, w * 0.86, { color: '#FFFFFF', shade: '#E2EAF6' }) };
}

const sprites = {
  glow: { w: 256, h: 256, defs: rad('g', [[0, '#FFFFFF', 1], [0.3, '#FFFFFF', 0.5], [1, '#FFFFFF', 0]]), body: '<circle cx="128" cy="128" r="128" fill="url(#g)"/>' },
  warmglow: { w: 256, h: 256, defs: rad('g', [[0, '#FFF2B0', 1], [0.35, '#FFD86B', 0.45], [1, '#FFB347', 0]]), body: '<circle cx="128" cy="128" r="128" fill="url(#g)"/>' },
  firefly: { w: 96, h: 96, defs: rad('g', [[0, '#FFFFE0', 1], [0.18, '#F4FF8A', 0.95], [0.45, '#C8F25A', 0.35], [1, '#C8F25A', 0]]), body: '<circle cx="48" cy="48" r="48" fill="url(#g)"/>' },
  ember: { w: 64, h: 64, defs: rad('g', [[0, '#FFF3C4', 1], [0.25, '#FFB347', 0.9], [0.6, '#FF6B3D', 0.3], [1, '#FF6B3D', 0]]), body: '<circle cx="32" cy="32" r="32" fill="url(#g)"/>' },
  snowflake: { w: 64, h: 64, defs: rad('g', [[0, '#FFFFFF', 1], [0.45, '#FFFFFF', 0.85], [1, '#FFFFFF', 0]]), body: '<circle cx="32" cy="32" r="32" fill="url(#g)"/>' },
  dust: { w: 48, h: 48, defs: rad('g', [[0, '#FFF6DA', 0.9], [1, '#FFF6DA', 0]]), body: '<circle cx="24" cy="24" r="24" fill="url(#g)"/>' },
  sparkle: {
    w: 160,
    h: 160,
    defs: rad('g', [[0, '#FFFFFF', 0.9], [0.4, '#FFF4B8', 0.3], [1, '#FFF4B8', 0]]),
    body: `<circle cx="80" cy="80" r="80" fill="url(#g)"/>${star4(80, 80, 72, 7, '#FFFFFF')}${star4(80, 80, 30, 4, '#FFF7CC')}`,
  },
  twinkle: {
    w: 96,
    h: 96,
    defs: rad('g', [[0, '#FFFFFF', 0.8], [1, '#FFFFFF', 0]]),
    body: `<circle cx="48" cy="48" r="26" fill="url(#g)"/>${star4(48, 48, 44, 4, '#FFFBEA')}`,
  },
  bubble: {
    w: 128,
    h: 128,
    defs: rad('g', [[0, '#FFFFFF', 0], [0.82, '#E9FBFF', 0.12], [0.96, '#FFFFFF', 0.75], [1, '#FFFFFF', 0]]),
    body: '<circle cx="64" cy="64" r="62" fill="url(#g)"/><ellipse cx="44" cy="40" rx="16" ry="10" fill="#FFFFFF" opacity="0.85" transform="rotate(-35 44 40)"/><circle cx="86" cy="88" r="5" fill="#FFFFFF" opacity="0.5"/>',
  },
  leaf: {
    w: 96,
    h: 96,
    body: '<g transform="translate(48,48) rotate(-30)"><path d="M-36,0 C-20,-26 20,-26 36,0 C20,26 -20,26 -36,0 Z" fill="#7CC66B"/><path d="M-36,0 C-20,-26 20,-26 36,0 Z" fill="#9AD87F"/><path d="M-34,0 L34,0" stroke="#4F9A4A" stroke-width="3"/></g>',
  },
  petal: {
    w: 64,
    h: 64,
    body: '<g transform="translate(32,32) rotate(20)"><path d="M0,-24 C18,-14 18,14 0,24 C-18,14 -18,-14 0,-24 Z" fill="#FFB3CE"/><path d="M0,-24 C10,-14 10,6 0,18 Z" fill="#FFD3E2"/></g>',
  },
  rays: {
    w: 1200,
    h: 1200,
    defs: rad('fade', [[0, '#FFFFFF', 1], [0.25, '#FFFFFF', 0.85], [1, '#FFFFFF', 0]]) + '<mask id="m"><rect width="1200" height="1200" fill="url(#fade)"/></mask>',
    body: `<g mask="url(#m)">${Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const b = a + Math.PI / 18;
      const R = 640;
      return `<path d="M600,600 L${600 + Math.cos(a) * R},${600 + Math.sin(a) * R} L${600 + Math.cos(b) * R},${600 + Math.sin(b) * R} Z" fill="#FFFFFF" opacity="0.8"/>`;
    }).join('')}</g>`,
  },
  shaft: {
    w: 360,
    h: 1200,
    defs: '<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.7"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="1"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient><mask id="m"><rect width="360" height="1200" fill="url(#h)"/></mask>',
    body: '<g mask="url(#m)"><path d="M120,0 L240,0 L360,1200 L0,1200 Z" fill="url(#v)"/></g>',
  },
  vignette: {
    w: 960,
    h: 540,
    defs: '<radialGradient id="g" cx="0.5" cy="0.48" r="0.75"><stop offset="0.55" stop-color="#0B0820" stop-opacity="0"/><stop offset="1" stop-color="#0B0820" stop-opacity="0.55"/></radialGradient>',
    body: '<rect width="960" height="540" fill="url(#g)"/>',
  },
  shimmer: {
    w: 240,
    h: 1000,
    defs: '<linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.65"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>',
    body: '<rect width="240" height="1000" fill="url(#h)"/>',
  },
  raindrop: {
    w: 16,
    h: 96,
    defs: '<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#E6F4FF" stop-opacity="0.9"/></linearGradient>',
    body: '<rect x="5" y="0" width="6" height="96" rx="3" fill="url(#r)"/>',
  },
  fog: {
    w: 800,
    h: 260,
    defs: '<radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.35"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>',
    body: '<ellipse cx="400" cy="130" rx="400" ry="130" fill="url(#g)"/>',
  },
  cloud1: cloudSprite(11, 640),
  cloud2: cloudSprite(23, 520),
  cloud3: cloudSprite(37, 420),
};

export default sprites;
