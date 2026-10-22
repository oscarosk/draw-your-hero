// The 15 story settings, each painted as four layers:
//   sky   (opaque, slow Ken Burns zoom)
//   far   (distant scenery, drifts slowly)
//   mid   (scenery around the hero, drifts more)
//   front (framing foreground at the edges, drifts most)
// The centre of the frame (x 600-1320, y 220-830) stays open for the child's hero.

import {
  W,
  H,
  LX0,
  LX1,
  ridge,
  linear,
  radial,
  glow,
  roundTree,
  pine,
  palm,
  bigLeaf,
  grassTufts,
  flower,
  cloud,
  mountain,
  rock,
  cactus,
  building,
  castle,
  crystal,
  coral,
  seaweed,
  stalactite,
  stars,
  wavesLines,
  f,
} from './lib.mjs';

const GROUND = 830; // where the hero stands

function layer() {
  const defs = [];
  const body = [];
  let n = 0;
  return {
    defs,
    body,
    id: (p = 'g') => `${p}${n++}`,
    add(x) {
      if (typeof x === 'string') body.push(x);
      else {
        if (x.def) defs.push(x.def);
        body.push(x.svg);
      }
    },
    def(d) {
      defs.push(d);
    },
  };
}

function skyGradient(L, stops) {
  const id = L.id('sky');
  L.def(linear(id, stops));
  L.add(`<rect x="${LX0}" y="0" width="${LX1 - LX0}" height="${H}" fill="url(#${id})"/>`);
}

function hill(L, r, { y, amp, freq, top, bottom, jag = 0, step = 60, opacity = 1 }) {
  const id = L.id('hill');
  L.def(linear(id, [
    [0, top],
    [1, bottom],
  ]));
  const rd = ridge(r, { y, amp, freq, jag, step, fill: `url(#${id})`, extra: opacity < 1 ? `opacity="${opacity}"` : '' });
  L.add(rd.svg);
  return rd;
}

function haze(L, y0, y1, color, a = 0.6) {
  const id = L.id('haze');
  L.def(linear(id, [
    [0, color, 0],
    [1, color, a],
  ]));
  L.add(`<rect x="${LX0}" y="${y0}" width="${LX1 - LX0}" height="${y1 - y0}" fill="url(#${id})"/>`);
}

function sunGlow(L, x, y, rad, core, halo) {
  L.add(glow(x, y, rad * 4.2, halo, 0.55, L.id('sg')));
  L.add(glow(x, y, rad * 1.7, core, 0.8, L.id('sg')));
  L.add(`<circle cx="${x}" cy="${y}" r="${rad}" fill="${core}"/>`);
}

/** x positions avoiding the hero's space in the middle. */
function sides(r, count, { x0 = LX0 + 40, x1 = LX1 - 40, gap0 = 560, gap1 = 1360 } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    out.push(left ? x0 + r() * (gap0 - x0) : gap1 + r() * (x1 - gap1));
  }
  return out;
}

// ---------------------------------------------------------------------------

