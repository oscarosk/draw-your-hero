// Drawing primitives for the painted picture-book scenes. Everything is plain
// SVG authored in 1920x1080 screen coordinates; layers extend 140px past each
// side so the TV can drift them for parallax.

export const W = 1920;
export const H = 1080;
export const MARGIN = 140;
export const LX0 = -MARGIN - 40;
export const LX1 = W + MARGIN + 40;

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s % 1000003) / 1000003;
  };
}

export const f = (n) => Math.round(n * 10) / 10;

/** Smooth Catmull-Rom curve through points, as SVG path commands (without M). */
export function curveThrough(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

export function closedBlob(pts) {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

/** Rolling ridge line filled down to the bottom of the frame. */
export function ridge(r, { y, amp = 60, freq = 0.004, jag = 0, step = 60, fill, bottom = H + 20, x0 = LX0, x1 = LX1, extra = '' }) {
  const p1 = r() * 10;
  const p2 = r() * 10;
  const pts = [];
  for (let x = x0; x <= x1 + step; x += step) {
    const yy = y + amp * (0.62 * Math.sin(x * freq + p1) + 0.38 * Math.sin(x * freq * 2.7 + p2)) + (jag ? (r() - 0.5) * jag : 0);
    pts.push([x, yy]);
  }
  const d = `M${f(x0)},${f(bottom)} L${f(pts[0][0])},${f(pts[0][1])}` + curveThrough(pts) + ` L${f(pts[pts.length - 1][0])},${f(bottom)} Z`;
  return { svg: `<path d="${d}" fill="${fill}" ${extra}/>`, at: (x) => sample(pts, x) };
}

function sample(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i][0] && x <= pts[i + 1][0]) {
      const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

export function linear(id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</linearGradient>`;
}

export function radial(id, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = {}) {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fx !== undefined ? ` fx="${fx}" fy="${fy}"` : ''}>${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</radialGradient>`;
}

export function glow(cx, cy, rad, color, opacity = 1, id) {
  return {
    def: radial(id, [
      [0, color, opacity],
      [0.35, color, opacity * 0.45],
      [1, color, 0],
    ]),
    svg: `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="url(#${id})"/>`,
  };
}

// ---------------------------------------------------------------------------
// Nature
// ---------------------------------------------------------------------------

export function roundTree(r, x, gy, h, { leaf, leafLight, leafDark, trunk = '#6B4A31', trunkDark = '#4E3423' }) {
  const tw = h * 0.09;
  const crownR = h * 0.3;
  const cy = gy - h + crownR;
  let s = `<path d="M${f(x - tw / 2)},${f(gy)} Q${f(x - tw * 0.3)},${f(gy - h * 0.4)} ${f(x - tw * 0.25)},${f(cy + crownR * 0.4)} L${f(x + tw * 0.25)},${f(cy + crownR * 0.4)} Q${f(x + tw * 0.3)},${f(gy - h * 0.4)} ${f(x + tw / 2)},${f(gy)} Z" fill="${trunk}"/>`;
  s += `<path d="M${f(x + tw * 0.05)},${f(gy)} Q${f(x + tw * 0.15)},${f(gy - h * 0.4)} ${f(x + tw * 0.2)},${f(cy + crownR * 0.4)} L${f(x + tw * 0.25)},${f(cy + crownR * 0.4)} Q${f(x + tw * 0.3)},${f(gy - h * 0.4)} ${f(x + tw / 2)},${f(gy)} Z" fill="${trunkDark}" opacity="0.6"/>`;
  const blobs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r();
    const d = crownR * (0.35 + r() * 0.25);
    blobs.push([x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, crownR * (0.55 + r() * 0.2)]);
  }
  blobs.push([x, cy, crownR * 0.75]);
  s += blobs.map(([bx, by, br]) => `<circle cx="${f(bx)}" cy="${f(by + br * 0.12)}" r="${f(br)}" fill="${leafDark}"/>`).join('');
  s += blobs.map(([bx, by, br]) => `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(br * 0.96)}" fill="${leaf}"/>`).join('');
  s += blobs
    .filter((b) => b[1] < cy + crownR * 0.1)
    .map(([bx, by, br]) => `<circle cx="${f(bx - br * 0.22)}" cy="${f(by - br * 0.25)}" r="${f(br * 0.55)}" fill="${leafLight}" opacity="0.75"/>`)
    .join('');
  return s;
}

export function pine(r, x, gy, h, { leaf, leafDark, snow, trunk = '#5A3E2B' }) {
  const w = h * 0.42;
  let s = `<rect x="${f(x - h * 0.03)}" y="${f(gy - h * 0.18)}" width="${f(h * 0.06)}" height="${f(h * 0.2)}" fill="${trunk}" rx="3"/>`;
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const top = gy - h + t * h * 0.62;
    const bot = top + h * 0.38;
    const ww = w * (0.45 + t * 0.55) * (0.95 + r() * 0.1);
    const d = `M${f(x)},${f(top)} Q${f(x - ww * 0.35)},${f(top + (bot - top) * 0.55)} ${f(x - ww / 2)},${f(bot)} Q${f(x)},${f(bot + 14)} ${f(x + ww / 2)},${f(bot)} Q${f(x + ww * 0.35)},${f(top + (bot - top) * 0.55)} ${f(x)},${f(top)} Z`;
    s += `<path d="${d}" fill="${leaf}"/>`;
    s += `<path d="M${f(x)},${f(top)} Q${f(x + ww * 0.35)},${f(top + (bot - top) * 0.55)} ${f(x + ww / 2)},${f(bot)} Q${f(x + ww * 0.25)},${f(bot + 8)} ${f(x + ww * 0.08)},${f(bot + 6)} Z" fill="${leafDark}" opacity="0.7"/>`;
    if (snow) {
      s += `<path d="M${f(x)},${f(top + 2)} Q${f(x - ww * 0.22)},${f(top + (bot - top) * 0.4)} ${f(x - ww * 0.34)},${f(top + (bot - top) * 0.62)} Q${f(x - ww * 0.1)},${f(top + (bot - top) * 0.5)} ${f(x)},${f(top + (bot - top) * 0.58)} Q${f(x + ww * 0.12)},${f(top + (bot - top) * 0.48)} ${f(x + ww * 0.3)},${f(top + (bot - top) * 0.6)} Q${f(x + ww * 0.2)},${f(top + (bot - top) * 0.38)} ${f(x)},${f(top + 2)} Z" fill="${snow}"/>`;
    }
  }
  return s;
}

