// Public catalogue API.
//
// The important endpoint is GET /api/spaces/:slug/bundle - everything the 3D
// client needs to build ONE space, and nothing about any other space. That is
// what keeps the client light: walk into a store, fetch that store.

import express from 'express';
import { q, one } from '../lib/db.js';
import { activeDiscounts, applyPricing } from '../lib/pricing.js';
import { shapeProduct as shape } from '../lib/shape.js';

export const router = express.Router();

/* ---------------- mall directory ---------------- */

// Every space, with counts. Used by the plaza to label the tenant bays.
router.get('/spaces', async (_req, res, next) => {
  try {
    const rows = await q(
      `SELECT s.id, s.slug, s.name, s.tagline, s.accent_color, s.bay_index, s.status, s.sort_order,
              a.code AS architecture, a.max_categories, a.max_products_per_category,
              a.has_highlight_island, a.highlight_capacity,
              (SELECT COUNT(*) FROM products p WHERE p.space_id = s.id AND p.status='active') AS product_count,
              (SELECT COUNT(*) FROM categories c WHERE c.space_id = s.id AND c.is_active=1)  AS category_count
         FROM spaces s JOIN architectures a ON a.id = s.architecture_id
        WHERE s.status <> 'hidden'
        ORDER BY s.sort_order, s.id`
    );
    res.json({ spaces: rows });
  } catch (e) { next(e); }
});

/* ---------------- one space, everything ---------------- */

router.get('/spaces/:slug/bundle', async (req, res, next) => {
  try {
    const space = await one(
      `SELECT s.id, s.slug, s.name, s.tagline, s.description, s.accent_color, s.bay_index, s.status,
              a.code AS architecture, a.layout_json, a.max_categories, a.max_products_per_category,
              a.has_highlight_island, a.highlight_capacity
         FROM spaces s JOIN architectures a ON a.id = s.architecture_id
        WHERE s.slug = ? AND s.status <> 'hidden'`,
      [req.params.slug]
    );
    if (!space) return res.status(404).json({ error: 'space_not_found' });

    const [categories, products, highlight, discounts] = await Promise.all([
      q(
        `SELECT id, slug, name, accent_color, slot_index
           FROM categories WHERE space_id = ? AND is_active = 1
          ORDER BY slot_index, sort_order`,
        [space.id]
      ),
      q(
        `SELECT p.id, p.slug, p.name, p.brand, p.short_description, p.description, p.price_cents,
                p.compare_at_price_cents, p.currency, p.slot_index, p.badge, p.stock,
                p.category_id, p.space_id, c.slug AS category_slug, c.name AS category_name,
                c.accent_color, i.file_path AS image
           FROM products p
           JOIN categories c ON c.id = p.category_id
           LEFT JOIN product_images i ON i.product_id = p.id AND i.is_primary = 1
          WHERE p.space_id = ? AND p.status = 'active'
          ORDER BY c.slot_index, p.slot_index`,
        [space.id]
      ),
      one(
        `SELECT id, code, title, subtitle, accent_color
           FROM highlights WHERE space_id = ? AND is_active = 1 LIMIT 1`,
        [space.id]
      ),
      activeDiscounts(),
    ]);

    // Sizes travel with the bundle so the product card can open instantly -
    // and so a shirt offers S/M/L rather than falling back to shoe sizes.
    const variants = await q(
      `SELECT v.product_id, v.size_label, v.size_system, v.stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE p.space_id = ? AND v.is_active = 1
        ORDER BY v.product_id, v.sort_order`,
      [space.id]
    );
    const sizesByProduct = new Map();
    for (const v of variants) {
      if (!sizesByProduct.has(v.product_id)) sizesByProduct.set(v.product_id, []);
      sizesByProduct.get(v.product_id).push({ label: v.size_label, system: v.size_system, stock: v.stock });
    }

    const priced = applyPricing(products, discounts).map((p) => ({
      ...p,
      sizes: sizesByProduct.get(p.id) ?? [],
    }));

    let highlightPayload = null;
    let wallProducts = priced;
    if (highlight) {
      const items = await q(
        `SELECT product_id FROM highlight_items WHERE highlight_id = ? ORDER BY sort_order`,
        [highlight.id]
      );
      const ids = new Set(items.map((i) => i.product_id));
      highlightPayload = {
        code: highlight.code,
        title: highlight.title,
        subtitle: highlight.subtitle,
        accent: highlight.accent_color,
        products: items
          .map((i) => priced.find((p) => p.id === i.product_id))
          .filter(Boolean)
          .map(shape),
      };
      // Highlight items are displayed on the island, not on the wall shelves.
      wallProducts = priced.filter((p) => !ids.has(p.id));
    }

    res.json({
      space: {
        id: space.id,
        slug: space.slug,
        name: space.name,
        tagline: space.tagline,
        description: space.description,
        accent: space.accent_color,
        bayIndex: space.bay_index,
        status: space.status,
        architecture: space.architecture,
        layout: space.layout_json,
        limits: {
          maxCategories: space.max_categories,
          maxProductsPerCategory: space.max_products_per_category,
          highlightCapacity: space.highlight_capacity,
          hasHighlightIsland: !!space.has_highlight_island,
        },
      },
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        accent: c.accent_color,
        slot: c.slot_index,
        products: wallProducts.filter((p) => p.category_id === c.id).map(shape),
      })),
      highlight: highlightPayload,
    });
  } catch (e) { next(e); }
});