const scenes = {
  meadow(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#5FB4F0'],
      [0.55, '#A9DCF7'],
      [1, '#FFF1D2'],
    ]);
    sunGlow(sky, 1520, 210, 85, '#FFF4C4', '#FFE59A');
    for (const [x, y, w] of [
      [260, 170, 380],
      [900, 120, 300],
      [1240, 300, 260],
    ])
      sky.add(cloud(r, x, y, w, { color: '#FFFFFF', shade: '#D7E9F7', opacity: 0.95 }));

    const far = layer();
    hill(far, r, { y: 640, amp: 50, freq: 0.0032, top: '#9CD39A', bottom: '#BFE4B8' });
    for (const x of sides(r, 8, { gap0: 420, gap1: 1500 })) far.add(roundTree(r, x, 640 + r() * 20, 110 + r() * 40, { leaf: '#86C17F', leafLight: '#A7D69C', leafDark: '#6FAA6B' }));
    hill(far, r, { y: 700, amp: 40, freq: 0.004, top: '#8FCB78', bottom: '#A9D98E' });
    haze(far, 560, 760, '#E6F5E4', 0.55);

    const mid = layer();
    const g = hill(mid, r, { y: 790, amp: 26, freq: 0.0025, top: '#79C25F', bottom: '#5FA64C' });
    for (const x of sides(r, 4, { gap0: 380, gap1: 1560 })) mid.add(roundTree(r, x, g.at(x) + 10, 330 + r() * 120, { leaf: '#4FA454', leafLight: '#7CC66B', leafDark: '#3A8443' }));
    for (let i = 0; i < 70; i++) {
      const x = LX0 + r() * (LX1 - LX0);
      const y = g.at(x) + 12 + r() * 230;
      mid.add(flower(x, y, 7 + r() * 6, ['#FF8FB1', '#FFFFFF', '#FFD23F', '#C9A7FF'][i % 4]));
    }

    const front = layer();
    front.add(grassTufts(r, LX0, 520, 1010, { color: '#3E8E3F', light: '#58AB4D', h: 120, density: 0.05 }));
    front.add(grassTufts(r, 1400, LX1, 1010, { color: '#3E8E3F', light: '#58AB4D', h: 120, density: 0.05 }));
    front.add(rock(r, LX0 + 90, 1060, 300, 120, '#5E8F4F', '#8BBF73'));
    front.add(rock(r, LX1 - 70, 1070, 320, 140, '#5E8F4F', '#8BBF73'));
    for (let i = 0; i < 10; i++) front.add(flower(LX0 + 40 + r() * 420, 930 + r() * 120, 14 + r() * 6, i % 2 ? '#FF8FB1' : '#FFFFFF'));
    for (let i = 0; i < 10; i++) front.add(flower(1480 + r() * 520, 930 + r() * 120, 14 + r() * 6, i % 2 ? '#C9A7FF' : '#FFD23F', '#FFFFFF'));
    return { sky, far, mid, front };
  },

  forest(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#7FC7B0'],
      [0.6, '#CDEBD3'],
      [1, '#FFF3CF'],
    ]);
    sunGlow(sky, 980, 280, 60, '#FFF6CF', '#FFE9A8');

    const far = layer();
    for (let row = 0; row < 2; row++) {
      const base = 610 + row * 50;
      for (let x = LX0; x < LX1; x += 70 + r() * 40) far.add(pine(r, x, base + r() * 20, 220 + r() * 120 - row * 30, { leaf: row ? '#5E9E83' : '#86BBA4', leafDark: row ? '#4C8A70' : '#74AA92' }));
    }
    hill(far, r, { y: 690, amp: 20, freq: 0.004, top: '#5D9E70', bottom: '#6FAE7C' });
    haze(far, 380, 760, '#E8F5E6', 0.6);

    const mid = layer();
    const g = hill(mid, r, { y: 800, amp: 18, freq: 0.003, top: '#4D9A54', bottom: '#3D8045' });
    for (const x of [LX0 + 120, 280, 470, 1460, 1650, LX1 - 120]) {
      mid.add(roundTree(r, x, g.at(x) + 8, 560 + r() * 140, { leaf: '#3F8E4A', leafLight: '#62AF5F', leafDark: '#2E7038', trunk: '#6B4A31' }));
    }
    for (let i = 0; i < 14; i++) {
      const x = sides(r, 1)[0];
      mid.add(`<ellipse cx="${f(x)}" cy="${f(g.at(x) + 30 + r() * 60)}" rx="${f(30 + r() * 30)}" ry="${f(14 + r() * 8)}" fill="#2E7038" opacity="0.6"/>`);
    }
    // mushrooms
    for (const x of [600, 1310]) {
      const y = g.at(x) + 40;
      mid.add(`<rect x="${x - 8}" y="${y - 40}" width="16" height="42" rx="7" fill="#FFF3DF"/><path d="M${x - 36},${y - 36} a36,30 0 0 1 72,0 Z" fill="#FF6B6B"/><circle cx="${x - 12}" cy="${y - 50}" r="6" fill="#FFF"/><circle cx="${x + 14}" cy="${y - 46}" r="5" fill="#FFF"/>`);
    }

    const front = layer();
    for (const [x, y, a, sc, fl] of [
      [LX0 + 20, 1000, -40, 1.5, 1],
      [LX0 + 10, 900, -70, 1.2, 1],
      [LX0 + 60, 1080, -15, 1.4, 1],
      [LX1 - 20, 1000, 40, 1.5, -1],
      [LX1 - 10, 890, 70, 1.2, -1],
      [LX1 - 60, 1080, 15, 1.4, -1],
    ])
      front.add(bigLeaf(x, y, a, sc, '#2C6E36', '#5FAF5F', fl));
    front.add(grassTufts(r, LX0, LX1, 1050, { color: '#2F7A39', light: '#469148', h: 90, density: 0.03 }));
    return { sky, far, mid, front };
  },

  jungle(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#6CCB9E'],
      [0.55, '#C3EDC5'],
      [1, '#FFF0C2'],
    ]);
    sunGlow(sky, 1400, 230, 70, '#FFF5C8', '#FFE79C');

    const far = layer();
    for (let x = LX0; x < LX1; x += 150 + r() * 120) far.add(roundTree(r, x, 610 + r() * 70, 200 + r() * 200, { leaf: '#72BE8B', leafLight: '#93D2A0', leafDark: '#5DA978' }));
    for (let x = LX0 + 60; x < LX1; x += 260 + r() * 160) far.add(palm(r, x, 660 + r() * 30, 260 + r() * 120, (r() - 0.5) * 80, { trunk: '#8FB58F', trunkDark: '#7AA27A', leaf: '#6DB886', leafDark: '#5AA474' }));
    hill(far, r, { y: 680, amp: 24, freq: 0.004, top: '#5DAE6F', bottom: '#6BBB78' });
    haze(far, 400, 760, '#E5F7E2', 0.55);

    const mid = layer();
    const g = hill(mid, r, { y: 805, amp: 16, freq: 0.003, top: '#3F9A4A', bottom: '#2F7D3B' });
    mid.add(palm(r, 250, g.at(250) + 10, 560, 60, { leaf: '#3FA052', leafDark: '#2D7F3E' }));
    mid.add(palm(r, 1690, g.at(1690) + 10, 600, -70, { leaf: '#3FA052', leafDark: '#2D7F3E' }));
    // vines hanging from the top
    for (const x of [80, 380, 520, 1420, 1560, 1840]) {
      const len = 180 + r() * 220;
      mid.add(`<path d="M${x},-10 q${f(20 - r() * 40)},${f(len / 2)} 0,${f(len)}" stroke="#2F7D3B" stroke-width="7" fill="none"/>`);
      for (let k = 30; k < len; k += 40) mid.add(`<ellipse cx="${f(x + (k % 80 ? 12 : -12))}" cy="${k}" rx="16" ry="8" fill="#47A456" transform="rotate(${k % 80 ? 30 : -30} ${f(x)} ${k})"/>`);
    }
    for (let i = 0; i < 16; i++) mid.add(flower(sides(r, 1)[0], 860 + r() * 140, 9 + r() * 5, i % 2 ? '#FF6B9A' : '#FFB347'));

    const front = layer();
    for (const [x, y, a, sc, fl, c] of [
      [LX0, 1020, -30, 2.0, 1, '#1F6A33'],
      [LX0 + 30, 880, -65, 1.6, 1, '#27773A'],
      [LX0 - 20, 760, -95, 1.3, 1, '#1F6A33'],
      [LX1, 1020, 30, 2.0, -1, '#1F6A33'],
      [LX1 - 30, 870, 65, 1.6, -1, '#27773A'],
      [LX1 + 20, 750, 95, 1.3, -1, '#1F6A33'],
    ])
      front.add(bigLeaf(x, y, a, sc, c, '#5DB565', fl));
    return { sky, far, mid, front };
  },

  ocean(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#6E8BE8'],
      [0.45, '#F2A7C3'],
      [0.75, '#FFD3A1'],
      [1, '#FFE9C4'],
    ]);
    sunGlow(sky, 960, 560, 95, '#FFF1C1', '#FFC98A');
    for (const [x, y, w] of [
      [300, 220, 420],
      [1580, 180, 380],
      [1240, 330, 220],
    ])
      sky.add(cloud(r, x, y, w, { color: '#FFE3EC', shade: '#F3B9CF', opacity: 0.9 }));

    const far = layer();
    const seaId = far.id('sea');
    far.def(linear(seaId, [
      [0, '#6E9BD8'],
      [1, '#3D6FB8'],
    ]));
    far.add(`<rect x="${LX0}" y="600" width="${LX1 - LX0}" height="${H - 600}" fill="url(#${seaId})"/>`);
    far.add(glow(960, 640, 360, '#FFE2A8', 0.45, far.id('refl')));
    for (let i = 0; i < 40; i++) {
      const y = 610 + Math.pow(r(), 1.6) * 260;
      const w = 30 + (y - 600) * 0.5 * r();
      far.add(`<rect x="${f(820 + (r() - 0.5) * (200 + (y - 600)))}" y="${f(y)}" width="${f(w)}" height="${f(2 + (y - 600) / 80)}" rx="2" fill="#FFF1C9" opacity="${f(0.5 + r() * 0.4)}"/>`);
    }
    far.add(mountain(r, 220, 604, 520, 90, { color: '#7489C4', shade: '#5E72AE' }));

    const mid = layer();
    mid.add(wavesLines(r, 680, 1060, '#FFFFFF', 0.45));
    const g = hill(mid, r, { y: 870, amp: 22, freq: 0.006, top: '#3A73BF', bottom: '#2A5A9F', step: 50 });
    mid.add(wavesLines(r, 880, 1060, '#BFE3FF', 0.5));
    // a little lighthouse island on the right
    mid.add(rock(r, 1700, g.at(1700) - 5, 420, 120, '#6F7F9E', '#9AA9C5'));
    mid.add(`<path d="M1690,${f(g.at(1700) - 110)} l-26,-230 h52 l-26,230 Z" fill="#FFF6E6"/><rect x="1664" y="${f(g.at(1700) - 290)}" width="52" height="26" fill="#FF6B6B"/><rect x="1664" y="${f(g.at(1700) - 220)}" width="52" height="22" fill="#FF6B6B"/><rect x="1670" y="${f(g.at(1700) - 345)}" width="40" height="50" rx="6" fill="#FFE38A"/><path d="M1660,${f(g.at(1700) - 345)} l30,-40 l30,40 Z" fill="#C2414B"/>`);

    const front = layer();
    const foam = ridge(r, { y: 1000, amp: 20, freq: 0.008, step: 40, fill: '#FFFFFF', extra: 'opacity="0.75"' });
    front.add(foam.svg);
    front.add(ridge(r, { y: 1030, amp: 16, freq: 0.01, step: 40, fill: '#9FD4F5' }).svg);
    return { sky, far, mid, front };
  },

  underwater(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#4FC3E8'],
      [0.4, '#1F8FC6'],
      [1, '#0E4E86'],
    ]);
    sky.add(glow(960, -120, 900, '#C9F3FF', 0.55, sky.id('sg')));

    const far = layer();
    for (let i = 0; i < 6; i++) far.add(rock(r, LX0 + i * 400 + r() * 100, 760, 380 + r() * 200, 160 + r() * 140, '#2B79A6'));
    hill(far, r, { y: 760, amp: 24, freq: 0.004, top: '#2F86AE', bottom: '#2C7AA3' });
    haze(far, 460, 820, '#4AB1D8', 0.5);

    const mid = layer();
    const g = hill(mid, r, { y: 830, amp: 20, freq: 0.003, top: '#E9D59A', bottom: '#D8BE7E' });
    for (const [x, c] of [
      [120, '#FF7E9D'],
      [320, '#FFB067'],
      [480, '#C48DFF'],
      [1440, '#FF7E9D'],
      [1620, '#FFB067'],
      [1820, '#7AE0C8'],
    ])
      mid.add(coral(r, x, g.at(x) + 6, 300 + r() * 160, c, 3));
    for (const x of [30, 230, 560, 1360, 1530, 1960]) mid.add(seaweed(r, x, g.at(x) + 10, 260 + r() * 160, '#2E9E6A', '#49BD7F'));
    for (let i = 0; i < 9; i++) {
      const x = sides(r, 1)[0];
      mid.add(`<path d="M${f(x)},${f(g.at(x) + 40)} l10,-18 l10,18 l18,-6 l-10,16 l14,12 l-20,0 l-12,16 l-4,-18 l-18,-6 l18,-10 Z" fill="#FF9F80" opacity="0.9"/>`);
    }
    for (let i = 0; i < 6; i++) {
      const x = sides(r, 1)[0];
      mid.add(`<ellipse cx="${f(x)}" cy="${f(g.at(x) + 60 + r() * 60)}" rx="22" ry="12" fill="#FFF3E0"/><path d="M${f(x - 18)},${f(g.at(x) + 60)} a18,10 0 0 1 36,0" fill="#F6D7B8"/>`);
    }

    const front = layer();
    front.add(rock(r, LX0 + 80, 1090, 460, 260, '#174C73', '#2A6A93'));
    front.add(rock(r, LX1 - 80, 1090, 480, 280, '#174C73', '#2A6A93'));
    front.add(seaweed(r, LX0 + 140, 1000, 380, '#1E7A52', '#2E9E6A'));
    front.add(seaweed(r, LX1 - 160, 1000, 400, '#1E7A52', '#2E9E6A'));
    return { sky, far, mid, front };
  },

  beach(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#4FB0F0'],
      [0.6, '#A9DEFA'],
      [1, '#FFF4DA'],
    ]);
    sunGlow(sky, 1560, 190, 80, '#FFF6CC', '#FFE8A0');
    sky.add(cloud(r, 400, 200, 360, { shade: '#DCEBF7' }));
    sky.add(cloud(r, 1050, 140, 260, { shade: '#DCEBF7' }));

    const far = layer();
    const seaId = far.id('sea');
    far.def(linear(seaId, [
      [0, '#44B3D8'],
      [1, '#2EA3CC'],
    ]));
    far.add(`<rect x="${LX0}" y="610" width="${LX1 - LX0}" height="${H - 610}" fill="url(#${seaId})"/>`);
    far.add(mountain(r, 1500, 614, 460, 120, { color: '#5BA889', shade: '#4A9277' }));
    far.add(wavesLines(r, 630, 760, '#FFFFFF', 0.5));

    const mid = layer();
    const wet = ridge(r, { y: 760, amp: 16, freq: 0.006, step: 40, fill: '#FFFFFF', extra: 'opacity="0.8"' });
    mid.add(wet.svg);
    const g = hill(mid, r, { y: 785, amp: 18, freq: 0.004, top: '#F6DFA4', bottom: '#EBC97F' });
    mid.add(palm(r, 220, g.at(220) + 20, 620, 90, {}));
    mid.add(palm(r, 1720, g.at(1720) + 20, 560, -80, {}));
    for (let i = 0; i < 10; i++) {
      const x = sides(r, 1)[0];
      const y = g.at(x) + 40 + r() * 160;
      mid.add(i % 3 === 0 ? `<path d="M${f(x)},${f(y)} l14,-26 l14,26 Z" fill="#FFB3C1"/>` : `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(10 + r() * 8)}" ry="7" fill="#FFF6E6"/>`);
    }
    // sandcastle
    mid.add(`<g transform="translate(1440,${f(g.at(1440) + 70)})"><rect x="-70" y="-60" width="140" height="62" fill="#E2B865"/><rect x="-90" y="-100" width="48" height="102" fill="#E8C273"/><rect x="42" y="-100" width="48" height="102" fill="#E8C273"/><rect x="-20" y="-130" width="40" height="70" fill="#E8C273"/><path d="M0,-130 v-40" stroke="#7A5233" stroke-width="4"/><path d="M2,-170 l30,9 l-30,9 Z" fill="#FF6B6B"/></g>`);

    const front = layer();
    hill(front, r, { y: 1010, amp: 30, freq: 0.004, top: '#E6BF72', bottom: '#D9AE5E' });
    front.add(`<g transform="translate(${LX0 + 160},1000) rotate(-20)"><ellipse rx="70" ry="44" fill="#FF8FA3"/><path d="M-60,0 a60,40 0 0 1 120,0" fill="none" stroke="#FFC2CD" stroke-width="8"/></g>`);
    return { sky, far, mid, front };
  },

  sky(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#6BA8FF'],
      [0.5, '#B7D2FF'],
      [1, '#FFD9EC'],
    ]);
    sunGlow(sky, 1500, 220, 80, '#FFF7D6', '#FFE6B0');

    const far = layer();
    for (let i = 0; i < 9; i++) far.add(cloud(r, LX0 + i * 270 + r() * 80, 640 + r() * 60, 380 + r() * 160, { color: '#FFE9F4', shade: '#F4C9DE', opacity: 0.85 }));
    haze(far, 600, 900, '#FFE3F0', 0.5);

    const mid = layer();
    for (const [x, y, w] of [
      [LX0 + 160, 820, 640],
      [430, 920, 520],
      [1500, 900, 560],
      [LX1 - 140, 800, 660],
      [960, 1040, 900],
    ])
      mid.add(cloud(r, x, y, w, { color: '#FFFFFF', shade: '#E1E8FA' }));
    // a rainbow arc behind everything in the mid layer, left side
    const bands = ['#FF8A8A', '#FFC56E', '#FFF07A', '#8DE38F', '#7CC7FF', '#B79CFF'];
    bands.forEach((c, i) => mid.add(`<path d="M${-120 + i * 26},700 a${520 - i * 26},${520 - i * 26} 0 0 1 ${f((520 - i * 26) * 1.2)},-${f((520 - i * 26) * 0.66)}" stroke="${c}" stroke-width="26" fill="none" opacity="0.55"/>`));

    const front = layer();
    front.add(cloud(r, LX0 + 80, 1060, 700, { color: '#FFFFFF', shade: '#DCE4F8' }));
    front.add(cloud(r, LX1 - 60, 1070, 720, { color: '#FFFFFF', shade: '#DCE4F8' }));
    return { sky, far, mid, front };
  },

  space(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#090825'],
      [0.6, '#1E1552'],
      [1, '#3A1F6E'],
    ]);
    sky.add(glow(400, 300, 520, '#7B4DDB', 0.45, sky.id('neb')));
    sky.add(glow(1500, 220, 460, '#2E8FD6', 0.35, sky.id('neb')));
    sky.add(glow(1100, 600, 380, '#E35BB0', 0.25, sky.id('neb')));
    sky.add(stars(r, 260, { y1: H, big: 0.06 }));

    const far = layer();
    // ringed planet
    far.add(glow(300, 260, 240, '#FFB27A', 0.35, far.id('pg')));
    far.add(`<circle cx="300" cy="260" r="130" fill="#FF9F70"/><path d="M175,230 a130,130 0 0 1 250,10 a160,60 0 0 0 -250,-10 Z" fill="#FFC79A" opacity="0.7"/><circle cx="300" cy="260" r="130" fill="none" stroke="#FFD9B5" stroke-width="3" opacity="0.5"/>`);
    far.add(`<ellipse cx="300" cy="270" rx="250" ry="46" fill="none" stroke="#FFE1B8" stroke-width="16" opacity="0.85" transform="rotate(-14 300 270)"/>`);
    far.add(`<circle cx="1640" cy="170" r="54" fill="#7FD6E6"/><circle cx="1625" cy="158" r="20" fill="#A8E7F1" opacity="0.7"/>`);
    hill(far, r, { y: 760, amp: 50, freq: 0.004, top: '#3F3772', bottom: '#2C2659' });

    const mid = layer();
    const g = hill(mid, r, { y: 810, amp: 26, freq: 0.0035, top: '#B9B2D9', bottom: '#8E86B8' });
    for (let i = 0; i < 14; i++) {
      const x = sides(r, 1)[0];
      const y = g.at(x) + 30 + r() * 180;
      const w = 50 + r() * 90;
      mid.add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w)}" ry="${f(w * 0.28)}" fill="#7F77A8"/><ellipse cx="${f(x)}" cy="${f(y + 4)}" rx="${f(w * 0.8)}" ry="${f(w * 0.2)}" fill="#9B94C4"/>`);
    }
    // little rocket parked on the right
    mid.add(`<g transform="translate(1600,${f(g.at(1600) + 10)})"><path d="M-40,0 l-30,40 h30 Z M40,0 l30,40 h-30 Z" fill="#FF6B6B"/><path d="M0,-260 C60,-200 52,-60 40,0 h-80 C-52,-60 -60,-200 0,-260 Z" fill="#F4F1FF"/><circle cx="0" cy="-140" r="26" fill="#7FD6E6" stroke="#B9B2D9" stroke-width="8"/><path d="M0,-260 C24,-238 34,-214 38,-196 h-76 C-34,-214 -24,-238 0,-260 Z" fill="#FF6B6B"/></g>`);

    const front = layer();
    front.add(rock(r, LX0 + 100, 1080, 520, 200, '#5E5690', '#8A82BA'));
    front.add(rock(r, LX1 - 100, 1080, 540, 220, '#5E5690', '#8A82BA'));
    return { sky, far, mid, front };
  },

  night(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#0E0B33'],
      [0.55, '#2A2070'],
      [1, '#5B3E8F'],
    ]);
    sky.add(stars(r, 200, { y1: 700, big: 0.08 }));
    sky.add(glow(1380, 220, 360, '#FFF2C2', 0.3, sky.id('mg')));
    sky.add(`<circle cx="1380" cy="220" r="86" fill="#FFF6D5"/><circle cx="1350" cy="200" r="16" fill="#EFE3B8"/><circle cx="1410" cy="250" r="11" fill="#EFE3B8"/><circle cx="1400" cy="185" r="8" fill="#EFE3B8"/>`);

    const far = layer();
    hill(far, r, { y: 660, amp: 60, freq: 0.003, top: '#3B3A86', bottom: '#33337A' });
    for (let x = LX0; x < LX1; x += 90 + r() * 60) far.add(pine(r, x, 700 + r() * 20, 160 + r() * 80, { leaf: '#2C2E6E', leafDark: '#25285F' }));
    hill(far, r, { y: 720, amp: 30, freq: 0.004, top: '#2D3F6B', bottom: '#2B3A64' });
    haze(far, 560, 780, '#5B4E9C', 0.4);

    const mid = layer();
    const g = hill(mid, r, { y: 810, amp: 20, freq: 0.003, top: '#244A43', bottom: '#1C3934' });
    for (const x of [LX0 + 140, 300, 1560, LX1 - 140]) mid.add(roundTree(r, x, g.at(x) + 8, 520 + r() * 120, { leaf: '#1F4A47', leafLight: '#2D6260', leafDark: '#173835', trunk: '#3A2B2B', trunkDark: '#2A1F1F' }));
    // a cosy little house with a lit window on the left
    mid.add(`<g transform="translate(470,${f(g.at(470) + 6)})"><rect x="-80" y="-120" width="160" height="124" fill="#3B3466"/><path d="M-100,-118 L0,-200 L100,-118 Z" fill="#5A3E6B"/><rect x="-24" y="-80" width="48" height="44" rx="6" fill="#FFD77A"/><path d="M0,-80 v44 M-24,-58 h48" stroke="#3B3466" stroke-width="5"/></g>`);
    mid.add(glow(470, g.at(470) - 52, 120, '#FFD77A', 0.35, mid.id('wg')));

    const front = layer();
    front.add(grassTufts(r, LX0, 560, 1040, { color: '#15302B', light: '#1D3D37', h: 130, density: 0.05 }));
    front.add(grassTufts(r, 1360, LX1, 1040, { color: '#15302B', light: '#1D3D37', h: 130, density: 0.05 }));
    return { sky, far, mid, front };
  },

  castle(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#86B7FF'],
      [0.6, '#E2D3FF'],
      [1, '#FFE6EF'],
    ]);
    sunGlow(sky, 380, 200, 70, '#FFF6D8', '#FFE7B5');
    sky.add(cloud(r, 900, 150, 300, { color: '#FFFFFF', shade: '#E3DBF7' }));
    sky.add(cloud(r, 1650, 260, 340, { color: '#FFFFFF', shade: '#E3DBF7' }));

    const far = layer();
    far.add(mountain(r, 300, 680, 900, 260, { color: '#A9A6DA', shade: '#918DC8', snow: '#F4F2FF' }));
    far.add(mountain(r, 1700, 680, 900, 300, { color: '#A9A6DA', shade: '#918DC8', snow: '#F4F2FF' }));
    hill(far, r, { y: 690, amp: 30, freq: 0.004, top: '#9BD39A', bottom: '#AEDCA6' });
    haze(far, 480, 760, '#F2E9FF', 0.55);

    const mid = layer();
    const g = hill(mid, r, { y: 800, amp: 20, freq: 0.003, top: '#7CC56A', bottom: '#5FA851' });
    mid.add(castle(1590, g.at(1590) + 12, 0.95, {}));
    mid.add(`<path d="M1530,${f(g.at(1530) + 12)} Q1300,${f(g.at(1300) + 60)} 1080,1080 L1260,1080 Q1420,${f(g.at(1400) + 70)} 1650,${f(g.at(1650) + 12)} Z" fill="#E9D8B4"/>`);
    for (const x of [120, 330]) mid.add(roundTree(r, x, g.at(x) + 8, 420 + r() * 80, { leaf: '#4FA454', leafLight: '#7CC66B', leafDark: '#3A8443' }));
    for (let i = 0; i < 24; i++) {
      const x = LX0 + r() * 700;
      mid.add(flower(x, g.at(x) + 30 + r() * 200, 8 + r() * 4, i % 2 ? '#FF8FB1' : '#FFFFFF'));
    }

    const front = layer();
    for (const x0 of [LX0, LX1 - 420]) {
      for (let i = 0; i < 4; i++) front.add(`<circle cx="${f(x0 + 60 + i * 100)}" cy="${f(1040 - (i % 2) * 30)}" r="${f(90 + r() * 30)}" fill="#3E8E47"/>`);
      for (let i = 0; i < 6; i++) front.add(flower(x0 + 40 + r() * 360, 960 + r() * 80, 13, i % 2 ? '#FF6B9A' : '#FFFFFF'));
    }
    return { sky, far, mid, front };
  },

  desert(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#F59E6B'],
      [0.5, '#FFC98F'],
      [1, '#FFEBC4'],
    ]);
    sunGlow(sky, 1480, 260, 100, '#FFF3C6', '#FFD08A');

    const far = layer();
    for (const [x, w, h] of [
      [180, 420, 200],
      [620, 260, 130],
      [1720, 460, 240],
    ]) {
      far.add(`<path d="M${x - w / 2},640 L${x - w * 0.36},${640 - h} L${x + w * 0.36},${640 - h} L${x + w / 2},640 Z" fill="#D9825A"/><path d="M${x + w * 0.1},${640 - h} L${x + w * 0.36},${640 - h} L${x + w / 2},640 L${x + w * 0.2},640 Z" fill="#BF6A47" opacity="0.6"/><rect x="${x - w * 0.36}" y="${640 - h}" width="${w * 0.72}" height="10" fill="#E99A6E"/>`);
    }
    hill(far, r, { y: 690, amp: 40, freq: 0.003, top: '#F0B26E', bottom: '#F3BD7C' });
    haze(far, 520, 760, '#FFE6C2', 0.55);

    const mid = layer();
    const g = hill(mid, r, { y: 800, amp: 28, freq: 0.0028, top: '#F4C772', bottom: '#E7AE52' });
    mid.add(cactus(260, g.at(260) + 16, 300, '#4E9A5C', '#2F6F3F'));
    mid.add(cactus(1680, g.at(1680) + 16, 360, '#4E9A5C', '#2F6F3F'));
    mid.add(cactus(480, g.at(480) + 20, 150, '#5BAA68', '#2F6F3F'));
    for (let i = 0; i < 8; i++) {
      const x = sides(r, 1)[0];
      mid.add(rock(r, x, g.at(x) + 40 + r() * 120, 60 + r() * 50, 30 + r() * 20, '#C98D55', '#E2AD72'));
    }
    for (let i = 0; i < 30; i++) {
      const x = LX0 + r() * (LX1 - LX0);
      const y = g.at(x) + 20 + r() * 220;
      mid.add(`<path d="M${f(x)},${f(y)} q30,-10 60,0" stroke="#D99A4E" stroke-width="3" fill="none" opacity="0.6"/>`);
    }

    const front = layer();
    hill(front, r, { y: 1010, amp: 40, freq: 0.004, top: '#E2A44E', bottom: '#D18F3C' });
    front.add(rock(r, LX0 + 120, 1040, 300, 130, '#B87843', '#D99A5C'));
    front.add(rock(r, LX1 - 120, 1050, 340, 150, '#B87843', '#D99A5C'));
    return { sky, far, mid, front };
  },

  snow(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#8DB5E8'],
      [0.6, '#D6E4F7'],
      [1, '#FDE7EE'],
    ]);
    sunGlow(sky, 600, 260, 60, '#FFF9E8', '#FFEAD6');

    const far = layer();
    far.add(mountain(r, 260, 700, 1000, 420, { color: '#A7BCE0', shade: '#8DA4CF', snow: '#FFFFFF' }));
    far.add(mountain(r, 1100, 700, 800, 320, { color: '#B3C6E6', shade: '#98AED7', snow: '#FFFFFF' }));
    far.add(mountain(r, 1820, 700, 1000, 460, { color: '#A7BCE0', shade: '#8DA4CF', snow: '#FFFFFF' }));
    hill(far, r, { y: 700, amp: 26, freq: 0.004, top: '#E9F1FC', bottom: '#F2F7FE' });
    haze(far, 500, 760, '#F4F1FA', 0.55);

    const mid = layer();
    const g = hill(mid, r, { y: 800, amp: 20, freq: 0.003, top: '#FFFFFF', bottom: '#E5EEF9' });
    for (const x of [LX0 + 100, 200, 380, 1530, 1700, LX1 - 100]) mid.add(pine(r, x, g.at(x) + 12, 360 + r() * 180, { leaf: '#2F6D5A', leafDark: '#24584A', snow: '#FFFFFF' }));
    // snowman
    mid.add(`<g transform="translate(1380,${f(g.at(1380) + 40)})"><ellipse cx="0" cy="0" rx="62" ry="12" fill="#D6E2F2"/><circle cx="0" cy="-50" r="56" fill="#FFFFFF"/><circle cx="0" cy="-138" r="40" fill="#FFFFFF"/><circle cx="-14" cy="-146" r="5" fill="#2B2B3A"/><circle cx="14" cy="-146" r="5" fill="#2B2B3A"/><path d="M0,-136 l30,6 l-30,6 Z" fill="#FF8A3D"/><path d="M-40,-108 q40,16 80,0 l0,14 q-40,14 -80,0 Z" fill="#FF6B6B"/><rect x="-32" y="-206" width="64" height="40" fill="#3A3A55"/><rect x="-46" y="-170" width="92" height="10" fill="#3A3A55"/></g>`);

    const front = layer();
    hill(front, r, { y: 1010, amp: 36, freq: 0.004, top: '#FFFFFF', bottom: '#E0EAF7' });
    front.add(pine(r, LX0 + 40, 1090, 420, { leaf: '#24584A', leafDark: '#1C4A3E', snow: '#FFFFFF' }));
    front.add(pine(r, LX1 - 40, 1090, 460, { leaf: '#24584A', leafDark: '#1C4A3E', snow: '#FFFFFF' }));
    return { sky, far, mid, front };
  },

  city(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#6B7FE0'],
      [0.5, '#C9A2E8'],
      [1, '#FFD0B5'],
    ]);
    sunGlow(sky, 960, 520, 90, '#FFE9C4', '#FFC6A0');

    const far = layer();
    for (let x = LX0; x < LX1; x += 70 + r() * 50) {
      const h = 140 + r() * 260;
      far.add(`<rect x="${f(x)}" y="${f(680 - h)}" width="${f(60 + r() * 60)}" height="${f(h + 20)}" fill="#8E7FC8" rx="4"/>`);
    }
    haze(far, 380, 700, '#F7C9D9', 0.5);
    hill(far, r, { y: 690, amp: 2, freq: 0.004, top: '#7C6DB6', bottom: '#7C6DB6' });

    const mid = layer();
    const colors = ['#FF9E8A', '#7FC8F8', '#FFD66B', '#B79CFF', '#7FDDB8', '#FF8FB1'];
    let i = 0;
    for (const [x0, x1] of [
      [LX0, 560],
      [1360, LX1],
    ]) {
      for (let x = x0; x < x1 - 60; ) {
        const w = 150 + r() * 90;
        const h = 300 + r() * 300;
        const c = colors[i++ % colors.length];
        mid.add(building(r, x, 820, w, h, { color: c, shade: '#5A4A8A', win: 'rgba(255,255,255,0.5)', lit: '#FFF3B0', roof: ['peak', 'dome', 'antenna', 'flat'][i % 4] }));
        x += w + 10;
      }
    }
    mid.add(`<rect x="${LX0}" y="815" width="${LX1 - LX0}" height="300" fill="#8D93A8"/><rect x="${LX0}" y="815" width="${LX1 - LX0}" height="22" fill="#B9BDCB"/>`);
    for (let x = LX0; x < LX1; x += 160) mid.add(`<rect x="${x}" y="930" width="90" height="12" rx="6" fill="#FFF3B0" opacity="0.8"/>`);
    // street lamps
    for (const x of [600, 1320]) mid.add(`<rect x="${x - 5}" y="620" width="10" height="200" fill="#4A4466"/><circle cx="${x}" cy="612" r="18" fill="#FFF0A8"/>`);
    for (const x of [600, 1320]) mid.add(glow(x, 612, 80, '#FFF0A8', 0.5, mid.id('lg')));

    const front = layer();
    for (const x0 of [LX0, LX1 - 380]) for (let k = 0; k < 4; k++) front.add(`<circle cx="${f(x0 + 60 + k * 90)}" cy="${f(1050 - (k % 2) * 26)}" r="${f(80 + r() * 20)}" fill="#3F9A55"/>`);
    return { sky, far, mid, front };
  },

  cave(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#1B1433'],
      [0.6, '#33265A'],
      [1, '#4A3577'],
    ]);
    sky.add(glow(960, 520, 700, '#8C6CE0', 0.35, sky.id('cg')));

    const far = layer();
    for (let i = 0; i < 9; i++) far.add(stalactite(LX0 + i * 260 + r() * 80, -10, 160 + r() * 160, 90 + r() * 60, '#3E2F66', '#5B4A8C'));
    hill(far, r, { y: 720, amp: 50, freq: 0.004, top: '#3A2C61', bottom: '#33275A' });
    for (let i = 0; i < 8; i++) {
      const x = LX0 + r() * (LX1 - LX0);
      far.add(crystal(x, 730 + r() * 20, 80 + r() * 60, 34, (r() - 0.5) * 30, { light: '#C9F1FF', mid: '#7FC9E6', dark: '#5AA2C4' }));
    }
    haze(far, 500, 780, '#5B44A0', 0.4);

    const mid = layer();
    const g = hill(mid, r, { y: 815, amp: 22, freq: 0.0035, top: '#2E2350', bottom: '#241B42' });
    const palettes = [
      { light: '#FFD9F6', mid: '#FF9FE0', dark: '#D46CB8' },
      { light: '#D9F7FF', mid: '#8EE3EF', dark: '#4FB1C9' },
      { light: '#EDE1FF', mid: '#C2A6FF', dark: '#9273E0' },
    ];
    for (const [cx, n] of [
      [200, 5],
      [460, 3],
      [1500, 4],
      [1760, 5],
    ]) {
      const p = palettes[Math.floor(r() * 3)];
      mid.add(glow(cx, g.at(cx) - 80, 220, p.mid, 0.35, mid.id('cg')));
      for (let k = 0; k < n; k++) mid.add(crystal(cx + (k - n / 2) * 46, g.at(cx) + 14, 160 + r() * 160, 54 + r() * 20, (k - n / 2) * 12, p));
    }
    for (const x of [80, 300, 620, 1300, 1620, 1900]) mid.add(stalactite(x, -10, 220 + r() * 160, 110, '#2A1F48', '#43346E'));

    const front = layer();
    front.add(rock(r, LX0 + 100, 1090, 520, 260, '#1A1330', '#2C2250'));
    front.add(rock(r, LX1 - 100, 1090, 520, 260, '#1A1330', '#2C2250'));
    front.add(stalactite(LX0 + 60, -10, 380, 200, '#1A1330', '#2C2250'));
    front.add(stalactite(LX1 - 60, -10, 400, 220, '#1A1330', '#2C2250'));
    return { sky, far, mid, front };
  },

  volcano(r) {
    const sky = layer();
    skyGradient(sky, [
      [0, '#5B3A7A'],
      [0.5, '#E07A5F'],
      [1, '#FFC08A'],
    ]);
    sky.add(cloud(r, 400, 200, 420, { color: '#C96F7E', shade: '#A85A6E', opacity: 0.6 }));
    sky.add(cloud(r, 1300, 140, 360, { color: '#C96F7E', shade: '#A85A6E', opacity: 0.55 }));

    const far = layer();
    far.add(glow(1450, 300, 300, '#FFB347', 0.55, far.id('vg')));
    far.add(`<path d="M1050,700 L1360,330 Q1450,300 1540,330 L1850,700 Z" fill="#6D4C55"/><path d="M1450,320 L1540,330 L1850,700 L1520,700 Z" fill="#583C46" opacity="0.7"/><path d="M1370,330 Q1450,290 1530,330 Q1450,350 1370,330 Z" fill="#FF8A3D"/><path d="M1430,334 C1410,420 1440,470 1400,560 C1380,610 1390,650 1370,700" stroke="#FF8A3D" stroke-width="14" fill="none" stroke-linecap="round" opacity="0.9"/><path d="M1480,334 C1500,410 1480,480 1520,560" stroke="#FFB347" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.8"/>`);
    far.add(cloud(r, 1460, 250, 260, { color: '#8A6A74', shade: '#6F5560', opacity: 0.75 }));
    hill(far, r, { y: 700, amp: 40, freq: 0.004, top: '#7A5560', bottom: '#80606A' });
    haze(far, 520, 760, '#F2A27F', 0.45);

    const mid = layer();
    const g = hill(mid, r, { y: 815, amp: 26, freq: 0.0033, top: '#5A4148', bottom: '#45323A' });
    for (let i = 0; i < 6; i++) {
      const x = sides(r, 1)[0];
      mid.add(rock(r, x, g.at(x) + 30 + r() * 80, 120 + r() * 120, 60 + r() * 50, '#3E2C33', '#6D5059'));
    }
    for (let i = 0; i < 6; i++) {
      const x = sides(r, 1)[0];
      const y = g.at(x) + 60 + r() * 140;
      mid.add(`<path d="M${f(x)},${f(y)} l${f(40 + r() * 40)},${f(10 + r() * 10)} l${f(30 + r() * 30)},${f(-12)} l${f(40)},${f(14)}" stroke="#FF8A3D" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`);
    }

    const front = layer();
    front.add(rock(r, LX0 + 120, 1080, 520, 240, '#2E2026', '#4C363F'));
    front.add(rock(r, LX1 - 120, 1080, 540, 250, '#2E2026', '#4C363F'));
    return { sky, far, mid, front };
  },
};

export default scenes;
export { W, H };
