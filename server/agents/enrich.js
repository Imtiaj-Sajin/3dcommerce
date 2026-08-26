// Product enrichment agent.
//
// Given whatever the admin has typed so far (and optionally the product
// photo), propose values for every remaining field. The admin accepts a
// suggestion with Tab / Arrow, so the output must be conservative: real
// categories only, sane prices, no invented brand claims.

import { z } from 'zod';
import { complete } from './providers.js';
import { screenInput, asUntrusted, validateOutput, clampPriceCents } from './guardrails.js';
import { q } from '../lib/db.js';

// Models fill optional fields loosely (a badge we never listed, a null array,
// "European" instead of "EU"). Rejecting the whole response for that would be
// hostile - normalise the soft fields and only hard-fail on the ones that
// actually matter: name, copy, category and price.
const BADGES = ['NEW', 'ICON', 'TRENDING', 'HEAT', 'LIMITED', 'SALE'];
const SIZE_SYSTEMS = ['EU', 'US', 'UK', 'ALPHA', 'ONE_SIZE'];

const badge = z.preprocess((v) => {
  const s = String(v ?? '').toUpperCase().trim();
  return BADGES.includes(s) ? s : null;
}, z.enum(BADGES).nullable());

const sizeSystem = z.preprocess((v) => {
  const s = String(v ?? '').toUpperCase().trim();
  if (SIZE_SYSTEMS.includes(s)) return s;
  if (s.startsWith('EU')) return 'EU';
  if (s.startsWith('US')) return 'US';
  if (s.startsWith('UK')) return 'UK';
  if (s.includes('ONE')) return 'ONE_SIZE';
  if (['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ALPHA'].includes(s)) return 'ALPHA';
  return 'EU';
}, z.enum(SIZE_SYSTEMS));

const strList = (max, len) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, max) : []),
    z.array(z.string().max(len))
  );

const nullableStr = (len) =>
  z.preprocess((v) => (v == null || v === '' ? null : String(v).slice(0, len)), z.string().max(len).nullable());