export function palm(r, x, gy, h, lean, { trunk = '#A47148', trunkDark = '#7E5333', leaf = '#3E9B4F', leafDark = '#2C7A3D' }) {
  const tx = x + lean;
  const ty = gy - h;
  let s = `<path d="M${f(x - 16)},${f(gy)} Q${f(x + lean * 0.2)},${f(gy - h * 0.55)} ${f(tx - 8)},${f(ty)} L${f(tx + 8)},${f(ty)} Q${f(x + lean * 0.2 + 22)},${f(gy - h * 0.55)} ${f(x + 16)},${f(gy)} Z" fill="${trunk}"/>`;
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const px = x + (tx - x) * t * t * 0.9 + lean * 0.2 * Math.sin(t * Math.PI) * 0.5;
    const py = gy - h * t;
    s += `<path d="M${f(px - 15 + t * 6)},${f(py)} q${f(15)},${f(-8)} ${f(30 - t * 12)},0" stroke="${trunkDark}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>`;
  }
  const fronds = [-160, -125, -90, -55, -20, 15, 200];
  for (const deg of fronds) {
    const a = ((deg + (r() - 0.5) * 16) * Math.PI) / 180;
    const len = h * (0.42 + r() * 0.1);
    const ex = tx + Math.cos(a) * len;
    const ey = ty + Math.sin(a) * len * 0.55 + len * 0.28;
    const mx = tx + Math.cos(a) * len * 0.5;
    const my = ty + Math.sin(a) * len * 0.5 - len * 0.12;
    const nx = -Math.sin(a) * 26;
    const ny = Math.cos(a) * 26;
    s += `<path d="M${f(tx)},${f(ty)} Q${f(mx + nx)},${f(my + ny)} ${f(ex)},${f(ey)} Q${f(mx - nx * 0.6)},${f(my - ny * 0.6)} ${f(tx)},${f(ty)} Z" fill="${leafDark}"/>`;
    s += `<path d="M${f(tx)},${f(ty - 4)} Q${f(mx + nx * 0.7)},${f(my + ny * 0.7 - 6)} ${f(ex)},${f(ey - 4)} Q${f(mx)},${f(my - 4)} ${f(tx)},${f(ty - 4)} Z" fill="${leaf}"/>`;
  }
  s += `<circle cx="${f(tx - 10)}" cy="${f(ty + 14)}" r="13" fill="#6B4A2E"/><circle cx="${f(tx + 12)}" cy="${f(ty + 18)}" r="12" fill="#5C3F27"/>`;
  return s;
}

