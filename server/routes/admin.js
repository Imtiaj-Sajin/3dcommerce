// Admin API - everything behind /api/admin requires a token except login.
//
// Capacity rules from the architecture are enforced here, not just in the UI:
// a space cannot hold more categories than its room has walls, and a category
// cannot hold more products than it has pedestals.

import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { mkdir } from 'fs/promises';
import { z } from 'zod';
import { q, one, exec, tx } from '../lib/db.js';
import { verifyLogin, signToken, requireAuth, requireRole, hashPassword } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { embed } from '../agents/providers.js';

export const router = express.Router();

const PRODUCTS_DIR = path.resolve(process.cwd(), 'public', 'products');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

/* ------------------------------------------------------------------ */
/*  auth                                                               */
/* ------------------------------------------------------------------ */

router.post('/login', async (req, res, next) => {
  try {
    const user = await verifyLogin(req.body.email, req.body.password);
    if (!user) return bad(res, 'invalid_credentials', 401);
    res.json({ token: signToken(user), user });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.admin }));

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const next_ = String(req.body.newPassword || '');
    if (next_.length < 8) return bad(res, 'password_too_short');
    const ok = await verifyLogin(req.admin.email, String(req.body.currentPassword || ''));
    if (!ok) return bad(res, 'current_password_wrong', 401);
    await exec('UPDATE admin_users SET password_hash = ? WHERE id = ?', [await hashPassword(next_), req.admin.id]);
    await audit(req, { action: 'change_password', entity: 'admin_user', entityId: req.admin.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.use(requireAuth);

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

async function spaceWithLimits(idOrSlug) {
  return one(
    `SELECT s.*, a.code AS architecture, a.max_categories, a.max_products_per_category,
            a.highlight_capacity, a.has_highlight_island, a.layout_json
       FROM spaces s JOIN architectures a ON a.id = s.architecture_id
      WHERE s.id = ? OR s.slug = ?`,
    [Number(idOrSlug) || 0, String(idOrSlug)]
  );
}

/** First unused slot index in [0, max). */
async function freeSlot(table, whereSql, params, max) {
  const rows = await q(`SELECT slot_index FROM ${table} WHERE ${whereSql}`, params);
  const used = new Set(rows.map((r) => r.slot_index));
  for (let i = 0; i < max; i++) if (!used.has(i)) return i;
  return null;
}

/* ------------------------------------------------------------------ */
/*  overview                                                           */
/* ------------------------------------------------------------------ */

router.get('/overview', async (_req, res, next) => {
  try {
    const [spaces, counts, jobs] = await Promise.all([
      q(`SELECT s.id, s.slug, s.name, s.status, s.accent_color, s.bay_index,
                a.code AS architecture, a.max_categories, a.max_products_per_category,
                (SELECT COUNT(*) FROM categories c WHERE c.space_id=s.id AND c.is_active=1) AS categories,
                (SELECT COUNT(*) FROM products p WHERE p.space_id=s.id AND p.status='active') AS products
           FROM spaces s JOIN architectures a ON a.id=s.architecture_id
          ORDER BY s.sort_order, s.id`),
      one(`SELECT
             (SELECT COUNT(*) FROM products WHERE status='active') AS products,
             (SELECT COUNT(*) FROM discounts WHERE is_active=1)    AS discounts,
             (SELECT COUNT(*) FROM spaces WHERE status='live')     AS live_spaces`),
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS cost FROM ai_jobs WHERE created_at >= CURDATE()`),
    ]);
    res.json({ spaces, counts, aiToday: jobs });
  } catch (e) { next(e); }
});

router.get('/architectures', async (_req, res, next) => {
  try {
    res.json({ architectures: await q('SELECT * FROM architectures ORDER BY id') });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  spaces                                                             */
/* ------------------------------------------------------------------ */

router.get('/spaces/:idOrSlug', async (req, res, next) => {
  try {
    const space = await spaceWithLimits(req.params.idOrSlug);
    if (!space) return bad(res, 'space_not_found', 404);
    const [categories, highlights, discounts] = await Promise.all([
      q(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status<>'archived') AS product_count
           FROM categories c WHERE c.space_id=? ORDER BY c.slot_index`, [space.id]),
      q(`SELECT h.*, (SELECT COUNT(*) FROM highlight_items hi WHERE hi.highlight_id=h.id) AS item_count
           FROM highlights h WHERE h.space_id=? ORDER BY h.sort_order`, [space.id]),
      q(`SELECT * FROM discounts WHERE (scope='global') OR (scope='space' AND target_id=?)
            OR (scope='category' AND target_id IN (SELECT id FROM categories WHERE space_id=?))
            OR (scope='product'  AND target_id IN (SELECT id FROM products   WHERE space_id=?))
          ORDER BY is_active DESC, priority DESC, id DESC`, [space.id, space.id, space.id]),
    ]);
    res.json({ space, categories, highlights, discounts });
  } catch (e) { next(e); }
});

const spacePatch = z.object({
  name: z.string().min(1).max(120).optional(),
  tagline: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: z.enum(['live', 'coming_soon', 'hidden']).optional(),
  architecture_id: z.number().int().positive().optional(),
  sort_order: z.number().int().optional(),
});

router.patch('/spaces/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const parsed = spacePatch.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0].message);
    const before = await one('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'space_not_found', 404);

    const fields = Object.entries(parsed.data);
    if (!fields.length) return res.json({ space: before });
    await exec(
      `UPDATE spaces SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(([, v]) => v), req.params.id]
    );
    const after = await one('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'update', entity: 'space', entityId: Number(req.params.id), before, after });
    res.json({ space: after });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  categories                                                         */
/* ------------------------------------------------------------------ */

const categoryBody = z.object({
  space_id: z.number().int().positive(),
  name: z.string().min(1).max(120),
  slug: z.string().max(60).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#00e5ff'),
  slot_index: z.number().int().min(0).max(31).optional(),
});

router.post('/categories', requireRole('editor'), async (req, res, next) => {
  try {
    const parsed = categoryBody.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0].message);
    const b = parsed.data;

    const space = await spaceWithLimits(b.space_id);
    if (!space) return bad(res, 'space_not_found', 404);

    const [{ n }] = await q('SELECT COUNT(*) n FROM categories WHERE space_id = ?', [b.space_id]);
    if (n >= space.max_categories) {
      return bad(res, `this room fits ${space.max_categories} categories and already has ${n}`, 409);
    }

    const slot = b.slot_index ?? (await freeSlot('categories', 'space_id = ?', [b.space_id], space.max_categories));
    if (slot === null) return bad(res, 'no free wall slot in this room', 409);

    const slug = slugify(b.slug || b.name);
    const dup = await one('SELECT id FROM categories WHERE space_id = ? AND slug = ?', [b.space_id, slug]);
    if (dup) return bad(res, 'a category with that slug already exists here', 409);

    const r = await exec(
      `INSERT INTO categories (space_id, slug, name, accent_color, slot_index, sort_order)
       VALUES (?,?,?,?,?,?)`,
      [b.space_id, slug, b.name, b.accent_color, slot, slot]
    );
    const after = await one('SELECT * FROM categories WHERE id = ?', [r.insertId]);
    await audit(req, { action: 'create', entity: 'category', entityId: r.insertId, after });
    res.status(201).json({ category: after });
  } catch (e) { next(e); }
});

router.patch('/categories/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'category_not_found', 404);
    const patch = categoryBody.partial().omit({ space_id: true }).safeParse(req.body);
    if (!patch.success) return bad(res, patch.error.issues[0].message);

    const data = { ...patch.data };
    if (data.slug) data.slug = slugify(data.slug);
    const fields = Object.entries(data);
    if (fields.length) {
      await exec(
        `UPDATE categories SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map(([, v]) => v), req.params.id]
      );
    }
    const after = await one('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'update', entity: 'category', entityId: Number(req.params.id), before, after });
    res.json({ category: after });
  } catch (e) { next(e); }
});

