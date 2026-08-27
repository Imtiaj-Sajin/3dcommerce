// Concierge - the shop assistant a customer actually talks to.
//
// It is a coordinator, not a know-it-all: it decides what the shopper wants,
// calls the specialist agent that can answer it (search, vision, stylist),
// and then speaks about the REAL rows that came back. It never invents a
// product, because it only ever sees products the database returned.
//
// A turn costs at most two model calls:
//   1. plan     - what does this person want, and what should we look up?
//   2. compose  - say it, given what we actually found
// Small talk skips the lookup and answers in one.

import { z } from 'zod';
import { complete } from './providers.js';
import { screenInput, asUntrusted, validateOutput } from './guardrails.js';
import { planSearch, runFilters, plainSearch } from './search.js';
import { searchByImage } from './vision.js';
import { q, one } from '../lib/db.js';

/* ------------------------------------------------------------------ */
/*  plan                                                               */
/* ------------------------------------------------------------------ */

const INTENTS = ['find', 'refine', 'compare', 'try_on', 'cart', 'store_info', 'chitchat'];

const planSchema = z.object({
  intent: z.preprocess(
    (v) => (INTENTS.includes(String(v)) ? String(v) : 'find'),
    z.enum(INTENTS)
  ),
  search_query: z.preprocess((v) => (v == null ? '' : String(v).slice(0, 300)), z.string()),
  scope: z.preprocess(
    (v) => (v === 'this_store' ? 'this_store' : 'mall'),
    z.enum(['mall', 'this_store'])
  ),
  refers_to_product: z.preprocess(
    (v) => (v == null || v === '' ? null : String(v).slice(0, 120)),
    z.string().nullable()
  ),
  needs_lookup: z.preprocess((v) => v !== false, z.boolean()),
});

const PLAN_SYSTEM = `You triage messages for METAMART, a virtual mall selling footwear,
clothing and accessories across several stores.

Decide what the shopper wants:
- find       they want products (a category, a vibe, an occasion, a price)
- refine     they are narrowing what you just showed ("cheaper", "in black", "size 42")
- compare    they want two or more of the shown items weighed up
- try_on     they want to see something on themselves
- cart       adding, removing or asking about their basket
- store_info opening hours, which stores exist, where something is
- chitchat   greetings, thanks, anything not about shopping

search_query: what to actually look up, written as a plain shopping phrase.
  For "refine", fold the earlier context in - "cheaper" after white trainers
  becomes "white trainers under $100".
scope: "mall" unless they explicitly limit it to the store they are standing in.
refers_to_product: if they mention one of the products already shown, its name.
needs_lookup: false only for chitchat, cart questions and store_info.

Reply with a single JSON object and nothing else.`;

/* ------------------------------------------------------------------ */
/*  compose                                                            */
/* ------------------------------------------------------------------ */

const replySchema = z.object({
  reply: z.preprocess((v) => String(v ?? '').slice(0, 700), z.string().max(700)),
  highlight_names: z.preprocess(
    (v) => (Array.isArray(v) ? v.map(String).slice(0, 4) : []),
    z.array(z.string().max(120))
  ),
  suggestions: z.preprocess(
    (v) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 40)).slice(0, 3) : []),
    z.array(z.string().max(40))
  ),
});

const REPLY_SYSTEM = `You are the concierge at METAMART, a virtual mall. You are warm,
brief and useful - a good shop assistant, not a brochure.

Rules that matter:
- Speak ONLY about the products listed in the context. Never invent a product,
  a price, a colour or a stock level. If the list is empty, say so plainly and
  suggest what else to try.
- Two or three sentences. No bullet lists, no markdown, no emoji spam.
- Prices are already final. If something is marked on sale, it is worth saying.
- Mention at most three products by name; the shopper sees the full list as
  cards beside your message, so do not enumerate everything.
- highlight_names: the product names you actually referred to, spelled exactly
  as given.
- suggestions: up to 3 very short follow-ups the shopper might tap, in their
  voice, e.g. "Something cheaper", "Show me black ones", "Size 42?".
- Never ask for personal data. Never promise delivery dates or discounts that
  are not in the data.

Reply with a single JSON object: {"reply": "...", "highlight_names": [...], "suggestions": [...]}`;

/* ------------------------------------------------------------------ */