export function bigLeaf(x, y, angle, scale, color, vein, flip = 1) {
  const d = `M0,0 C${40 * flip},-70 ${150 * flip},-90 ${260 * flip},-20 C${160 * flip},40 ${60 * flip},50 0,0 Z`;
  return `<g transform="translate(${f(x)},${f(y)}) rotate(${f(angle)}) scale(${f(scale)})"><path d="${d}" fill="${color}"/><path d="M0,0 Q${120 * flip},-30 ${250 * flip},-20" stroke="${vein}" stroke-width="5" fill="none" opacity="0.6"/>${[0.3, 0.5, 0.7]
    .map((t) => `<path d="M${f(t * 250 * flip)},${f(-t * 22)} l${f(-25 * flip)},-28 M${f(t * 250 * flip)},${f(-t * 22)} l${f(-22 * flip)},22" stroke="${vein}" stroke-width="3" fill="none" opacity="0.4"/>`)
    .join('')}</g>`;
}

export function grassTufts(r, x0, x1, y, { color, light, h = 50, density = 0.12 }) {
  let s = '';
  for (let x = x0; x < x1; x += 1 / density) {
    const xx = x + (r() - 0.5) * 8;
    const hh = h * (0.6 + r() * 0.7);
    const blades = 3 + Math.floor(r() * 3);
    for (let b = 0; b < blades; b++) {
      const dx = (b - blades / 2) * 7 + (r() - 0.5) * 5;
      const lean = (r() - 0.5) * hh * 0.8;
      s += `<path d="M${f(xx + dx - 4)},${f(y + 4)} Q${f(xx + dx + lean * 0.3)},${f(y - hh * 0.5)} ${f(xx + dx + lean)},${f(y - hh)} Q${f(xx + dx + lean * 0.2 + 3)},${f(y - hh * 0.45)} ${f(xx + dx + 5)},${f(y + 4)} Z" fill="${b % 2 ? light : color}"/>`;
    }
  }
  return s;
}

export function flower(x, y, size, petal, center = '#FFD23F') {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    s += `<circle cx="${f(x + Math.cos(a) * size * 0.55)}" cy="${f(y + Math.sin(a) * size * 0.55)}" r="${f(size * 0.48)}" fill="${petal}"/>`;
  }
  return s + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size * 0.36)}" fill="${center}"/>`;
}

export function cloud(r, x, y, w, { color = '#FFFFFF', shade = '#DCE7F5', opacity = 1 }) {
  const h = w * 0.36;
  const bumps = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const bw = w * (0.18 + r() * 0.14) * (1 - Math.abs(t - 0.5) * 0.9);
    bumps.push([x + (t - 0.5) * w * 0.9, y - bw * 0.35 - Math.sin(t * Math.PI) * h * 0.35, bw]);
  }
  let s = `<g opacity="${opacity}">`;
  s += `<ellipse cx="${f(x)}" cy="${f(y + h * 0.18)}" rx="${f(w * 0.5)}" ry="${f(h * 0.3)}" fill="${shade}"/>`;
  s += bumps.map(([bx, by, br]) => `<circle cx="${f(bx)}" cy="${f(by + br * 0.18)}" r="${f(br)}" fill="${shade}"/>`).join('');
  s += bumps.map(([bx, by, br]) => `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(br * 0.94)}" fill="${color}"/>`).join('');
  s += `<ellipse cx="${f(x)}" cy="${f(y + h * 0.05)}" rx="${f(w * 0.46)}" ry="${f(h * 0.24)}" fill="${color}"/>`;
  return s + '</g>';
}