router.delete('/categories/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'category_not_found', 404);
    const [{ n }] = await q("SELECT COUNT(*) n FROM products WHERE category_id = ? AND status <> 'archived'", [req.params.id]);
    if (n > 0 && req.query.force !== '1') {
      return bad(res, `category still holds ${n} products - move or delete them first (or pass ?force=1)`, 409);
    }
    await exec('DELETE FROM categories WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'delete', entity: 'category', entityId: Number(req.params.id), before });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  products                                                           */
/* ------------------------------------------------------------------ */

router.get('/products', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.space) {
      const s = await spaceWithLimits(req.query.space);
      if (!s) return bad(res, 'space_not_found', 404);
      where.push('p.space_id = ?');
      params.push(s.id);
    }
    if (req.query.category) { where.push('p.category_id = ?'); params.push(Number(req.query.category)); }
    if (req.query.status) { where.push('p.status = ?'); params.push(String(req.query.status)); }
    if (req.query.q) {
      where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.sku LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }
    const rows = await q(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, s.slug AS space_slug,
              i.file_path AS image
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN spaces s     ON s.id = p.space_id
         LEFT JOIN product_images i ON i.product_id = p.id AND i.is_primary = 1
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY p.space_id, c.slot_index, p.slot_index
        LIMIT 500`,
      params
    );
    res.json({ products: rows });
  } catch (e) { next(e); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const p = await one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!p) return bad(res, 'product_not_found', 404);
    const [images, variants, tags] = await Promise.all([
      q('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [p.id]),
      q('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order', [p.id]),
      q('SELECT t.id, t.slug, t.name FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = ?', [p.id]),
    ]);
    res.json({ product: p, images, variants, tags });
  } catch (e) { next(e); }
});

const productBody = z.object({
  space_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  slug: z.string().max(120).optional(),
  sku: z.string().max(64).optional(),
  brand: z.string().max(120).nullable().optional(),
  short_description: z.string().max(320).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  price_cents: z.number().int().min(0),
  compare_at_price_cents: z.number().int().min(0).nullable().optional(),
  badge: z.string().max(32).nullable().optional(),
  colorway: z.string().max(120).nullable().optional(),
  material: z.string().max(120).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  slot_index: z.number().int().min(0).max(31).optional(),
  image_path: z.string().max(300).nullable().optional(),
  sizes: z.array(z.string().max(24)).max(24).optional(),
  size_system: z.enum(['EU', 'US', 'UK', 'ALPHA', 'ONE_SIZE']).default('EU'),
  tags: z.array(z.string().max(40)).max(16).optional(),
  ai_fields_json: z.any().optional(),
});

/** Shared write path for create and update. */
async function writeProduct(req, res, existing) {
  const schema = existing ? productBody.partial() : productBody;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const b = parsed.data;

  const spaceId = b.space_id ?? existing.space_id;
  const categoryId = b.category_id ?? existing.category_id;
  const space = await spaceWithLimits(spaceId);
  if (!space) return bad(res, 'space_not_found', 404);

  const cat = await one('SELECT * FROM categories WHERE id = ? AND space_id = ?', [categoryId, spaceId]);
  if (!cat) return bad(res, 'category does not belong to that space', 400);

  // Capacity: only when adding to a category, or moving between categories.
  const movingIn = !existing || Number(existing.category_id) !== Number(categoryId);
  if (movingIn) {
    const [{ n }] = await q(
      "SELECT COUNT(*) n FROM products WHERE category_id = ? AND status <> 'archived'",
      [categoryId]
    );
    if (n >= space.max_products_per_category) {
      return bad(
        res,
        `${cat.name} displays ${space.max_products_per_category} products and already has ${n}`,
        409
      );
    }
  }

  const slot =
    b.slot_index ??
    (movingIn
      ? await freeSlot('products', "category_id = ? AND status <> 'archived'", [categoryId], space.max_products_per_category)
      : existing.slot_index);

  const slug = slugify(b.slug || b.name || existing?.slug);
  const sku =
    b.sku ||
    existing?.sku ||
    `${space.slug.toUpperCase().slice(0, 3)}-${cat.slug.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase()}`;

  const cols = {
    space_id: spaceId,
    category_id: categoryId,
    sku,
    slug,
    name: b.name ?? existing?.name,
    brand: b.brand ?? existing?.brand ?? null,
    short_description: b.short_description ?? existing?.short_description ?? null,
    description: b.description ?? existing?.description ?? null,
    price_cents: b.price_cents ?? existing?.price_cents ?? 0,
    compare_at_price_cents: b.compare_at_price_cents ?? existing?.compare_at_price_cents ?? null,
    badge: b.badge ?? existing?.badge ?? null,
    colorway: b.colorway ?? existing?.colorway ?? null,
    material: b.material ?? existing?.material ?? null,
    stock: b.stock ?? existing?.stock ?? 0,
    status: b.status ?? existing?.status ?? 'active',
    slot_index: slot ?? 0,
    ai_fields_json: b.ai_fields_json ? JSON.stringify(b.ai_fields_json) : existing?.ai_fields_json ?? null,
  };

  const productId = await tx(async (conn) => {
    let id;
    if (existing) {
      const keys = Object.keys(cols);
      await conn.query(
        `UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => cols[k]), existing.id]
      );
      id = existing.id;
    } else {
      const keys = Object.keys(cols);
      const [r] = await conn.query(
        `INSERT INTO products (${keys.join(',')}, created_by) VALUES (${keys.map(() => '?').join(',')}, ?)`,
        [...keys.map((k) => cols[k]), req.admin.id]
      );
      id = r.insertId;
    }

    if (b.image_path) {
      await conn.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [id]);
      await conn.query(
        `INSERT INTO product_images (product_id, file_path, alt_text, sort_order, is_primary)
         VALUES (?,?,?,0,1)`,
        [id, b.image_path, `${cols.name} product photo`]
      );
    }

    if (b.sizes) {
      await conn.query('DELETE FROM product_variants WHERE product_id = ?', [id]);
      for (const [i, label] of b.sizes.entries()) {
        await conn.query(
          `INSERT INTO product_variants (product_id, size_label, size_system, stock, sort_order)
           VALUES (?,?,?,?,?)`,
          [id, String(label), b.size_system || 'EU', 10, i]
        );
      }
    }

    if (b.tags) {
      await conn.query('DELETE FROM product_tags WHERE product_id = ?', [id]);
      for (const raw of b.tags) {
        const tslug = slugify(raw);
        if (!tslug) continue;
        await conn.query('INSERT IGNORE INTO tags (slug, name) VALUES (?,?)', [tslug, raw]);
        const [[tag]] = await conn.query('SELECT id FROM tags WHERE slug = ?', [tslug]);
        if (tag) await conn.query('INSERT IGNORE INTO product_tags (product_id, tag_id, source) VALUES (?,?,?)', [id, tag.id, 'ai']);
      }
    }

    return id;
  });

  await reindexProduct(productId);
  const after = await one('SELECT * FROM products WHERE id = ?', [productId]);
  await audit(req, {
    action: existing ? 'update' : 'create',
    entity: 'product',
    entityId: productId,
    before: existing ?? null,
    after,
  });
  res.status(existing ? 200 : 201).json({ product: after });
}

