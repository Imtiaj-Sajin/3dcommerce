// Search agent: turns a shopper sentence into structured catalogue filters,
// then runs a real SQL query. The model never sees the database - it only
// produces a filter object we validate and execute ourselves.

import { z } from 'zod';
import { complete } from './providers.js';
import { screenInput, asUntrusted, validateOutput } from './guardrails.js';
import { q } from '../lib/db.js';
import { activeDiscounts, applyPricing } from '../lib/pricing.js';
import { shapeAll } from '../lib/shape.js';

export const filterSchema = z.object({
  keywords: z.array(z.string().max(40)).max(8).default([]),
  brands: z.array(z.string().max(60)).max(6).default([]),
  category_slugs: z.array(z.string().max(60)).max(6).default([]),
  colors: z.array(z.string().max(30)).max(5).default([]),
  min_price_cents: z.number().int().nonnegative().nullable().default(null),
  max_price_cents: z.number().int().nonnegative().nullable().default(null),
  on_sale_only: z.boolean().default(false),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest']).default('relevance'),
  explanation: z.string().max(240).default(''),
});

const SYSTEM = `You convert a shopper's sentence into catalogue search filters for a sneaker store.
- Use ONLY brands and category slugs from the provided lists; drop anything else.
- Prices are integers in cents ($150 = 15000).
- "cheap"/"budget" implies max_price_cents around 10000; "premium" implies min_price_cents around 18000.
- Put descriptive words (silhouette, vibe, use case) into keywords.
- explanation: one short sentence describing what you searched for, addressed to the shopper.
- Reply with a single JSON object and nothing else.`;

/** Ask the model for filters (falls back to plain keyword search on failure). */
export async function planSearch(rawQuery, spaceId) {
  const screened = screenInput(rawQuery, { field: 'query', maxChars: 500 });

  const [brands, cats] = await Promise.all([
    q(`SELECT DISTINCT brand FROM products WHERE space_id = ? AND brand IS NOT NULL AND status='active'`, [spaceId]),
    q(`SELECT slug, name FROM categories WHERE space_id = ? AND is_active = 1`, [spaceId]),
  ]);

  const user = [
    `Brands available: ${brands.map((b) => b.brand).join(', ') || '(none)'}`,
    `Category slugs available: ${cats.map((c) => `${c.slug} (${c.name})`).join(', ') || '(none)'}`,
    '',
    'Shopper query:',
    asUntrusted('query', screened.text),
    '',
    'Return JSON with keys: keywords, brands, category_slugs, colors,',
    'min_price_cents, max_price_cents, on_sale_only, sort, explanation.',
  ].join('\n');

  const res = await complete({ system: SYSTEM, user, wantJSON: true, maxTokens: 600, temperature: 0.2 });
  const valid = validateOutput(filterSchema, res.json);
  if (!valid.ok) {
    const err = new Error(`search plan failed validation: ${valid.error}`);
    err.meta = res;
    throw err;
  }
  return { filters: valid.data, meta: res, flags: screened.flags, cleanQuery: screened.text };
}

/** Execute validated filters against the catalogue. */
export async function runFilters(filters, spaceId, limit = 24) {
  const where = ['p.space_id = ?', "p.status = 'active'"];
  const params = [spaceId];

  const terms = [...(filters.keywords || []), ...(filters.colors || [])].filter(Boolean);
  if (terms.length) {
    // Boolean-mode fulltext over the denormalised search text.
    const expr = terms.map((t) => `${t.replace(/[+\-><()~*"@]/g, ' ').trim()}*`).filter(Boolean).join(' ');
    if (expr) {
      where.push('MATCH(ps.content) AGAINST (? IN BOOLEAN MODE)');
      params.push(expr);
    }
  }
  if (filters.brands?.length) {
    where.push(`p.brand IN (${filters.brands.map(() => '?').join(',')})`);
    params.push(...filters.brands);
  }
  if (filters.category_slugs?.length) {
    where.push(`c.slug IN (${filters.category_slugs.map(() => '?').join(',')})`);
    params.push(...filters.category_slugs);
  }
  if (filters.min_price_cents != null) {
    where.push('p.price_cents >= ?');
    params.push(filters.min_price_cents);
  }
  if (filters.max_price_cents != null) {
    where.push('p.price_cents <= ?');
    params.push(filters.max_price_cents);
  }

  const order =
    filters.sort === 'price_asc' ? 'p.price_cents ASC'
    : filters.sort === 'price_desc' ? 'p.price_cents DESC'
    : filters.sort === 'newest' ? 'p.created_at DESC'
    : terms.length ? 'MATCH(ps.content) AGAINST (?) DESC' : 'p.id ASC';

  const orderParams = order.startsWith('MATCH') ? [terms.join(' ')] : [];

  const rows = await q(
    `SELECT p.id, p.slug, p.name, p.brand, p.short_description, p.price_cents, p.currency,
            p.badge, p.category_id, p.space_id, c.slug AS category_slug, c.name AS category_name,
            c.accent_color, i.file_path AS image
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_search ps ON ps.product_id = p.id
       LEFT JOIN product_images i ON i.product_id = p.id AND i.is_primary = 1
      WHERE ${where.join(' AND ')}
      ORDER BY ${order}
      LIMIT ?`,
    [...params, ...orderParams, Number(limit)]
  );

  const priced = applyPricing(rows, await activeDiscounts());
  const kept = filters.on_sale_only ? priced.filter((p) => p.on_sale) : priced;
  return shapeAll(kept);
}

/** Keyword-only fallback used when the model is unavailable. */
export async function plainSearch(text, spaceId, limit = 24) {
  const terms = String(text || '')
    .split(/\s+/)
    .map((t) => t.replace(/[^\w-]/g, ''))
    .filter((t) => t.length > 1)
    .slice(0, 6);
  return runFilters({ keywords: terms, sort: 'relevance' }, spaceId, limit);
}
