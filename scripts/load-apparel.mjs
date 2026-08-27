// Builds the two clothing stores from real product data.
//
//   node scripts/load-apparel.mjs            fetch, download images, publish
//   node scripts/load-apparel.mjs --reset    remove existing products first
//   node scripts/load-apparel.mjs --no-images   reuse images already on disk
//
// Source is DummyJSON, a free keyless product-catalogue API meant for exactly
// this: real photographs, titles, prices and copy, no key and no licence
// trouble. Everything goes in through the admin API, so the same capacity
// rules, SKU generation, variants and search indexing apply as if a human had
// typed it.

import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const BASE = process.env.SMOKE_BASE || 'http://localhost:8787';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@metamart.local';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe!2026';
const SRC = 'https://dummyjson.com';
const IMG_DIR = path.resolve('public', 'products', 'apparel');

const RESET = process.argv.includes('--reset');
const SKIP_IMAGES = process.argv.includes('--no-images');

/* ------------------------------------------------------------------ */
/*  what each store sells                                              */
/* ------------------------------------------------------------------ */

const STORES = {
  menswear: {
    name: "Men's Wear",
    tagline: 'Shirts, shoes and the things that finish them.',
    description:
      'Four walls of everyday menswear: shirts you will actually reach for, ' +
      'trainers with some history, and the watches and shades that finish a fit.',
    accent: '#4cc9f0',
    highlight: { code: 'new_in', title: 'NEW IN', subtitle: 'Fresh on the rails', accent: '#4cc9f0' },
    categories: [
      { slug: 'shirts',     name: 'Shirts',     accent: '#4cc9f0', source: 'mens-shirts', sizes: 'ALPHA' },
      { slug: 'footwear',   name: 'Footwear',   accent: '#5bd1ff', source: 'mens-shoes',  sizes: 'EU' },
      { slug: 'watches',    name: 'Watches',    accent: '#38b6e0', source: 'mens-watches', sizes: 'ONE' },
      { slug: 'sunglasses', name: 'Sunglasses', accent: '#2f9fd0', source: 'sunglasses',  sizes: 'ONE' },
    ],
  },
  womenswear: {
    name: "Women's Wear",
    tagline: 'Dresses, tops and everything alongside them.',
    description:
      'Six walls that run from everyday tops to evening gowns, with the bags, ' +
      'shoes, watches and jewellery that go with them.',
    accent: '#ff7ab6',
    highlight: { code: 'new_in', title: 'NEW IN', subtitle: 'Just landed', accent: '#ff7ab6' },
    categories: [
      { slug: 'dresses',   name: 'Dresses',   accent: '#ff7ab6', source: 'womens-dresses',   sizes: 'ALPHA' },
      { slug: 'tops',      name: 'Tops',      accent: '#ff9ec9', source: 'tops',             sizes: 'ALPHA' },
      { slug: 'bags',      name: 'Bags',      accent: '#f06fae', source: 'womens-bags',      sizes: 'ONE' },
      { slug: 'footwear-w', name: 'Footwear', accent: '#e05c9c', source: 'womens-shoes',     sizes: 'EU' },
      { slug: 'watches-w', name: 'Watches',   accent: '#ff8fc0', source: 'womens-watches',   sizes: 'ONE' },
      { slug: 'jewellery', name: 'Jewellery', accent: '#ffa9d1', source: 'womens-jewellery', sizes: 'ONE' },
    ],
  },
};

const SIZE_RUNS = {
  ALPHA: { system: 'ALPHA', labels: ['XS', 'S', 'M', 'L', 'XL'] },
  EU: { system: 'EU', labels: ['38', '39', '40', '41', '42', '43'] },
  ONE: { system: 'ONE_SIZE', labels: ['One size'] },
};

const MAX_PER_CATEGORY = 5;

/* ------------------------------------------------------------------ */
/*  api helper                                                         */
/* ------------------------------------------------------------------ */