/* ---------------- single product ---------------- */

router.get('/products/:id', async (req, res, next) => {
  try {
    const p = await one(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.accent_color,
              s.slug AS space_slug, s.name AS space_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN spaces s     ON s.id = p.space_id
        WHERE (p.id = ? OR p.slug = ?) AND p.status = 'active'
        LIMIT 1`,
      [Number(req.params.id) || 0, req.params.id]
    );
    if (!p) return res.status(404).json({ error: 'product_not_found' });

    const [images, variants, tags] = await Promise.all([
      q(`SELECT file_path, alt_text, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order`, [p.id]),
      q(`SELECT size_label, size_system, stock FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY sort_order`, [p.id]),
      q(`SELECT t.slug, t.name, t.kind FROM product_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.product_id = ?`, [p.id]),
    ]);

    const [priced] = applyPricing([{ ...p, image: images.find((i) => i.is_primary)?.file_path ?? images[0]?.file_path }], await activeDiscounts());

    res.json({
      product: {
        ...shape(priced),
        spaceSlug: p.space_slug,
        colorway: p.colorway,
        material: p.material,
        images: images.map((i) => ({ path: i.file_path, alt: i.alt_text, primary: !!i.is_primary })),
        sizes: variants.map((v) => ({ label: v.size_label, system: v.size_system, stock: v.stock })),
        tags: tags.map((t) => ({ slug: t.slug, name: t.name, kind: t.kind })),
      },
    });
  } catch (e) { next(e); }
});

/* ---------------- plain (non-AI) search ---------------- */

router.get('/search', async (req, res, next) => {
  try {
    const term = String(req.query.q || '').trim();
    const spaceSlug = String(req.query.space || 'all');
    if (!term) return res.json({ results: [] });

    let space = null;
    if (spaceSlug !== 'all') {
      space = await one('SELECT id FROM spaces WHERE slug = ?', [spaceSlug]);
      if (!space) return res.status(404).json({ error: 'space_not_found' });
    }

    const like = `%${term}%`;
    const rows = await q(
      `SELECT p.id, p.slug, p.name, p.brand, p.short_description, p.price_cents, p.currency,
              p.badge, p.slot_index, p.stock, p.category_id, p.space_id,
              c.slug AS category_slug, c.name AS category_name, c.accent_color,
              i.file_path AS image,
              s.slug AS space_slug, s.name AS space_name, s.accent_color AS space_accent
         FROM products p
         JOIN categories c ON c.id = p.category_id
         JOIN spaces s     ON s.id = p.space_id
         LEFT JOIN product_images i ON i.product_id = p.id AND i.is_primary = 1
        WHERE p.status = 'active' AND s.status = 'live'
          ${space ? 'AND p.space_id = ?' : ''}
          AND (p.name LIKE ? OR p.brand LIKE ? OR p.short_description LIKE ? OR c.name LIKE ?)
        LIMIT 24`,
      space ? [space.id, like, like, like, like] : [like, like, like, like]
    );
    res.json({ results: applyPricing(rows, await activeDiscounts()).map(shape) });
  } catch (e) { next(e); }
});