export function mountain(r, x, gy, w, h, { color, shade, snow }) {
  const pts = [[x - w / 2, gy]];
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const peak = 1 - Math.abs(t - 0.5) * 2;
    pts.push([x - w / 2 + w * t + (r() - 0.5) * w * 0.04, gy - h * Math.pow(peak, 0.9) * (0.88 + r() * 0.12)]);
  }
  pts.push([x + w / 2, gy]);
  const top = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  const poly = pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  let s = `<polygon points="${poly}" fill="${color}" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>`;
  s += `<polygon points="${f(top[0])},${f(top[1])} ${f(x + w / 2)},${f(gy)} ${f(top[0] + w * 0.04)},${f(gy)}" fill="${shade}" opacity="0.55"/>`;
  if (snow) {
    const sh = h * 0.28;
    s += `<path d="M${f(top[0])},${f(top[1])} L${f(top[0] - sh * 0.9)},${f(top[1] + sh)} l${f(sh * 0.3)},${f(-sh * 0.18)} l${f(sh * 0.3)},${f(sh * 0.2)} l${f(sh * 0.32)},${f(-sh * 0.24)} l${f(sh * 0.34)},${f(sh * 0.18)} l${f(sh * 0.3)},${f(-sh * 0.12)} L${f(top[0])},${f(top[1])} Z" fill="${snow}" stroke="${snow}" stroke-width="4" stroke-linejoin="round"/>`;
  }
  return s;
}

export function rock(r, x, y, w, h, color, light) {
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    pts.push([x + Math.cos(a) * w * 0.5 * (0.85 + r() * 0.2), y + Math.sin(a) * h * (0.8 + r() * 0.25)]);
  }
  pts.push([x + w * 0.5, y + 6], [x - w * 0.5, y + 6]);
  let s = `<path d="${closedBlob(pts)}" fill="${color}"/>`;
  if (light) s += `<ellipse cx="${f(x - w * 0.14)}" cy="${f(y - h * 0.55)}" rx="${f(w * 0.22)}" ry="${f(h * 0.18)}" fill="${light}" opacity="0.5"/>`;
  return s;
}