const shortProduct = (p) =>
  `${p.name} | ${p.brand ?? 'no brand'} | ${p.categoryName} | ${p.spaceName ?? ''} | ` +
  `$${p.finalPrice}${p.onSale ? ` (was $${p.price})` : ''}${p.stock === 0 ? ' | OUT OF STOCK' : ''}`;

/** Products a shopper can meaningfully try on. */
const WEARABLE = /shirt|tee|t-shirt|hoodie|jacket|coat|dress|top|trouser|jean|short|skirt|knit|blazer|shoe|sneaker|trainer|boot|footwear|sunglass|watch|bag/i;

function canTryOn(p) {
  return WEARABLE.test(`${p.name} ${p.categoryName ?? ''}`);
}

/**
 * One conversational turn.
 * @param {object} input
 * @param {Array<{role:string, content:string}>} input.history
 * @param {string} input.message
 * @param {string} [input.imageDataUrl]
 * @param {number} [input.spaceId]      the store they are standing in
 * @param {Array}  [input.cart]         [{ name, price, size }]
 * @param {Array}  [input.shown]        product names already on screen
 */
export async function chat(input) {
  const flags = [];
  const screened = screenInput(input.message ?? '', { field: 'message', maxChars: 900 });
  flags.push(...screened.flags);

  const history = (input.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Shopper' : 'You'}: ${String(m.content).slice(0, 400)}`)
    .join('\n');

  const cart = input.cart ?? [];
  const cartText = cart.length
    ? cart.map((c) => `${c.name}${c.size ? ` (size ${c.size})` : ''} $${c.price}`).join('; ')
    : '(empty)';

  let meta = null;
  let products = [];
  let imageRead = null;

  /* ---------------- 1. an image short-circuits the planner ----------------
   * Hand the photo to the vision agent wholesale rather than re-deriving
   * filters here. It matches a legible brand against what the mall actually
   * carries and widens in stages if the tight query finds nothing - logic
   * that a second implementation only ever drifts away from. */
  if (input.imageDataUrl) {
    const seen = await searchByImage(input.imageDataUrl, null, 8);
    imageRead = seen.attrs;
    meta = seen.meta;
    products = seen.results;
    if (seen.note) flags.push('vision_low_confidence');

    // A photo usually arrives with words attached ("like this but cheaper").
    // Run those too, described in terms of what the photo showed, and append
    // anything new - the visual match still leads.
    if (screened.text.trim().length > 2) {
      const look = [imageRead.primary_color, imageRead.silhouette || imageRead.product_type]
        .filter(Boolean).join(' ');
      try {
        const planned = await planSearch(`${screened.text} (they showed a photo of ${look})`, null);
        const extra = await runFilters(planned.filters, null, 8);
        const have = new Set(products.map((p) => p.id));
        products = [...products, ...extra.filter((p) => !have.has(p.id))].slice(0, 10);
        flags.push('image_plus_text');
      } catch {
        flags.push('image_text_refine_failed');
      }
    }
  }

  /* ---------------- 2. plan ---------------- */
  let plan = { intent: 'find', search_query: screened.text, scope: 'mall', refers_to_product: null, needs_lookup: true };

  if (!input.imageDataUrl) {
    const planRes = await complete({
      system: PLAN_SYSTEM,
      user: [
        history ? `Conversation so far:\n${history}` : '(new conversation)',
        '',
        `Products currently on their screen: ${(input.shown ?? []).slice(0, 8).join(', ') || '(none)'}`,
        `Their basket: ${cartText}`,
        '',
        'New message:',
        asUntrusted('message', screened.text),
        '',
        'Return JSON: {"intent","search_query","scope","refers_to_product","needs_lookup"}',
      ].join('\n'),
      wantJSON: true,
      maxTokens: 350,
      temperature: 0.1,
    });
    const validPlan = validateOutput(planSchema, planRes.json);
    if (validPlan.ok) plan = validPlan.data;
    meta = planRes;

    /* ---------------- 3. look up ---------------- */
    if (plan.needs_lookup && plan.search_query) {
      const spaceId = plan.scope === 'this_store' ? input.spaceId ?? null : null;
      try {
        const planned = await planSearch(plan.search_query, spaceId);
        products = await runFilters(planned.filters, spaceId, 8);
      } catch {
        products = await plainSearch(plan.search_query, spaceId, 8);
        flags.push('concierge_search_fallback');
      }
    }
  }

  /* ---------------- 4. context the reply is allowed to use ---------------- */
  let storeInfo = '';
  if (plan.intent === 'store_info' || !products.length) {
    const stores = await q(
      `SELECT s.name, s.tagline,
              (SELECT COUNT(*) FROM products p WHERE p.space_id = s.id AND p.status='active') AS n
         FROM spaces s WHERE s.status = 'live' ORDER BY s.sort_order`
    );
    storeInfo = stores.map((s) => `${s.name} (${s.n} products)`).join(', ');
  }

  const composeRes = await complete({
    system: REPLY_SYSTEM,
    user: [
      history ? `Conversation so far:\n${history}` : '(new conversation)',
      '',
      'Shopper just said:',
      asUntrusted('message', screened.text || '(they sent a photo)'),
      '',
      imageRead
        ? `You looked at their photo and saw: ${imageRead.description} ` +
          `(${imageRead.primary_color} ${imageRead.silhouette ?? imageRead.product_type}` +
          `${imageRead.brand_guess ? `, possibly ${imageRead.brand_guess}` : ''}).`
        : '',
      '',
      products.length
        ? `Products found (these are the ONLY ones you may mention):\n${products.map(shortProduct).join('\n')}`
        : 'No products matched.',
      storeInfo ? `\nStores open right now: ${storeInfo}` : '',
      `\nTheir basket: ${cartText}`,
      '',
      'Return JSON: {"reply","highlight_names","suggestions"}',
    ].filter(Boolean).join('\n'),
    wantJSON: true,
    maxTokens: 500,
    temperature: 0.6,
  });

  const validReply = validateOutput(replySchema, composeRes.json);
  const said = validReply.ok
    ? validReply.data
    : { reply: products.length
          ? `Here is what I found${products[0] ? `, starting with the ${products[0].name}` : ''}.`
          : 'I could not find a match for that. Try describing it differently?',
        highlight_names: [], suggestions: [] };

  // The panel only has room for a few cards, and the reply is free to name any
  // of the results - so order the list by what it actually mentioned. Without
  // this the text can praise a gown while the cards show shirts.
  if (said.highlight_names.length && products.length > 1) {
    const rank = new Map();
    said.highlight_names.forEach((n, i) => rank.set(String(n).toLowerCase().trim(), i));
    products = [...products].sort((a, b) => {
      const ra = rank.has(a.name.toLowerCase()) ? rank.get(a.name.toLowerCase()) : 99;
      const rb = rank.has(b.name.toLowerCase()) ? rank.get(b.name.toLowerCase()) : 99;
      return ra - rb;
    });
  }

  // Cost is the sum of every model call this turn.
  const costUsd = (meta?.costUsd ?? 0) + (composeRes.costUsd ?? 0);
  const tokensIn = (meta?.tokensIn ?? 0) + (composeRes.tokensIn ?? 0);
  const tokensOut = (meta?.tokensOut ?? 0) + (composeRes.tokensOut ?? 0);

  /* ---------------- 5. what the shopper can do next ---------------- */
  const actions = [];
  const first = products[0];
  if (first) {
    actions.push({ type: 'view', productId: first.id, slug: first.slug, spaceSlug: first.spaceSlug, label: `View ${first.name}` });
    if (first.stock !== 0) {
      actions.push({ type: 'add_to_cart', productId: first.id, slug: first.slug, spaceSlug: first.spaceSlug, label: 'Add to cart' });
    }
    if (canTryOn(first)) {
      actions.push({ type: 'try_on', productId: first.id, slug: first.slug, spaceSlug: first.spaceSlug, label: 'See it on me' });
    }
  }
  if (cart.length) actions.push({ type: 'checkout', label: `Checkout (${cart.length})` });

  return {
    data: {
      reply: said.reply,
      suggestions: said.suggestions,
      highlight: said.highlight_names,
      products,
      actions,
      intent: plan.intent,
      sawImage: imageRead
        ? { description: imageRead.description, color: imageRead.primary_color, brandGuess: imageRead.brand_guess }
        : null,
    },
    meta: {
      provider: composeRes.provider,
      model: composeRes.model,
      costUsd, tokensIn, tokensOut,
      latencyMs: composeRes.latencyMs,
    },
    flags,
  };
}
