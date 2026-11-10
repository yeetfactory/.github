#!/usr/bin/env node
// Builds the banner in profile/README.md:
//   profile/assets/yeetfactory-wide.svg    desktop
//   profile/assets/yeetfactory-narrow.svg  phones
//
// Edit the content below, then run: node scripts/build.mjs
// No dependencies. The font and the grain texture are embedded in each SVG,
// because an SVG shown through <img> cannot load anything from outside.
//
// Font: Instrument Serif italic (SIL Open Font License, see scripts/fonts).

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const repo = new URL('..', import.meta.url);
const font = readFileSync(new URL('scripts/fonts/instrument-serif-400-italic.woff2', repo)).toString('base64');

// ---------------------------------------------------------------- content

const word = 'yeetfactory';

// ---------------------------------------------------------------- helpers

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => +v.toFixed(1);

// Seeded random numbers, so a rebuild gives the same landscape.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A small tile of film grain as a PNG: light and dark specks on transparency.
function grainTile(size, seed) {
  const rand = random(seed);
  const alphas = [0, 14, 30, 50, 14, 30, 50];
  const weights = [0.26, 0.17, 0.13, 0.07, 0.17, 0.13, 0.07];
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = rand();
      let i = 0;
      while (i < weights.length - 1 && r > weights[i]) r -= weights[i++];
      raw[y * (size + 1) + 1 + x] = i;
    }
  }
  const table = Array.from({ length: 256 }, (_, k) => {
    let c = k;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per pixel
  header[9] = 3; // palette
  const palette = Buffer.from(alphas.flatMap((_, i) => (i >= 1 && i <= 3 ? [255, 250, 240] : [20, 16, 30])));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('PLTE', palette),
    chunk('tRNS', Buffer.from(alphas)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

const grain = grainTile(160, 7);

// Shared colours. The landscape is morning in light mode and night in dark mode.
const theme = `
svg{
--sky1:#9FB2CC;--sky2:#E6C3A5;--sky3:#F7E4C6;--sun:#FFF6DC;--glow:#FFD79A;--cloud:#FFF3E2;
--h1:#A7B3C6;--h2:#8E9FB3;--h3:#7A9296;--h4:#74875F;--h5:#8E8C52;--h6:#55643B;--tree:#35432E;--haze:#F4E3C9;
--stars:0;--birds:.55;--grain:.95;--ink:#1F2421;--word:#1F2A24;--shade:#FFF4E0;--shading:.6}
@media (prefers-color-scheme:dark){svg{
--sky1:#070B1E;--sky2:#172048;--sky3:#3B3D75;--sun:#F3ECD6;--glow:#8E93D6;--cloud:#5A62A0;
--h1:#343F78;--h2:#283264;--h3:#1E2750;--h4:#171E40;--h5:#111730;--h6:#0B1024;--tree:#060916;--haze:#2F356E;
--stars:1;--birds:0;--grain:.7;--ink:#ECEEF2;--word:#F6F1E4;--shade:#000000;--shading:.45}}`;

// -------------------------------------------------------------- landscape

// One conifer as a path: a thin trunk and six ragged tiers.
function pineShape(rand, x, base, h) {
  const w = h * 0.36;
  let d = `M${n(x - 1.5)} ${n(base + 4)}V${n(base - h * 0.06)}`;
  const tiers = 6;
  for (let t = tiers; t >= 1; t--) {
    const y = base - h + (h * 0.94 * t) / tiers;
    const half = (w / 2) * (t / tiers) * (0.85 + rand() * 0.3);
    d += `L${n(x - half)} ${n(y)}L${n(x - half * 0.35)} ${n(y - (h / tiers) * 0.55)}`;
  }
  d += `L${n(x)} ${n(base - h)}`;
  for (let t = 1; t <= tiers; t++) {
    const y = base - h + (h * 0.94 * t) / tiers;
    const half = (w / 2) * (t / tiers) * (0.85 + rand() * 0.3);
    d += `L${n(x + half * 0.35)} ${n(y - (h / tiers) * 0.55)}L${n(x + half)} ${n(y)}`;
  }
  return `${d}L${n(x + 1.5)} ${n(base - h * 0.06)}V${n(base + 4)}Z`;
}

function landscape(layout, rand) {
  const { width, height, horizon } = layout;
  const out = [];
  const defs = [];

  // sky, sun (or moon), stars
  defs.push(
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset=".35" style="stop-color:var(--sky2)"/><stop offset=".65" style="stop-color:var(--sky3)"/></linearGradient>`,
    `<radialGradient id="glow"><stop offset="0" style="stop-color:var(--glow);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--glow);stop-opacity:0"/></radialGradient>`,
    `<radialGradient id="puff"><stop offset="0" style="stop-color:var(--cloud);stop-opacity:.85"/><stop offset="1" style="stop-color:var(--cloud);stop-opacity:0"/></radialGradient>`,
  );
  out.push(`<rect width="${width}" height="${height}" fill="url(#sky)"/>`);

  const stars = [[], []];
  for (let i = 0; i < layout.stars; i++) {
    const x = rand() * width;
    const y = rand() * horizon;
    stars[i % 2].push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.7 + rand() * 1.1)}"/>`);
  }
  out.push(`<g class="stars" fill="#F3ECD6"><g class="tw1">${stars[0].join('')}</g><g class="tw2">${stars[1].join('')}</g></g>`);

  const sun = layout.sun;
  out.push(`<circle cx="${n(sun.x)}" cy="${n(sun.y)}" r="${n(sun.r * 5.5)}" fill="url(#glow)"/>`);
  out.push(`<circle cx="${n(sun.x)}" cy="${n(sun.y)}" r="${n(sun.r)}" style="fill:var(--sun)"/>`);

  // clouds: clusters of soft puffs that drift
  const cloud = (cx, cy, scale) => {
    let puffs = '';
    for (let i = 0; i < 7; i++) {
      const dx = (rand() - 0.5) * 230 * scale;
      const dy = (rand() - 0.5) * 22 * scale;
      puffs += `<ellipse cx="${n(cx + dx)}" cy="${n(cy + dy)}" rx="${n((70 + rand() * 80) * scale)}" ry="${n((16 + rand() * 14) * scale)}" fill="url(#puff)"/>`;
    }
    return puffs;
  };
  const s = width / 1200;
  out.push(`<g class="drift1">${cloud(width * 0.2, horizon * 0.3, 0.6 + 0.4 * s)}${cloud(width * 0.92, horizon * 0.62, 0.5 + 0.4 * s)}</g>`);
  out.push(`<g class="drift2">${cloud(width * 0.55, horizon * 0.48, 0.5 + 0.4 * s)}${cloud(width * 0.02, horizon * 0.78, 0.5 + 0.3 * s)}</g>`);

  // birds
  const bird = (x, y, w) => `<path d="M${n(x)} ${n(y)}q${n(w / 2)} ${n(-w / 2)} ${w} 0q${n(w / 2)} ${n(-w / 2)} ${w} 0"/>`;
  const flock = layout.birds;
  out.push(
    `<g class="birds" fill="none" stroke-width="1.6" stroke-linecap="round" style="stroke:var(--ink)">${bird(flock.x, flock.y, 8)}${bird(flock.x + 26, flock.y + 13, 6)}${bird(flock.x - 20, flock.y + 20, 5)}</g>`,
  );

  // hills, far to near. Each ridge is a few sine waves; nearer ones carry a forest edge.
  const near = height - layout.foreground;
  const count = 6;
  const pine = (x, base, h) => pineShape(rand, x, base, h);

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const base = i === 0 ? horizon : horizon + layout.gap + (near - horizon - layout.gap) * ((i - 1) / (count - 2));
    const amp = i === 0 ? layout.peaks : layout.roll - i * 4;
    const waves = [0, 1, 2].map((k) => ({ len: (260 + rand() * 240) / (k * 1.7 + 1), phase: rand() * 7, gain: [0.62, 0.28, 0.1][k] }));
    const ridge = (x) => base + amp * waves.reduce((sum, w) => sum + w.gain * Math.sin(x / w.len + w.phase), 0);
    const teeth = i < 2 ? 0 : 3 + i * 2.2; // forest edge height
    const step = i < 2 ? 12 : 5;
    let d = `M0 ${height}L0 ${n(ridge(0))}`;
    for (let x = step; x <= width + step; x += step) {
      const y = ridge(x);
      d += teeth ? `L${n(x - step / 2)} ${n(y - teeth * (0.35 + rand() * 0.65))}L${n(x)} ${n(y)}` : `L${n(x)} ${n(y)}`;
    }
    d += `L${width} ${height}Z`;
    const top = base - amp;
    const fade = i === count - 1 ? height : top + 200;
    defs.push(
      `<linearGradient id="hill${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(top)}" x2="0" y2="${n(fade)}"><stop offset="0" style="stop-color:var(--h${i + 1})"/><stop offset="1" style="stop-color:var(--haze);stop-opacity:${n(0.9 - t * 0.75)}"/></linearGradient>`,
    );
    out.push(`<path d="${d}" style="fill:var(--h${i + 1})"/><path d="${d}" fill="url(#hill${i})"/>`);

    // standing pines on the two nearest ridges, tallest at the edges of the picture
    if (i >= count - 2) {
      const tall = i === count - 1;
      let trees = '';
      const total = Math.round((width / 1200) * (tall ? 22 : 26));
      for (let k = 0; k < total; k++) {
        const x = rand() * width;
        const edge = Math.min(x, width - x) / width; // 0 at the sides
        const h = tall ? 34 + rand() * 32 + Math.max(0, 0.09 - edge) * layout.edgePines * (0.6 + rand() * 0.4) : 22 + rand() * 20;
        trees += pine(x, ridge(x) + 3, h);
      }
      out.push(`<path d="${trees}" style="fill:var(${tall ? '--tree' : '--h6'})"/>`);
    }
  }

  // grain over everything
  defs.push(
    `<pattern id="grain" width="208" height="208" patternUnits="userSpaceOnUse"><image width="208" height="208" href="data:image/png;base64,${grain}"/></pattern>`,
  );
  out.push(`<rect width="${width}" height="${height}" fill="url(#grain)" style="opacity:var(--grain)"/>`);

  return { defs: defs.join(''), body: out.join('\n') };
}

// ----------------------------------------------------------------- banner

function banner(layout) {
  const { width, height, radius } = layout;
  const rand = random(layout.seed);
  const scene = landscape(layout, rand);
  const x = width / 2;
  const y = layout.baseline;
  const text = (cls) => `<text class="${cls}" x="${x}" y="${y}" font-size="${layout.size}" text-anchor="middle">${esc(word)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(word)}</title>
<desc id="desc">The word ${esc(word)} in an italic serif, over a grainy landscape of hills and pines. Morning in light mode, night in dark mode.</desc>
<style>
@font-face{font-family:"Instrument Serif";font-style:italic;font-weight:400;src:url(data:font/woff2;base64,${font}) format("woff2")}${theme}
.word{font-family:"Instrument Serif","Times New Roman",serif;font-style:italic;font-weight:400;letter-spacing:-.015em;fill:var(--word)}
.shade{fill:var(--shade);opacity:var(--shading);filter:url(#soft)}
.stars{opacity:var(--stars)}
.birds{opacity:var(--birds);animation:fly 80s linear infinite}
.drift1{animation:drift 70s ease-in-out infinite alternate}
.drift2{animation:drift 95s ease-in-out infinite alternate-reverse}
.tw1{animation:twinkle 5s ease-in-out infinite alternate}
.tw2{animation:twinkle 7s ease-in-out infinite alternate-reverse}
@keyframes drift{from{transform:translateX(-${Math.round(width * 0.05)}px)}to{transform:translateX(${Math.round(width * 0.07)}px)}}
@keyframes fly{from{transform:translate(-${Math.round(width * 0.5)}px,10px)}to{transform:translate(${Math.round(width * 0.8)}px,-14px)}}
@keyframes twinkle{from{opacity:.35}to{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<defs><clipPath id="frame"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath><filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${layout.blur}"/></filter>${scene.defs}</defs>
<g clip-path="url(#frame)">
${scene.body}
${text('shade')}
${text('word')}
</g>
</svg>
`;
}

// ---------------------------------------------------------------- layouts

const wide = {
  seed: 11, width: 1200, height: 440, radius: 22,
  horizon: 205, peaks: 54, gap: 44, roll: 34, foreground: 26, edgePines: 1500,
  sun: { x: 960, y: 84, r: 30 }, birds: { x: 330, y: 80 }, stars: 70,
  size: 160, baseline: 252, blur: 12,
};

const narrow = {
  seed: 5, width: 600, height: 440, radius: 20,
  horizon: 215, peaks: 44, gap: 40, roll: 28, foreground: 24, edgePines: 1000,
  sun: { x: 470, y: 80, r: 24 }, birds: { x: 130, y: 86 }, stars: 40,
  size: 112, baseline: 252, blur: 9,
};

// ------------------------------------------------------------------ write

const write = (file, svg) => {
  writeFileSync(new URL(`profile/assets/${file}.svg`, repo), svg);
  console.log(`profile/assets/${file}.svg  ${(svg.length / 1024).toFixed(1)} kB`);
};

write('yeetfactory-wide', banner(wide));
write('yeetfactory-narrow', banner(narrow));
