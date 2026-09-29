// Optimises the photos reused from lwnengenharia.com.br and builds the review QR.
//
//   npm run assets:media
//
// Input:  assets/source/{leaders,seals,blog}/*
// Output: public/assets/{leaders,seals,blog}/*.webp, public/assets/google-review-qr.svg
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

// Official Google review link used on the current website.
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CfSDapWb-5LxEAE/review';

const jobs = [
  // Leadership portraits: square crops at two sizes for srcset.
  { dir: 'leaders', sizes: [360, 720], square: true, quality: 80 },
  // Seals keep transparency.
  { dir: 'seals', sizes: [320], quality: 90 },
  // Blog featured images.
  { dir: 'blog', sizes: [640, 1200], quality: 80 },
];

const name = (file) =>
  basename(file, extname(file))
    .replace(/-\d+x\d+$/, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase();

for (const job of jobs) {
  const src = join('assets/source', job.dir);
  const out = join('public/assets', job.dir);
  mkdirSync(out, { recursive: true });
  for (const file of readdirSync(src)) {
    for (const size of job.sizes) {
      const image = sharp(join(src, file)).rotate();
      const resized = job.square
        ? image.resize(size, size, { fit: 'cover', position: 'attention' })
        : image.resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true });
      const info = await resized.webp({ quality: job.quality, effort: 5 }).toFile(join(out, `${name(file)}-${size}.webp`));
      console.log(`${job.dir}/${name(file)}-${size}.webp ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)}KB`);
    }
  }
}

const svg = await QRCode.toString(GOOGLE_REVIEW_URL, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 0,
  color: { dark: '#081430', light: '#0000' },
});
writeFileSync('public/assets/google-review-qr.svg', svg);
console.log('public/assets/google-review-qr.svg →', GOOGLE_REVIEW_URL);
