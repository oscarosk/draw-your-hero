// Renders the painted scenes and effect sprites to server/assets.
// Usage: node render.mjs [settingName ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import scenes from './scenes.mjs';
import { rng, W, H, MARGIN } from './lib.mjs';
import sprites from './sprites.mjs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/npm-tools/node_modules/playwright'));
}

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, '../../server/assets');
const SCALE = 0.8; // layers are soft paintings; 80% resolution keeps downloads small

// Paper grain + gentle painterly softening, applied to every painted layer.
const TEXTURE = `
<filter id="paint" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="4" result="noise"/>
  <feColorMatrix in="noise" type="saturate" values="0" result="gray"/>
  <feComponentTransfer in="gray" result="soft"><feFuncR type="linear" slope="0.5" intercept="0.25"/><feFuncG type="linear" slope="0.5" intercept="0.25"/><feFuncB type="linear" slope="0.5" intercept="0.25"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>
  <feBlend in="SourceGraphic" in2="soft" mode="soft-light" result="tex"/>
  <feComposite in="tex" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="haze" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation="1.6"/></filter>`;

function doc(layer, { wide, blur, mirror = false, tint = '' }) {
  const x0 = wide ? -MARGIN : 0;
  const w = wide ? W + 2 * MARGIN : W;
  const flip = mirror ? `transform="translate(${W},0) scale(-1,1)"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} 0 ${w} ${H}" width="${Math.round(w * SCALE)}" height="${Math.round(H * SCALE)}"${tint ? ` style="filter:${tint}"` : ''}><defs>${TEXTURE}${layer.defs.join('')}</defs><g ${flip}><g ${blur ? 'filter="url(#haze)"' : ''}>${layer.body.join('')}</g></g></svg>`;
}

async function shot(page, svg, file, { w, h, jpeg }) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: file, omitBackground: !jpeg, type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 84 : undefined, clip: { x: 0, y: 0, width: w, height: h } });
}

const only = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();

const VARIANTS = [0, 1, 2];
for (const [name, build] of Object.entries(scenes)) for (const variant of VARIANTS) {
  if (only.length && !only.includes(name) && !only.includes('scenes')) continue;
  // Variant 0 keeps the original painting; 1 and 2 are new arrangements of the same place.
  const r = rng([...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 31 + variant * 7919);
  const layers = build(r);
  const dir = variant ? path.join(outRoot, 'scenes', name, `v${variant}`) : path.join(outRoot, 'scenes', name);
  await fs.mkdir(dir, { recursive: true });
  const sw = Math.round(W * SCALE);
  const lw = Math.round((W + 2 * MARGIN) * SCALE);
  const lh = Math.round(H * SCALE);
  // v1: the whole place mirrored, a little warmer. v2: sky mirrored over the
  // same ground, cooler and more vivid. Together with the TV's time-of-day
  // colouring and weather, the same place rarely looks the same twice.
  const look = [
    { skyMirror: false, mirror: false, tint: '' },
    { skyMirror: true, mirror: true, tint: 'hue-rotate(-14deg) saturate(1.08)' },
    { skyMirror: true, mirror: false, tint: 'hue-rotate(16deg) saturate(1.18) brightness(1.03)' },
  ][variant];
  await shot(page, doc(layers.sky, { wide: false, mirror: look.skyMirror, tint: look.tint }), path.join(dir, 'sky.jpg'), { w: sw, h: lh, jpeg: true });
  await shot(page, doc(layers.far, { wide: true, blur: true, mirror: look.mirror, tint: look.tint }), path.join(dir, 'far.png'), { w: lw, h: lh });
  await shot(page, doc(layers.mid, { wide: true, mirror: look.mirror, tint: look.tint }), path.join(dir, 'mid.png'), { w: lw, h: lh });
  await shot(page, doc(layers.front, { wide: true, mirror: look.mirror, tint: look.tint }), path.join(dir, 'front.png'), { w: lw, h: lh });

  // Flattened preview (what the TV shows at rest), for checking and for the README.
  const img = (f, wide) => `<img src="file://${path.join(dir, f)}" style="position:absolute;top:0;left:${wide ? -MARGIN * SCALE : 0}px;width:${wide ? lw : sw}px;height:${lh}px">`;
  await page.setViewportSize({ width: sw, height: lh });
  await page.goto(`file://${dir}/`);
  await page.setContent(`<html><body style="margin:0;position:relative;width:${sw}px;height:${lh}px;overflow:hidden">${img('sky.jpg')}${img('far.png', true)}${img('mid.png', true)}${img('front.png', true)}</body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(dir, 'preview.jpg'), type: 'jpeg', quality: 80 });
  console.log('scene', name, variant);
}

if (!only.length || only.includes('sprites')) {
  const dir = path.join(outRoot, 'fx');
  await fs.mkdir(dir, { recursive: true });
  for (const [name, sp] of Object.entries(sprites)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sp.w} ${sp.h}" width="${sp.w}" height="${sp.h}"><defs>${sp.defs || ''}</defs>${sp.body}</svg>`;
    await shot(page, svg, path.join(dir, `${name}.png`), { w: sp.w, h: sp.h });
    console.log('sprite', name);
  }
}

await browser.close();
