// Renders the clothing product images.
//
//   node scripts/gen-apparel-images.mjs
//
// The garments are drawn (see garment-art.mjs) rather than photographed:
// catalogue photos do not exist for these house-brand pieces, and the free
// image-model credits do not stretch to 48 renders. Output matches the admin
// upload pipeline exactly - 1400x1000 white-background JPEG.

import { mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { flatten } from './apparel-catalogue.mjs';
import { garmentSVG, templateFor } from './garment-art.mjs';

const OUT_DIR = path.resolve('public', 'products', 'apparel');
await mkdir(OUT_DIR, { recursive: true });

const all = flatten();
console.log(`rendering ${all.length} garments into ${OUT_DIR}\n`);

const used = {};
for (const item of all) {
  const tpl = templateFor(item);
  used[tpl] = (used[tpl] || 0) + 1;
  const svg = garmentSVG(item);
  await sharp(Buffer.from(svg))
    .resize(1400, 1000, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(path.join(OUT_DIR, path.basename(item.imageFile)));
  console.log(`  ${item.spaceSlug}/${item.categorySlug.padEnd(11)} ${item.name.padEnd(26)} -> ${tpl}`);
}

console.log(`\ntemplates used: ${Object.entries(used).map(([k, v]) => `${k}:${v}`).join(', ')}`);
console.log(`${all.length} images written`);
