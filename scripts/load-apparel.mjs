// Builds the two clothing stores through the public admin API, so the same
// capacity rules, slug/SKU generation, variant handling and search indexing
// that a human admin would hit apply here too.
//
//   node scripts/load-apparel.mjs            create/update and go live
//   node scripts/load-apparel.mjs --reset    archive existing products first
//
// Re-runnable: existing products are matched by slug and updated in place.

import 'dotenv/config';
import { APPAREL } from './apparel-catalogue.mjs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:8787';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@metamart.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe!2026';
const RESET = process.argv.includes('--reset');

let token = '';

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error || text.slice(0, 160)}`);
  return json;
}

/* ---------------- sign in ---------------- */
{
  const r = await api('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  token = r.token;
  console.log(`signed in as ${r.user.email} (${r.user.role})\n`);
}

const architectures = (await api('/api/admin/architectures')).architectures;
// The gallery blueprint has no 3D room built yet, so these stores use the
// L-hall room, which is the geometry the client can actually render today.
const lHall = architectures.find((a) => a.code === 'l_hall');
if (!lHall) throw new Error('l_hall architecture missing - run npm run db:apply first');

let created = 0;
let updated = 0;

for (const [spaceSlug, def] of Object.entries(APPAREL)) {
  console.log(`=== ${def.name} (${spaceSlug}) ===`);

  /* ---------------- space ---------------- */
  const current = await api(`/api/admin/spaces/${spaceSlug}`);
  await api(`/api/admin/spaces/${current.space.id}`, {
    method: 'PATCH',
    body: {
      name: def.name,
      tagline: def.tagline,
      description: def.description,
      accent_color: def.accent,
      architecture_id: lHall.id,
      status: 'live',
    },
  });
  const spaceId = current.space.id;
  console.log(`  space -> live, room ${lHall.code} (${lHall.max_categories} zones x ${lHall.max_products_per_category})`);

  if (def.categories.length > lHall.max_categories) {
    throw new Error(`${spaceSlug} defines ${def.categories.length} categories, room fits ${lHall.max_categories}`);
  }

  if (RESET) {
    const existing = (await api(`/api/admin/products?space=${spaceSlug}`)).products;
    for (const p of existing) await api(`/api/admin/products/${p.id}?hard=1`, { method: 'DELETE' });
    if (existing.length) console.log(`  reset: removed ${existing.length} old products`);
  }

  /* ---------------- categories ---------------- */
  const after = await api(`/api/admin/spaces/${spaceSlug}`);
  const byslug = new Map(after.categories.map((c) => [c.slug, c]));

  for (const [i, cat] of def.categories.entries()) {
    if (byslug.has(cat.slug)) {
      const existing = byslug.get(cat.slug);
      await api(`/api/admin/categories/${existing.id}`, {
        method: 'PATCH',
        body: { name: cat.name, accent_color: cat.accent, slot_index: i },
      });
    } else {
      const r = await api('/api/admin/categories', {
        method: 'POST',
        body: { space_id: spaceId, slug: cat.slug, name: cat.name, accent_color: cat.accent, slot_index: i },
      });
      byslug.set(cat.slug, r.category);
    }
  }
  console.log(`  categories -> ${def.categories.map((c) => c.name).join(', ')}`);

  /* ---------------- products ---------------- */
  const existingProducts = (await api(`/api/admin/products?space=${spaceSlug}`)).products;
  const bySlugProd = new Map(existingProducts.map((p) => [p.slug, p]));
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  for (const cat of def.categories) {
    const category = byslug.get(cat.slug);
    for (const [i, p] of cat.products.entries()) {
      const slug = slugify(p.name);
      const body = {
        space_id: spaceId,
        category_id: category.id,
        name: p.name,
        slug,
        brand: p.brand,
        short_description: p.short,
        description: p.desc,
        price_cents: Math.round(p.price * 100),
        badge: p.badge ?? null,
        colorway: p.colorway,
        material: p.material,
        stock: 12 + ((i * 7) % 30),
        status: 'active',
        slot_index: i,
        image_path: `products/apparel/${spaceSlug}-${cat.slug}-${i}.jpg`,
        size_system: def.sizeSystem,
        sizes: def.sizes,
        tags: p.tags,
      };

      const existing = bySlugProd.get(slug);
      if (existing) {
        await api(`/api/admin/products/${existing.id}`, { method: 'PATCH', body });
        updated++;
      } else {
        await api('/api/admin/products', { method: 'POST', body });
        created++;
      }
    }
  }
  console.log(`  products  -> ${def.categories.reduce((n, c) => n + c.products.length, 0)}`);

  /* ---------------- highlight island ---------------- */
  const spaceNow = await api(`/api/admin/spaces/${spaceSlug}`);
  let hl = spaceNow.highlights.find((h) => h.code === def.highlight.code);
  if (!hl) {
    hl = (await api('/api/admin/highlights', {
      method: 'POST',
      body: {
        space_id: spaceId,
        code: def.highlight.code,
        title: def.highlight.title,
        subtitle: def.highlight.subtitle,
        accent_color: def.highlight.accent,
      },
    })).highlight;
  }
  await api(`/api/admin/highlights/${hl.id}/activate`, { method: 'POST' });

  // Fill the island with whatever this space badged NEW, topped up with the
  // priciest pieces so it never looks half-empty.
  const all = (await api(`/api/admin/products?space=${spaceSlug}&status=active`)).products;
  const newOnes = all.filter((p) => p.badge === 'NEW');
  const rest = all
    .filter((p) => p.badge !== 'NEW')
    .sort((a, b) => b.price_cents - a.price_cents);
  const picks = [...newOnes, ...rest].slice(0, lHall.highlight_capacity).map((p) => p.id);
  await api(`/api/admin/highlights/${hl.id}/items`, { method: 'PUT', body: { productIds: picks } });
  console.log(`  island    -> "${def.highlight.title}" with ${picks.length} pieces\n`);
}

/* ---------------- reindex for search ---------------- */
const re = await api('/api/admin/reindex', { method: 'POST' });
console.log(`search index rebuilt for ${re.reindexed} products`);
console.log(`\ncreated ${created}, updated ${updated}`);
