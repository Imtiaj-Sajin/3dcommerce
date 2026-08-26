// Stylist agent - "how would this look on me?" preview.
//
// Composes a prompt from the product photo, a body size and an optional
// selfie, then renders a preview image. Without a selfie it renders a
// neutral model instead.
//
// Handling of the selfie is deliberately narrow:
//   - it is used for this one render and never written to disk or the DB
//   - the prompt is fixed by us; shoppers cannot supply free-form image text
//   - output is always labelled as an AI preview
// That keeps the feature to its purpose: showing a customer their own fit.

import { z } from 'zod';
import { complete, generateImage } from './providers.js';
import { validateOutput } from './guardrails.js';
import { one } from '../lib/db.js';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const BUILD_BY_SIZE = {
  XS: 'a petite, slim build',
  S: 'a slim build',
  M: 'an average, medium build',
  L: 'a slightly broader, athletic build',
  XL: 'a large, broad build',
  XXL: 'a big and tall build',
};

export const briefSchema = z.object({
  scene: z.string().max(400),
  styling: z.string().max(300),
});

const BRIEF_SYSTEM = `You write short art-direction briefs for e-commerce try-on previews.
Given a product, describe a clean studio scene and a complementary outfit that
shows the product at its best.
- scene: lighting, background, camera framing. Keep it a plain studio look.
- styling: what else the model wears, chosen to flatter the product without
  distracting from it. Never describe the product itself differently from the
  photo supplied.
- Reply with a single JSON object: {"scene": "...", "styling": "..."}`;

/**
 * @param {object} input
 * @param {number} input.productId
 * @param {string} input.size          one of XS..XXL
 * @param {string} [input.faceDataUrl] shopper selfie (transient, never stored)
 */
export async function renderTryOn(input) {
  const size = SIZES.includes(String(input.size || '').toUpperCase())
    ? String(input.size).toUpperCase()
    : 'M';

  const product = await one(
    `SELECT p.id, p.name, p.brand, p.short_description, p.colorway, p.material,
            c.name AS category_name, i.file_path AS image
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_images i ON i.product_id = p.id AND i.is_primary = 1
      WHERE p.id = ? AND p.status = 'active'`,
    [input.productId]
  );
  if (!product) throw Object.assign(new Error('product not found'), { status: 404 });

  // 1. art-direction brief (cheap text call, tolerant of failure)
  let brief = { scene: 'clean light-grey studio backdrop, soft even lighting, full-length framing', styling: 'simple neutral everyday clothing' };
  let briefMeta = null;
  try {
    const res = await complete({
      system: BRIEF_SYSTEM,
      user: `Product: ${product.name} by ${product.brand ?? 'unknown brand'} (${product.category_name}).\n` +
            `Details: ${product.short_description ?? ''} ${product.colorway ?? ''} ${product.material ?? ''}`.trim(),
      wantJSON: true,
      maxTokens: 400,
      temperature: 0.7,
    });
    const valid = validateOutput(briefSchema, res.json);
    if (valid.ok) brief = valid.data;
    briefMeta = res;
  } catch (e) {
    console.warn('[stylist] brief failed, using default:', e.message);
  }

  // 2. render. Prompt is fully constructed by us.
  const hasFace = !!input.faceDataUrl;
  const prompt = [
    `Full-length e-commerce try-on photograph of a person wearing the ${product.name}`,
    product.brand ? `by ${product.brand}` : '',
    `shown in the attached product photo. The footwear must match the attached product photo exactly`,
    `in colour, shape and detailing.`,
    `The person has ${BUILD_BY_SIZE[size]} (size ${size}).`,
    hasFace
      ? 'Use the attached portrait as the reference for the face, keeping the likeness natural and flattering.'
      : 'Use a generic anonymous model; do not depict any identifiable real person.',
    `Styling: ${brief.styling}.`,
    `Scene: ${brief.scene}.`,
    'Photorealistic, sharp focus on the product, tasteful and fully clothed.',
  ]
    .filter(Boolean)
    .join(' ');

  const images = [];
  if (product.image) {
    const asDataUrl = await fileToDataUrl(product.image);
    if (asDataUrl) images.push(asDataUrl);
  }
  if (hasFace) images.push(input.faceDataUrl);

  const image = await generateImage({ prompt, images, size: '1K' });
  if (!image) throw Object.assign(new Error('image generation returned no image'), { status: 502 });

  return {
    image,
    product: { id: product.id, name: product.name, brand: product.brand },
    size,
    brief,
    usedFace: hasFace,
    disclaimer: 'AI-generated preview. Fit and colour may differ from the real product.',
    meta: briefMeta,
  };
}

import { readFile } from 'fs/promises';
import path from 'path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

/** Read a catalogue image off disk as a data URL, safely scoped to /public. */
async function fileToDataUrl(relPath) {
  try {
    const full = path.resolve(PUBLIC_DIR, relPath);
    if (!full.startsWith(PUBLIC_DIR)) return null; // path traversal guard
    const buf = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
