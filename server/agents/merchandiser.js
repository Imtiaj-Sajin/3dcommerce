// Merchandiser agent - suggests which products belong on the centre island
// for a given campaign ("Sale", "Popular", "New Arrivals", or a custom name).
//
// It returns product ids only, chosen from a list we supply, so the result
// is always a valid selection an admin can accept with one click.

import { z } from 'zod';
import { complete } from './providers.js';
import { screenInput, asUntrusted, validateOutput } from './guardrails.js';
import { q } from '../lib/db.js';
import { activeDiscounts, applyPricing } from '../lib/pricing.js';

export const merchSchema = z.object({
  picks: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        reason: z.string().max(160),
      })
    )
    .max(12),
  headline: z.string().max(60).optional(),
  subtitle: z.string().max(160).optional(),
});

const SYSTEM = `You are a visual merchandiser for a 3D sneaker store.
Pick the products that best fit the campaign brief for the centre display island.
- Choose ONLY from the candidate product ids provided. Never invent an id.
- Pick exactly the requested number unless there are fewer candidates.
- Aim for visual variety: mix colours, silhouettes and brands where possible.
- reason: one short sentence for the admin explaining the pick.
- headline: a punchy sign title, max 18 characters, uppercase.
- Reply with a single JSON object and nothing else.`;

/**
 * @param {number} spaceId
 * @param {string} brief   e.g. "sale", "popular", or free text from the admin
 * @param {number} slots   how many products the island can hold
 */
export async function suggestHighlight(spaceId, brief, slots = 4) {
  const screened = screenInput(brief, { field: 'brief', maxChars: 400 });

  const rows = await q(
    `SELECT p.id, p.name, p.brand, p.price_cents, p.badge, p.category_id, p.space_id,
            p.short_description, c.name AS category_name, p.created_at
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.space_id = ? AND p.status = 'active'
      ORDER BY p.id`,
    [spaceId]
  );
  if (!rows.length) throw Object.assign(new Error('no active products in this space'), { status: 400 });

  const priced = applyPricing(rows, await activeDiscounts());
  const catalogue = priced
    .map(
      (p) =>
        `id=${p.id} | ${p.name} | ${p.brand ?? '-'} | ${p.category_name} | $${(p.final_price_cents / 100).toFixed(0)}` +
        `${p.on_sale ? ` (was $${(p.price_cents / 100).toFixed(0)}, ${p.discount.percent_off}% off)` : ''}` +
        `${p.badge ? ` | badge=${p.badge}` : ''}`
    )
    .join('\n');

  const user = [
    `Campaign brief: ${asUntrusted('brief', screened.text || 'general highlight')}`,
    `Slots to fill: ${slots}`,
    '',
    'Candidate products:',
    catalogue,
    '',
    'Return JSON with keys: picks (array of {product_id, reason}), headline, subtitle.',
  ].join('\n');

  const res = await complete({ system: SYSTEM, user, wantJSON: true, maxTokens: 900, temperature: 0.6 });
  const valid = validateOutput(merchSchema, res.json);
  if (!valid.ok) {
    const err = new Error(`merchandiser output failed validation: ${valid.error}`);
    err.meta = res;
    throw err;
  }

  // Drop any id the model invented, then trim to the island's capacity.
  const byId = new Map(priced.map((p) => [p.id, p]));
  const flags = [...screened.flags];
  const picks = valid.data.picks
    .filter((pick) => {
      if (byId.has(pick.product_id)) return true;
      flags.push(`dropped_unknown_id:${pick.product_id}`);
      return false;
    })
    .slice(0, slots)
    .map((pick) => ({ ...pick, product: byId.get(pick.product_id) }));

  return { picks, headline: valid.data.headline, subtitle: valid.data.subtitle, meta: res, flags };
}
