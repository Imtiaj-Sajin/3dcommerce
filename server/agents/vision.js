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

export const visionSchema = z.object({
  product_type: z.string().max(60),
  is_footwear: z.boolean().default(true),
  brand_guess: z.string().max(60).nullable().optional(),
  primary_color: z.string().max(30),
  secondary_colors: z.array(z.string().max(30)).max(4).default([]),
  materials: z.array(z.string().max(30)).max(4).default([]),
  style_keywords: z.array(z.string().max(30)).max(8).default([]),
  silhouette: z.string().max(60).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  description: z.string().max(300),
});

const SYSTEM = `You are a product recognition model for a sneaker marketplace.
Look at the photo and describe the item objectively.
- Only report what is visibly present. Never guess a model name you cannot read.
- brand_guess: only if a logo or wordmark is clearly visible, else null.
- style_keywords: lowercase descriptors useful for catalogue search
  (e.g. "chunky", "low-top", "retro-runner", "suede-overlay").
- confidence: how confident you are that this is a clear photo of a single product.
- If the image is not a product photo at all, set is_footwear false, confidence 0
  and explain in description.
- Reply with a single JSON object and nothing else.`;

/** Read a product photo into structured attributes. */
export async function describeImage(imageDataUrl) {
  const res = await complete({
    system: SYSTEM,
    user: 'Identify this product and return the JSON described in your instructions.',
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

  const filters = {
    keywords: [attrs.silhouette, attrs.product_type, ...attrs.style_keywords].filter(Boolean).slice(0, 6),
    brands: [],
    category_slugs: [],
    colors: [attrs.primary_color, ...attrs.secondary_colors].filter(Boolean).slice(0, 3),
    min_price_cents: null,
    max_price_cents: null,
    on_sale_only: false,
    sort: 'relevance',
  };

  let results = await runFilters(filters, spaceId, limit);

  // If the tight filter finds nothing, widen to colour + type only.
  if (!results.length) {
    results = await runFilters(
      { ...filters, keywords: [attrs.product_type].filter(Boolean), colors: [attrs.primary_color].filter(Boolean) },
      spaceId,
      limit
    );
  }

  return { attrs, results, meta, filters };
}