export const enrichSchema = z.object({
  name: z.string().min(2).max(200),
  brand: nullableStr(120),
  short_description: z.preprocess((v) => String(v ?? '').slice(0, 320), z.string().max(320)),
  description: z.preprocess((v) => String(v ?? '').slice(0, 4000), z.string().max(4000)),
  category_slug: z.string().max(60),
  price_cents: z.preprocess((v) => Math.round(Number(v) || 0), z.number().int().positive()),
  badge,
  colorway: nullableStr(120),
  material: nullableStr(120),
  tags: strList(12, 40),
  size_system: sizeSystem,
  sizes: strList(20, 24),
  confidence: z.preprocess(
    (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
    z.record(z.string(), z.coerce.number().min(0).max(1))
  ),
  notes: nullableStr(500),
});

const SYSTEM = `You are the cataloguing assistant for METAMART, a 3D virtual shopping mall.
Your job is to complete a product listing from partial information.

Rules you must follow:
- Choose category_slug ONLY from the provided list of available categories. Never invent one.
- Write marketing copy that is vivid but factual. Never invent specifications,
  materials, technologies, certifications, or performance claims you cannot see.
- If you are unsure about a field, still provide your best guess but give it a
  low confidence score. Do not leave required fields empty.
- price_cents is an integer in cents (a $129 shoe is 12900). Base it on the
  brand tier and product type. Stay within any price hint given.
- short_description: one punchy sentence, max 160 characters.
- description: 2-3 sentences of shop-floor copy with personality.
- tags: REQUIRED. Give 4-8 lowercase single words or short hyphenated phrases
  covering style, use, colour and material (e.g. "retro-runner", "white", "mesh").
- sizes: REQUIRED. List the sizes this product should stock, as strings.
  For footwear use EU numbers ("40" through "45"); for apparel use ALPHA ("S","M","L").
- colorway: the colours as a shop would write them, e.g. "white/grey/red".
- confidence: a 0-1 score for each field you filled, keyed by field name.
- Reply with a single JSON object and nothing else.`;

// If the model still leaves these out, fall back to something sensible rather
// than handing the admin an empty form.
const DEFAULT_SIZES = { EU: ['40', '41', '42', '43', '44', '45'], US: ['7', '8', '9', '10', '11', '12'], UK: ['6', '7', '8', '9', '10', '11'], ALPHA: ['S', 'M', 'L', 'XL'], ONE_SIZE: ['One size'] };

/**
 * @param {object} input
 * @param {number} input.spaceId
 * @param {string} input.name        partial name the admin typed
 * @param {string} [input.brand]
 * @param {string} [input.categoryHint]
 * @param {string} [input.priceHint]
 * @param {string} [input.imageDataUrl] data: URL of the product photo
 * @param {string} [input.notes]     free-text hint from the admin
 */
export async function runEnrich(input) {
  const categories = await q(
    `SELECT c.slug, c.name FROM categories c
      WHERE c.space_id = ? AND c.is_active = 1 ORDER BY c.sort_order`,
    [input.spaceId]
  );
  if (!categories.length) {
    throw Object.assign(new Error('space has no categories to file this product under'), { status: 400 });
  }

  const flags = [];
  const clean = (v, field) => {
    if (!v) return '';
    const s = screenInput(v, { field, maxChars: 2000 });
    flags.push(...s.flags.map((f) => `${field}:${f}`));
    return s.text;
  };

  const name = clean(input.name, 'name');
  const brand = clean(input.brand, 'brand');
  const notes = clean(input.notes, 'notes');
  const categoryHint = clean(input.categoryHint, 'categoryHint');
  const priceHint = clean(input.priceHint, 'priceHint');

  const catList = categories.map((c) => `- ${c.slug} (${c.name})`).join('\n');
  const user = [
    `Available categories for this space:\n${catList}`,
    '',
    'Partial product information from the admin:',
    asUntrusted('product_draft', [
      `name: ${name || '(blank)'}`,
      `brand: ${brand || '(blank)'}`,
      `category hint: ${categoryHint || '(none)'}`,
      `price hint: ${priceHint || '(none)'}`,
      `notes: ${notes || '(none)'}`,
    ].join('\n')),
    '',
    input.imageDataUrl
      ? 'A product photo is attached. Use it to judge colour, material and product type.'
      : 'No photo was provided; infer from the text only.',
    '',
    'Return the completed listing as JSON with keys: name, brand, short_description,',
    'description, category_slug, price_cents, badge, colorway, material, tags,',
    'size_system, sizes, confidence, notes.',
  ].join('\n');

  const res = await complete({
    system: SYSTEM,
    user,
    images: input.imageDataUrl ? [input.imageDataUrl] : [],
    wantJSON: true,
    maxTokens: 1400,
    temperature: 0.5,
  });

  const valid = validateOutput(enrichSchema, res.json);
  if (!valid.ok) {
    const err = new Error(`enrich output failed validation: ${valid.error}`);
    err.raw = res.json;
    err.meta = res;
    throw err;
  }

  const data = valid.data;

  // Post-validation clamps: the model must not be able to set a silly price
  // or file the product under a category that does not exist.
  const allowed = new Set(categories.map((c) => c.slug));
  if (!allowed.has(data.category_slug)) {
    flags.push(`category_corrected:${data.category_slug}`);
    data.category_slug = categoryHint && allowed.has(categoryHint) ? categoryHint : categories[0].slug;
  }
  const clamped = clampPriceCents(data.price_cents);
  if (clamped !== data.price_cents) flags.push('price_clamped');
  data.price_cents = clamped;
  // badge is already normalised to a known value or null by the schema.
  data.tags = [...new Set((data.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean))];

  if (!data.tags.length) {
    // Derive something usable from what we do have.
    data.tags = [data.category_slug, ...String(data.colorway || '').split(/[\/,\s]+/)]
      .map((t) => String(t).toLowerCase().trim())
      .filter((t) => t.length > 1)
      .slice(0, 6);
    flags.push('tags_defaulted');
  }
  if (!data.sizes.length) {
    data.sizes = DEFAULT_SIZES[data.size_system] || DEFAULT_SIZES.EU;
    flags.push('sizes_defaulted');
  }

  return { data, meta: res, flags };
}
