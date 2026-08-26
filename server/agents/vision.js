// Vision agent - powers "search by photo" (the camera icon).
//
// Two stages: a multimodal model reads the photo into structured product
// attributes, then those attributes go through the normal catalogue search.
// The model never picks products directly, so it cannot hallucinate a SKU
// that does not exist.

import { z } from 'zod';
import { complete } from './providers.js';
import { validateOutput } from './guardrails.js';
import { runFilters } from './search.js';
import { q } from '../lib/db.js';

// Tolerant by design - a vision model that says confidence "high" or returns
// null for a colour it could not see should not sink the whole search.
const str = (len, dflt = '') => z.preprocess((v) => (v == null ? dflt : String(v).slice(0, len)), z.string().max(len));
const nullableStr = (len) => z.preprocess((v) => (v == null || v === '' ? null : String(v).slice(0, len)), z.string().max(len).nullable());
const strList = (max, len) =>
  z.preprocess((v) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, max) : []), z.array(z.string().max(len)));

const confidence = z.preprocess((v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  const s = String(v ?? '').toLowerCase();
  if (/high|certain|sure/.test(s)) return 0.85;
  if (/med|moderate/.test(s)) return 0.55;
  if (/low|unsure|unclear/.test(s)) return 0.2;
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n > 1 ? n / 100 : n)) : 0.5;
}, z.number().min(0).max(1));

export const visionSchema = z.object({
  product_type: str(60),
  is_footwear: z.preprocess((v) => v !== false, z.boolean()),
  brand_guess: nullableStr(60),
  primary_color: str(30),
  secondary_colors: strList(4, 30),
  materials: strList(4, 30),
  style_keywords: strList(8, 30),
  silhouette: nullableStr(60),
  confidence,
  description: str(300),
});

const SYSTEM = `You are a product recognition model for a sneaker marketplace.
Look at the photo and describe the item objectively.

EVERY field below is required - never leave one blank:
- product_type: what the item is, e.g. "sneakers", "boots", "sandals".
- primary_color / secondary_colors: the colours you can actually see.
- materials: e.g. "leather", "mesh", "suede", "rubber".
- silhouette: e.g. "low-top", "high-top", "chunky runner".
- style_keywords: 3-6 lowercase search descriptors, e.g. "retro", "skate", "gum-sole".
- description: one sentence describing the item.
- brand_guess: only if a logo or wordmark is clearly visible, otherwise null.
  Never guess a specific model name you cannot read.
- confidence: 0-1, how sure you are this is a clear photo of a single product.

If the image is not a product photo at all, set is_footwear false, confidence 0,
and say so in description.
Reply with a single JSON object and nothing else.`;

/** Read a product photo into structured attributes. */
export async function describeImage(imageDataUrl) {
  const res = await complete({
    system: SYSTEM,
    user:
      'Identify this product. Return JSON with exactly these keys: product_type, ' +
      'is_footwear, brand_guess, primary_color, secondary_colors, materials, ' +
      'style_keywords, silhouette, confidence, description.',
    images: [imageDataUrl],
    wantJSON: true,
    maxTokens: 700,
    temperature: 0.2,
  });

  const valid = validateOutput(visionSchema, res.json);
  if (!valid.ok) {
    const err = new Error(`vision output failed validation: ${valid.error}`);
    err.meta = res;
    throw err;
  }
  return { attrs: valid.data, meta: res };
}

/** Full image search: describe, then match against the catalogue. */
export async function searchByImage(imageDataUrl, spaceId, limit = 12) {
  const { attrs, meta } = await describeImage(imageDataUrl);

  if (attrs.confidence < 0.15) {
    return { attrs, results: [], meta, note: 'Could not read a product clearly from that image.' };
  }

  // If a brand was legible, match it against the brands this space actually
  // carries - a photo of an adidas shoe should surface adidas first.
  let brands = [];
  if (attrs.brand_guess) {
    const guess = attrs.brand_guess.toLowerCase().trim();
    const known = await q(
      `SELECT DISTINCT brand FROM products WHERE space_id = ? AND brand IS NOT NULL AND status = 'active'`,
      [spaceId]
    );
    brands = known.map((b) => b.brand).filter((b) => {
      const n = b.toLowerCase();
      return n === guess || n.includes(guess) || guess.includes(n);
    });
  }

  const filters = {
    keywords: [attrs.silhouette, attrs.product_type, ...attrs.style_keywords].filter(Boolean).slice(0, 6),
    brands,
    category_slugs: [],
    colors: [attrs.primary_color, ...attrs.secondary_colors].filter(Boolean).slice(0, 3),
    min_price_cents: null,
    max_price_cents: null,
    on_sale_only: false,
    sort: 'relevance',
  };

  // Widen in steps rather than returning an empty shelf: brand+look, then
  // brand alone, then just the colour and product type.
  let results = await runFilters(filters, spaceId, limit);
  if (!results.length && brands.length) {
    results = await runFilters({ ...filters, keywords: [], colors: [] }, spaceId, limit);
  }
  if (!results.length) {
    results = await runFilters(
      { ...filters, brands: [], keywords: [attrs.product_type].filter(Boolean), colors: [attrs.primary_color].filter(Boolean) },
      spaceId,
      limit
    );
  }

  return { attrs, results, meta, filters };
}
