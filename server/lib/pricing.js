// Discount resolution. Money is integer cents everywhere.
//
// A product can be hit by several discounts (its own, its category's, its
// space's, or a global one). We pick ONE winner: highest priority first,
// then the biggest saving. Never stack - stacking is how shops lose money
// by accident.

import { q } from './db.js';

const SCOPE_RANK = { product: 4, category: 3, space: 2, global: 1 };

/** All discounts that are live right now. */
export async function activeDiscounts() {
  return q(
    `SELECT id, code, name, kind, value, scope, target_id, priority
       FROM discounts
      WHERE is_active = 1
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at   IS NULL OR ends_at   >= NOW())`
  );
}

function savingCents(d, priceCents) {
  if (d.kind === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(d.value)));
    return Math.round((priceCents * pct) / 100);
  }
  return Math.min(priceCents, Number(d.value)); // fixed cents off
}

/**
 * Pick the winning discount for one product.
 * @param {{price_cents:number, id:number, category_id:number, space_id:number}} p
 * @param {Array} discounts result of activeDiscounts()
 */
export function resolveForProduct(p, discounts) {
  const candidates = discounts.filter((d) => {
    if (d.scope === 'global') return true;
    if (d.scope === 'product') return Number(d.target_id) === Number(p.id);
    if (d.scope === 'category') return Number(d.target_id) === Number(p.category_id);
    if (d.scope === 'space') return Number(d.target_id) === Number(p.space_id);
    return false;
  });
  if (!candidates.length) return null;

  let best = null;
  let bestSave = -1;
  for (const d of candidates) {
    const save = savingCents(d, p.price_cents);
    if (
      best === null ||
      d.priority > best.priority ||
      (d.priority === best.priority && save > bestSave) ||
      (d.priority === best.priority && save === bestSave && SCOPE_RANK[d.scope] > SCOPE_RANK[best.scope])
    ) {
      best = d;
      bestSave = save;
    }
  }
  return { discount: best, saving_cents: bestSave };
}

/**
 * Decorate products with final pricing fields, in place-safe fashion.
 * Returns a new array.
 */
export function applyPricing(products, discounts) {
  return products.map((p) => {
    const hit = resolveForProduct(p, discounts);
    const price = Number(p.price_cents);
    if (!hit) {
      return {
        ...p,
        price_cents: price,
        final_price_cents: price,
        discount: null,
        on_sale: false,
      };
    }
    const final = Math.max(0, price - hit.saving_cents);
    return {
      ...p,
      price_cents: price,
      final_price_cents: final,
      on_sale: final < price,
      discount: {
        id: hit.discount.id,
        name: hit.discount.name,
        kind: hit.discount.kind,
        value: Number(hit.discount.value),
        saving_cents: hit.saving_cents,
        percent_off: price > 0 ? Math.round((hit.saving_cents / price) * 100) : 0,
      },
    };
  });
}

export const fmt = (cents, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
