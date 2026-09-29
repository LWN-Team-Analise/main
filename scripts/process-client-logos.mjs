// Converts the original client logos into clean white, transparent marks.
//
//   npm run assets:logos
//
// Input:  assets/source/clients/*  (originals downloaded from lwnengenharia.com.br)
// Output: public/assets/clients/<name>.webp + src/data/clientLogoMeta.json
//
// Each logo's background is detected from its border: transparent logos keep
// their alpha, logos on a solid colour (white or otherwise) have that colour
// keyed out. Whatever remains becomes pure white.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const SRC = 'assets/source/clients';
const OUT = 'public/assets/clients';
const META = 'src/data/clientLogoMeta.json';
const MAX_H = 120;
const MAX_W = 420;

// Per-logo tuning where the automatic key needs help.
//   low/high        thresholds of the background key
//   whiteInk        keep only the white lettering (logos printed on coloured panels)
//   darkInk         keep only the dark lettering (logos drawn over a light tinted badge)
//   saturatedAlpha  soften strongly coloured shapes so overlapping lettering stays legible
const OVERRIDES = {
  cellavita: { darkInk: true },
  ardutec: { whiteInk: true },
  'pg-products': { whiteInk: true },
  agener: { saturatedAlpha: 0.38 },
};

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The live site lists Inpharma twice (a .jpg and a .png of the same logo); keep the transparent PNG.
const SKIP = new Set(['inpharma.jpg']);

export const slug = (file) =>
  basename(file, extname(file))
    .toLowerCase()
    .replace(/-e\d{10,}/, '') // WordPress edit suffixes
    .replace(/-\d+x\d+$/, '') // WordPress size suffixes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function load(file) {
  const input = sharp(join(SRC, file), { density: extname(file) === '.svg' ? 300 : 72 });
  const { data, info } = await input
    .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function borderStats({ data, width, height }) {
  const px = [];
  const push = (x, y) => {
    const i = (y * width + x) * 4;
    px.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  const transparent = px.filter((p) => p[3] < 40).length / px.length;
  const opaque = px.filter((p) => p[3] >= 200);
  const median = (k) => {
    const v = opaque.map((p) => p[k]).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 255;
  };
  return { transparent, bg: [median(0), median(1), median(2)] };
}

function toWhite(img, name) {
  const { data, width, height } = img;
  const { transparent, bg } = borderStats(img);
  const out = Buffer.alloc(width * height * 4);
  const tune = OVERRIDES[name] ?? {};

  // Logos drawn in white/very light ink on transparency are already "white".
  let lightInk = false;
  if (transparent > 0.6) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) {
        sum += 1 - Math.min(data[i], data[i + 1], data[i + 2]) / 255;
        n++;
      }
    }
    lightInk = n > 0 && sum / n < 0.08;
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const a = data[i + 3] / 255;
    let alpha;
    if (tune.whiteInk) {
      alpha = a * smoothstep(0.72, 0.92, Math.min(r, g, b));
    } else if (tune.darkInk) {
      alpha = a * smoothstep(0.45, 0.7, 1 - (0.299 * r + 0.587 * g + 0.114 * b));
    } else if (transparent > 0.6) {
      // Distance from white: colour and dark ink become opaque, white knocks out.
      const d = Math.max(1 - r, 1 - g, 1 - b);
      alpha = lightInk ? a : a * smoothstep(tune.low ?? 0.06, tune.high ?? 0.3, d);
    } else {
      const d = Math.max(Math.abs(r - bg[0] / 255), Math.abs(g - bg[1] / 255), Math.abs(b - bg[2] / 255));
      alpha = a * smoothstep(tune.low ?? 0.08, tune.high ?? 0.32, d);
    }
    if (tune.saturatedAlpha !== undefined) {
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      alpha *= 1 - (1 - tune.saturatedAlpha) * smoothstep(0.25, 0.5, saturation);
    }
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = Math.round(alpha * 255);
  }
  return { mode: transparent > 0.6 ? (lightInk ? 'light-ink' : 'transparent') : `bg(${bg.join(',')})`, buffer: out };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const meta = {};
  const files = readdirSync(SRC).filter((f) => /\.(png|jpe?g|webp|avif|svg)$/i.test(f) && !SKIP.has(f));
  for (const file of files) {
    const name = slug(file);
    try {
      const img = await load(file);
      const { mode, buffer } = toWhite(img, name);
      const trimmed = await sharp(buffer, { raw: { width: img.width, height: img.height, channels: 4 } })
        .trim({ threshold: 10 })
        .png()
        .toBuffer();
      const final = sharp(trimmed).resize({ width: MAX_W, height: MAX_H, fit: 'inside', withoutEnlargement: true });
      const info = await final
        .webp({ quality: 90, alphaQuality: 100, effort: 5 })
        .toFile(join(OUT, `${name}.webp`));
      meta[name] = { w: info.width, h: info.height, source: file, mode };
      console.log(`${name.padEnd(34)} ${String(info.width).padStart(4)}x${info.height} ${mode}`);
    } catch (error) {
      console.error(`FAILED ${file}: ${error.message}`);
    }
  }
  writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
  console.log(`\n${Object.keys(meta).length} logos → ${OUT}`);
}

main();