export function cactus(x, gy, h, color, dark) {
  const w = h * 0.16;
  let s = `<path d="M${f(x)},${f(gy)} L${f(x)},${f(gy - h + w / 2)}" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
  s += `<path d="M${f(x - w * 0.15)},${f(gy - h * 0.35)} q${f(-w * 1.6)},0 ${f(-w * 1.6)},${f(-h * 0.3)}" stroke="${color}" stroke-width="${f(w * 0.75)}" stroke-linecap="round" fill="none"/>`;
  s += `<path d="M${f(x + w * 0.15)},${f(gy - h * 0.5)} q${f(w * 1.4)},0 ${f(w * 1.4)},${f(-h * 0.24)}" stroke="${color}" stroke-width="${f(w * 0.7)}" stroke-linecap="round" fill="none"/>`;
  s += `<path d="M${f(x + w * 0.18)},${f(gy)} L${f(x + w * 0.18)},${f(gy - h + w * 0.7)}" stroke="${dark}" stroke-width="${f(w * 0.25)}" stroke-linecap="round" opacity="0.5"/>`;
  return s;
}

export function building(r, x, gy, w, h, { color, shade, win, lit, roof }) {
  let s = `<rect x="${f(x)}" y="${f(gy - h)}" width="${f(w)}" height="${f(h + 10)}" fill="${color}" rx="6"/>`;
  s += `<rect x="${f(x + w * 0.78)}" y="${f(gy - h)}" width="${f(w * 0.22)}" height="${f(h + 10)}" fill="${shade}" opacity="0.5"/>`;
  if (roof === 'peak') s += `<polygon points="${f(x - 8)},${f(gy - h + 2)} ${f(x + w / 2)},${f(gy - h - w * 0.4)} ${f(x + w + 8)},${f(gy - h + 2)}" fill="${shade}"/>`;
  if (roof === 'dome') s += `<path d="M${f(x + w * 0.15)},${f(gy - h + 2)} a${f(w * 0.35)},${f(w * 0.35)} 0 0 1 ${f(w * 0.7)},0 Z" fill="${shade}"/>`;
  if (roof === 'antenna') s += `<rect x="${f(x + w / 2 - 3)}" y="${f(gy - h - 60)}" width="6" height="60" fill="${shade}"/><circle cx="${f(x + w / 2)}" cy="${f(gy - h - 62)}" r="7" fill="#FF6B6B"/>`;
  const cols = Math.max(2, Math.floor(w / 46));
  const rows = Math.max(2, Math.floor(h / 64));
  const cw = (w - 24) / cols;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const on = r() < 0.55;
      s += `<rect x="${f(x + 12 + j * cw + cw * 0.18)}" y="${f(gy - h + 26 + i * 62)}" width="${f(cw * 0.64)}" height="34" rx="5" fill="${on ? lit : win}"/>`;
    }
  }
  return s;
}

export function castle(x, gy, sc, { wall = '#EDE3FA', wallShade = '#CBBCE8', roof = '#8B6CD6', roofDark = '#6E52B8', flag = '#FF6B6B', win = '#6E52B8', glowWin = '#FFE38A' }) {
  const g = (inner) => `<g transform="translate(${f(x)},${f(gy)}) scale(${f(sc)})">${inner}</g>`;
  let s = '';
  // keep wall
  s += `<rect x="-200" y="-260" width="400" height="270" fill="${wall}"/>`;
  s += `<rect x="120" y="-260" width="80" height="270" fill="${wallShade}" opacity="0.6"/>`;
  for (let i = 0; i < 8; i++) s += `<rect x="${-200 + i * 52}" y="-290" width="30" height="34" fill="${wall}"/>`;
  // towers
  const tower = (tx, tw, th) => {
    let t = `<rect x="${tx - tw / 2}" y="${-th}" width="${tw}" height="${th + 10}" fill="${wall}"/>`;
    t += `<rect x="${tx + tw * 0.22}" y="${-th}" width="${tw * 0.28}" height="${th + 10}" fill="${wallShade}" opacity="0.7"/>`;
    t += `<path d="M${tx - tw / 2 - 16},${-th} L${tx},${-th - tw * 1.35} L${tx + tw / 2 + 16},${-th} Z" fill="${roof}"/>`;
    t += `<path d="M${tx},${-th - tw * 1.35} L${tx + tw / 2 + 16},${-th} L${tx + 8},${-th} Z" fill="${roofDark}"/>`;
    t += `<rect x="${tx - 2}" y="${-th - tw * 1.35 - 70}" width="5" height="72" fill="#7A5233"/>`;
    t += `<path d="M${tx + 3},${-th - tw * 1.35 - 70} q30,8 56,0 q-12,14 0,28 q-26,-8 -56,0 Z" fill="${flag}"/>`;
    t += `<path d="M${tx - 14},${-th * 0.62} a14,14 0 0 1 28,0 v34 h-28 Z" fill="${glowWin}"/>`;
    return t;
  };
  s += tower(-230, 120, 420) + tower(230, 120, 420) + tower(0, 150, 520);
  s += `<path d="M-60,10 v-110 a60,60 0 0 1 120,0 v110 Z" fill="${win}"/>`;
  s += `<path d="M-48,10 v-100 a48,48 0 0 1 96,0 v100 Z" fill="#4A3580"/>`;
  for (const wx of [-140, 110]) s += `<path d="M${wx},-150 a15,15 0 0 1 30,0 v40 h-30 Z" fill="${glowWin}"/>`;
  return g(s);
}

export function crystal(x, gy, h, w, angle, { light, mid, dark }) {
  const pts = [
    [0, 0],
    [-w / 2, -h * 0.12],
    [-w / 2, -h * 0.78],
    [0, -h],
    [w / 2, -h * 0.78],
    [w / 2, -h * 0.12],
  ];
  const poly = (ps) => ps.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  return `<g transform="translate(${f(x)},${f(gy)}) rotate(${f(angle)})"><polygon points="${poly(pts)}" fill="${mid}"/><polygon points="${poly([
    [0, 0],
    [0, -h],
    [w / 2, -h * 0.78],
    [w / 2, -h * 0.12],
  ])}" fill="${dark}"/><polygon points="${poly([
    [-w / 2, -h * 0.78],
    [0, -h],
    [-w * 0.1, -h * 0.72],
    [-w * 0.3, -h * 0.2],
  ])}" fill="${light}" opacity="0.8"/></g>`;
}