let token = '';
async function api(p, { method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${json?.error || text.slice(0, 160)}`);
  return json;
}

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
    .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 90);

/* ------------------------------------------------------------------ */
/*  images                                                             */
/* ------------------------------------------------------------------ */

/** Fetch one product photo and normalise it the way the admin upload does. */
async function saveImage(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .resize(1400, 1000, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(IMG_DIR, file));
  return buf.length;
}

/* ------------------------------------------------------------------ */

console.log(`signing in to ${BASE}`);
token = (await api('/api/admin/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).token;

const architectures = (await api('/api/admin/architectures')).architectures;
// The gallery blueprint has no 3D room yet, so these stores use the L-hall -
// the geometry the client can actually render today.
const lHall = architectures.find((a) => a.code === 'l_hall');
if (!lHall) throw new Error('l_hall architecture missing - run npm run db:apply first');

await mkdir(IMG_DIR, { recursive: true });

let created = 0;
let updated = 0;
let imagesFetched = 0;

for (const [spaceSlug, def] of Object.entries(STORES)) {
  console.log(`\n=== ${def.name} ===`);

  if (def.categories.length > lHall.max_categories) {
    throw new Error(`${spaceSlug}: ${def.categories.length} categories, room fits ${lHall.max_categories}`);
  }

  /* ---- space ---- */
  const current = await api(`/api/admin/spaces/${spaceSlug}`);
  const spaceId = current.space.id;
  await api(`/api/admin/spaces/${spaceId}`, {
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

  if (RESET) {
    const existing = (await api(`/api/admin/products?space=${spaceSlug}`)).products;
    for (const p of existing) await api(`/api/admin/products/${p.id}?hard=1`, { method: 'DELETE' });
    if (existing.length) console.log(`  removed ${existing.length} old products`);
  }

  /* ---- categories ----
   * Slots are unique per space, so a straight reassignment collides with
   * whatever already holds the slot. Retire what is gone, park the survivors
   * somewhere unused, then lay them out in their final order. */
  const after = await api(`/api/admin/spaces/${spaceSlug}`);
  const keep = new Set(def.categories.map((c) => c.slug));

  for (const c of after.categories) {
    if (!keep.has(c.slug)) {
      await api(`/api/admin/categories/${c.id}?force=1`, { method: 'DELETE' }).catch(() => {});
      console.log(`  retired old category: ${c.name}`);
    }
  }

  // Park at the top of the valid slot range (the API caps it at 31), which is
  // far from the 0..7 slots the room actually uses.
  const survivors = after.categories.filter((c) => keep.has(c.slug));
  for (const [i, c] of survivors.entries()) {
    await api(`/api/admin/categories/${c.id}`, { method: 'PATCH', body: { slot_index: 31 - i } });
  }

  const bySlug = new Map(survivors.map((c) => [c.slug, c]));
  for (const [i, cat] of def.categories.entries()) {
    if (bySlug.has(cat.slug)) {
      await api(`/api/admin/categories/${bySlug.get(cat.slug).id}`, {
        method: 'PATCH',
        body: { name: cat.name, accent_color: cat.accent, slot_index: i },
      });
    } else {
      const r = await api('/api/admin/categories', {
        method: 'POST',
        body: { space_id: spaceId, slug: cat.slug, name: cat.name, accent_color: cat.accent, slot_index: i },
      });
      bySlug.set(cat.slug, r.category);
    }
  }
  console.log(`  categories: ${def.categories.map((c) => c.name).join(', ')}`);

  /* ---- products ---- */
  const existingProducts = (await api(`/api/admin/products?space=${spaceSlug}`)).products;
  const bySlugProd = new Map(existingProducts.map((p) => [p.slug, p]));
  // Slugs are unique per space, and the feed contains near-identical titles
  // ("... Off White & Red" vs "... Off White Red"), so namespace by category
  // and disambiguate anything that still lands on the same string.
  const usedSlugs = new Set(existingProducts.map((p) => p.slug));

  for (const cat of def.categories) {
    const feed = await (await fetch(`${SRC}/products/category/${cat.source}?limit=50`)).json();
    const items = (feed.products || []).filter((p) => p.images?.length).slice(0, MAX_PER_CATEGORY);
    const run = SIZE_RUNS[cat.sizes];

    for (const [i, src] of items.entries()) {
      let slug = `${cat.slug}-${slugify(src.title)}`.slice(0, 110);
      if (usedSlugs.has(slug) && !bySlugProd.has(slug)) {
        let n = 2;
        while (usedSlugs.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
      usedSlugs.add(slug);
      const file = `${spaceSlug}-${cat.slug}-${i}.jpg`;

      if (!SKIP_IMAGES) {
        try {
          await saveImage(src.images[0], file);
          imagesFetched++;
        } catch (e) {
          console.log(`    ! image failed for ${src.title}: ${e.message}`);
        }
      }

      // DummyJSON prices are already sensible retail numbers.
      const body = {
        space_id: spaceId,
        category_id: bySlug.get(cat.slug).id,
        name: src.title,
        slug,
        brand: src.brand || null,
        short_description: (src.description || '').split('. ')[0].slice(0, 300),
        description: src.description || null,
        price_cents: Math.round(Number(src.price) * 100),
        badge: i === 0 ? 'NEW' : (src.rating >= 4.5 ? 'TRENDING' : null),
        colorway: null,
        material: null,
        stock: Math.max(1, Math.round(Number(src.stock) || 10)),
        status: 'active',
        slot_index: i,
        image_path: `products/apparel/${file}`,
        size_system: run.system,
        sizes: run.labels,
        tags: (src.tags || []).slice(0, 6),
      };

      const existing = bySlugProd.get(slug);
      if (existing) {
        await api(`/api/admin/products/${existing.id}`, { method: 'PATCH', body });
        updated++;
      } else {
        await api('/api/admin/products', { method: 'POST', body });
        created++;
      }
      process.stdout.write(`    ${cat.name}: ${src.title}\n`);
    }
  }

  /* ---- highlight island ---- */
  const now = await api(`/api/admin/spaces/${spaceSlug}`);
  // The API slugifies codes on the way in, so "new_in" is stored as "new-in".
  // Compare with separators stripped rather than exactly.
  const norm = (c) => String(c || '').toLowerCase().replace(/[-_\s]/g, '');
  let hl = now.highlights.find((h) => norm(h.code) === norm(def.highlight.code));
  if (!hl) {
    hl = (await api('/api/admin/highlights', {
      method: 'POST',
      body: {
        space_id: spaceId, code: def.highlight.code, title: def.highlight.title,
        subtitle: def.highlight.subtitle, accent_color: def.highlight.accent,
      },
    })).highlight;
  }
  await api(`/api/admin/highlights/${hl.id}/activate`, { method: 'POST' });

  const all = (await api(`/api/admin/products?space=${spaceSlug}&status=active`)).products;
  const picks = [
    ...all.filter((p) => p.badge === 'NEW'),
    ...all.filter((p) => p.badge !== 'NEW').sort((a, b) => b.price_cents - a.price_cents),
  ].slice(0, lHall.highlight_capacity).map((p) => p.id);
  await api(`/api/admin/highlights/${hl.id}/items`, { method: 'PUT', body: { productIds: picks } });
  console.log(`  island "${def.highlight.title}": ${picks.length} pieces`);
}

const re = await api('/api/admin/reindex', { method: 'POST' });
console.log(`\nsearch index rebuilt for ${re.reindexed} products`);
console.log(`created ${created}, updated ${updated}, images fetched ${imagesFetched}`);