router.post('/products', requireRole('editor'), (req, res, next) =>
  writeProduct(req, res, null).catch(next)
);

router.patch('/products/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const existing = await one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return bad(res, 'product_not_found', 404);
    await writeProduct(req, res, existing);
  } catch (e) { next(e); }
});

router.delete('/products/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'product_not_found', 404);
    if (req.query.hard === '1') {
      await exec('DELETE FROM products WHERE id = ?', [req.params.id]);
    } else {
      await exec("UPDATE products SET status = 'archived' WHERE id = ?", [req.params.id]);
    }
    await audit(req, { action: req.query.hard === '1' ? 'delete' : 'archive', entity: 'product', entityId: Number(req.params.id), before });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  image upload                                                       */
/* ------------------------------------------------------------------ */

router.post('/upload', requireRole('editor'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return bad(res, 'no file');
    await mkdir(PRODUCTS_DIR, { recursive: true });

    const base = slugify(req.body.name || path.parse(req.file.originalname).name || 'product');
    const filename = `${base}-${Date.now().toString(36)}.jpg`;

    // Normalise everything to a 1400x1000 white-background JPEG so the 3D
    // cards and the modal always get a predictable aspect ratio.
    await sharp(req.file.buffer)
      .rotate()
      .resize(1400, 1000, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(path.join(PRODUCTS_DIR, filename));

    const rel = `products/${filename}`;
    await audit(req, { action: 'upload', entity: 'image', after: { path: rel } });
    res.json({ path: rel, url: `/${rel}` });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  highlights (the centre island)                                     */
/* ------------------------------------------------------------------ */

const highlightBody = z.object({
  space_id: z.number().int().positive(),
  code: z.string().max(40).optional(),
  title: z.string().min(1).max(80),
  subtitle: z.string().max(160).nullable().optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff2d55'),
});

router.post('/highlights', requireRole('editor'), async (req, res, next) => {
  try {
    const parsed = highlightBody.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0].message);
    const b = parsed.data;
    const code = slugify(b.code || b.title);
    const r = await exec(
      `INSERT INTO highlights (space_id, code, title, subtitle, accent_color, is_active, sort_order)
       VALUES (?,?,?,?,?,0,(SELECT COALESCE(MAX(x.sort_order)+1,0) FROM (SELECT sort_order FROM highlights WHERE space_id=?) x))`,
      [b.space_id, code, b.title, b.subtitle ?? null, b.accent_color, b.space_id]
    );
    const after = await one('SELECT * FROM highlights WHERE id = ?', [r.insertId]);
    await audit(req, { action: 'create', entity: 'highlight', entityId: r.insertId, after });
    res.status(201).json({ highlight: after });
  } catch (e) { next(e); }
});

router.patch('/highlights/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM highlights WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'highlight_not_found', 404);
    const patch = highlightBody.partial().omit({ space_id: true }).safeParse(req.body);
    if (!patch.success) return bad(res, patch.error.issues[0].message);
    const fields = Object.entries(patch.data);
    if (fields.length) {
      await exec(`UPDATE highlights SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map(([, v]) => v), req.params.id]);
    }
    const after = await one('SELECT * FROM highlights WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'update', entity: 'highlight', entityId: Number(req.params.id), before, after });
    res.json({ highlight: after });
  } catch (e) { next(e); }
});

/** Make one highlight the live island display for its space. */
router.post('/highlights/:id/activate', requireRole('editor'), async (req, res, next) => {
  try {
    const hl = await one('SELECT * FROM highlights WHERE id = ?', [req.params.id]);
    if (!hl) return bad(res, 'highlight_not_found', 404);
    await tx(async (conn) => {
      await conn.query('UPDATE highlights SET is_active = 0 WHERE space_id = ?', [hl.space_id]);
      await conn.query('UPDATE highlights SET is_active = 1 WHERE id = ?', [hl.id]);
    });
    await audit(req, { action: 'activate', entity: 'highlight', entityId: hl.id, after: { space_id: hl.space_id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/highlights/:id/items', async (req, res, next) => {
  try {
    res.json({
      items: await q(
        `SELECT hi.id, hi.sort_order, p.id AS product_id, p.name, p.brand, p.price_cents,
                i.file_path AS image
           FROM highlight_items hi
           JOIN products p ON p.id = hi.product_id
           LEFT JOIN product_images i ON i.product_id = p.id AND i.is_primary = 1
          WHERE hi.highlight_id = ? ORDER BY hi.sort_order`,
        [req.params.id]
      ),
    });
  } catch (e) { next(e); }
});

/** Replace the island's product list in one shot. */
router.put('/highlights/:id/items', requireRole('editor'), async (req, res, next) => {
  try {
    const hl = await one('SELECT * FROM highlights WHERE id = ?', [req.params.id]);
    if (!hl) return bad(res, 'highlight_not_found', 404);
    const space = await spaceWithLimits(hl.space_id);
    const ids = Array.isArray(req.body.productIds) ? req.body.productIds.map(Number).filter(Boolean) : [];
    if (ids.length > space.highlight_capacity) {
      return bad(res, `the island holds ${space.highlight_capacity} products`, 409);
    }
    const owned = await q(
      `SELECT id FROM products WHERE space_id = ? AND id IN (${ids.length ? ids.map(() => '?').join(',') : 'NULL'})`,
      [hl.space_id, ...ids]
    );
    const ownedIds = new Set(owned.map((o) => o.id));
    const badIds = ids.filter((i) => !ownedIds.has(i));
    if (badIds.length) return bad(res, `products not in this space: ${badIds.join(', ')}`);

    await tx(async (conn) => {
      await conn.query('DELETE FROM highlight_items WHERE highlight_id = ?', [hl.id]);
      for (const [i, pid] of ids.entries()) {
        await conn.query('INSERT INTO highlight_items (highlight_id, product_id, sort_order) VALUES (?,?,?)', [hl.id, pid, i]);
      }
    });
    await audit(req, { action: 'set_items', entity: 'highlight', entityId: hl.id, after: { productIds: ids } });
    res.json({ ok: true, count: ids.length });
  } catch (e) { next(e); }
});

router.delete('/highlights/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM highlights WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'highlight_not_found', 404);
    await exec('DELETE FROM highlights WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'delete', entity: 'highlight', entityId: Number(req.params.id), before });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  discounts                                                          */
/* ------------------------------------------------------------------ */

const discountBody = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(40).nullable().optional(),
  kind: z.enum(['percent', 'fixed']).default('percent'),
  value: z.number().int().min(1),
  scope: z.enum(['product', 'category', 'space', 'global']).default('product'),
  target_id: z.number().int().positive().nullable().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  priority: z.number().int().default(0),
});

router.get('/discounts', async (_req, res, next) => {
  try {
    res.json({ discounts: await q('SELECT * FROM discounts ORDER BY is_active DESC, priority DESC, id DESC') });
  } catch (e) { next(e); }
});

router.post('/discounts', requireRole('editor'), async (req, res, next) => {
  try {
    const parsed = discountBody.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0].message);
    const b = parsed.data;
    if (b.kind === 'percent' && b.value > 100) return bad(res, 'percent discount cannot exceed 100');
    if (b.scope !== 'global' && !b.target_id) return bad(res, `scope ${b.scope} needs a target_id`);

    const r = await exec(
      `INSERT INTO discounts (code, name, kind, value, scope, target_id, starts_at, ends_at, is_active, priority)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [b.code || null, b.name, b.kind, b.value, b.scope, b.target_id ?? null,
       b.starts_at || null, b.ends_at || null, b.is_active ? 1 : 0, b.priority]
    );
    const after = await one('SELECT * FROM discounts WHERE id = ?', [r.insertId]);
    await audit(req, { action: 'create', entity: 'discount', entityId: r.insertId, after });
    res.status(201).json({ discount: after });
  } catch (e) { next(e); }
});

router.patch('/discounts/:id', requireRole('editor'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM discounts WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'discount_not_found', 404);
    const patch = discountBody.partial().safeParse(req.body);
    if (!patch.success) return bad(res, patch.error.issues[0].message);
    const data = { ...patch.data };
    if (typeof data.is_active === 'boolean') data.is_active = data.is_active ? 1 : 0;
    const fields = Object.entries(data);
    if (fields.length) {
      await exec(`UPDATE discounts SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map(([, v]) => v), req.params.id]);
    }
    const after = await one('SELECT * FROM discounts WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'update', entity: 'discount', entityId: Number(req.params.id), before, after });
    res.json({ discount: after });
  } catch (e) { next(e); }
});

router.delete('/discounts/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const before = await one('SELECT * FROM discounts WHERE id = ?', [req.params.id]);
    if (!before) return bad(res, 'discount_not_found', 404);
    await exec('DELETE FROM discounts WHERE id = ?', [req.params.id]);
    await audit(req, { action: 'delete', entity: 'discount', entityId: Number(req.params.id), before });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  search index                                                       */
/* ------------------------------------------------------------------ */

export async function reindexProduct(productId, withEmbedding = false) {
  const p = await one(
    `SELECT p.id, p.name, p.brand, p.short_description, p.description, p.colorway, p.material,
            c.name AS category_name,
            (SELECT GROUP_CONCAT(t.name SEPARATOR ' ') FROM product_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.product_id=p.id) AS tag_text
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
    [productId]
  );
  if (!p) return;
  const content = [p.name, p.brand, p.category_name, p.colorway, p.material, p.tag_text, p.short_description, p.description]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const vec = withEmbedding ? await embed(content) : null;
  await exec(
    `INSERT INTO product_search (product_id, content, embedding_json) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE content = VALUES(content),
       embedding_json = COALESCE(VALUES(embedding_json), embedding_json)`,
    [productId, content, vec ? JSON.stringify(vec) : null]
  );
}

router.post('/reindex', requireRole('admin'), async (req, res, next) => {
  try {
    const withEmbeddings = req.query.embeddings === '1';
    const rows = await q("SELECT id FROM products WHERE status <> 'archived'");
    for (const r of rows) await reindexProduct(r.id, withEmbeddings);
    await audit(req, { action: 'reindex', entity: 'catalogue', after: { count: rows.length, withEmbeddings } });
    res.json({ ok: true, reindexed: rows.length, withEmbeddings });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------ */
/*  audit trail                                                        */
/* ------------------------------------------------------------------ */

router.get('/audit', requireRole('admin'), async (req, res, next) => {
  try {
    res.json({
      entries: await q('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [Number(req.query.limit) || 100]),
    });
  } catch (e) { next(e); }
});