export function coral(r, x, gy, h, color, depth = 4) {
  let s = '';
  const branch = (bx, by, len, ang, wid, d) => {
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    const mx = (bx + ex) / 2 + (r() - 0.5) * len * 0.3;
    const my = (by + ey) / 2;
    s += `<path d="M${f(bx)},${f(by)} Q${f(mx)},${f(my)} ${f(ex)},${f(ey)}" stroke="${color}" stroke-width="${f(wid)}" stroke-linecap="round" fill="none"/>`;
    if (d > 0) {
      branch(ex, ey, len * 0.72, ang - 0.45 - r() * 0.2, wid * 0.75, d - 1);
      branch(ex, ey, len * 0.72, ang + 0.45 + r() * 0.2, wid * 0.75, d - 1);
    } else {
      s += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(wid * 0.75)}" fill="${color}"/>`;
    }
  };
  branch(x, gy, h * 0.32, -Math.PI / 2, h * 0.08, depth);
  return s;
}

export function seaweed(r, x, gy, h, color, light) {
  let s = '';
  for (let k = 0; k < 3; k++) {
    const pts = [];
    const ox = x + (k - 1) * 24;
    const hh = h * (0.7 + r() * 0.4);
    for (let i = 0; i <= 8; i++) pts.push([ox + Math.sin(i * 0.9 + k) * 22, gy - (hh * i) / 8]);
    s += `<path d="M${f(pts[0][0])},${f(pts[0][1])}${curveThrough(pts)}" stroke="${k === 1 ? light : color}" stroke-width="${18 - k * 3}" stroke-linecap="round" fill="none"/>`;
  }
  return s;
}

export function stalactite(x, top, h, w, color, light) {
  return `<path d="M${f(x - w / 2)},${f(top)} Q${f(x - w * 0.15)},${f(top + h * 0.6)} ${f(x)},${f(top + h)} Q${f(x + w * 0.15)},${f(top + h * 0.6)} ${f(x + w / 2)},${f(top)} Z" fill="${color}"/><path d="M${f(x - w * 0.3)},${f(top)} Q${f(x - w * 0.1)},${f(top + h * 0.5)} ${f(x)},${f(top + h * 0.92)} Q${f(x - w * 0.02)},${f(top + h * 0.4)} ${f(x - w * 0.05)},${f(top)} Z" fill="${light}" opacity="0.5"/>`;
}

export function stars(r, n, { x0 = 0, x1 = W, y0 = 0, y1 = H * 0.7, color = '#FFFBEA', big = 0.08 }) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + Math.pow(r(), 1.3) * (y1 - y0);
    const size = 1 + r() * 2.6;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size)}" fill="${color}" opacity="${f(0.35 + r() * 0.65)}"/>`;
    if (r() < big) {
      const L = 10 + r() * 12;
      s += `<path d="M${f(x)},${f(y - L)} Q${f(x + 2)},${f(y - 2)} ${f(x + L)},${f(y)} Q${f(x + 2)},${f(y + 2)} ${f(x)},${f(y + L)} Q${f(x - 2)},${f(y + 2)} ${f(x - L)},${f(y)} Q${f(x - 2)},${f(y - 2)} ${f(x)},${f(y - L)} Z" fill="${color}" opacity="0.9"/>`;
    }
  }
  return s;
}

export function wavesLines(r, y0, y1, color, opacity = 0.5) {
  let s = '';
  for (let y = y0; y < y1; y += 26 + r() * 22) {
    const t = (y - y0) / (y1 - y0);
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const x = LX0 + r() * (LX1 - LX0);
      const len = 60 + t * 140 + r() * 60;
      s += `<path d="M${f(x)},${f(y)} q${f(len / 4)},${f(-6 - t * 6)} ${f(len / 2)},0 t${f(len / 2)},0" stroke="${color}" stroke-width="${f(2 + t * 5)}" fill="none" stroke-linecap="round" opacity="${f(opacity * (0.5 + t * 0.5))}"/>`;
    }
  }
  return s;
}
