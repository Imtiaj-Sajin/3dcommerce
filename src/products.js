// Runtime catalogue for the space the player is currently standing in.
//
// This used to be a hard-coded array. It is now filled from the API by
// loadSpaceCatalogue() before the room is built, but it keeps the same
// exports so the renderer, the card painter and the UI are unchanged.
//
// Only ONE space is ever held here at a time - that is what keeps the client
// light no matter how many stores the mall grows to.

import { fetchSpaceBundle } from './api.js';

export let SPACE = null;        // { slug, name, accent, layout, limits, ... }
export let CATEGORIES = [];     // [{ id: slug, name, accent, slot }]
export let PRODUCTS = [];       // flat list, each tagged with its category
export let HIGHLIGHT = null;    // { code, title, subtitle, accent, products }

const byId = new Map();

/** Normalise one API product into the shape the 3D cards expect. */
function adopt(p, categorySlug, accent) {
  const item = {
    id: p.slug,                       // stable string id used by the scene
    dbId: p.id,
    category: categorySlug,
    categoryName: p.categoryName,
    accent: p.accent || accent,
    name: p.name,
    brand: p.brand,
    // The card painter and the modal both expect `price` to be the list
    // price and `salePrice` to be set only when it is actually marked down.
    price: p.price,
    salePrice: p.onSale ? p.finalPrice : null,
    finalPrice: p.finalPrice,
    onSale: p.onSale,
    discount: p.discount,
    tag: p.badge,
    desc: p.description || p.shortDescription || '',
    shortDesc: p.shortDescription || '',
    img: p.image,
    slot: p.slot,
    stock: p.stock,
    sizes: p.sizes || [],
  };
  byId.set(item.id, item);
  return item;
}

/**
 * Load one space's catalogue. Everything previously loaded is dropped.
 * @returns the raw bundle (callers need space.layout / limits)
 */
export async function loadSpaceCatalogue(slug) {
  const bundle = await fetchSpaceBundle(slug);

  byId.clear();
  SPACE = bundle.space;
  CATEGORIES = bundle.categories.map((c) => ({
    id: c.slug,
    name: c.name,
    accent: c.accent,
    slot: c.slot,
  }));
  PRODUCTS = bundle.categories.flatMap((c) => c.products.map((p) => adopt(p, c.slug, c.accent)));

  HIGHLIGHT = bundle.highlight
    ? {
        code: bundle.highlight.code,
        title: bundle.highlight.title,
        subtitle: bundle.highlight.subtitle,
        accent: bundle.highlight.accent,
        products: bundle.highlight.products.map((p) => adopt(p, 'highlight', bundle.highlight.accent)),
      }
    : null;

  return bundle;
}

/** Product image URL. Paths in the DB are relative to /public. */
export function imgURL(product) {
  if (!product?.img) return '';
  if (/^https?:|^data:/.test(product.img)) return product.img;
  return (import.meta.env.BASE_URL || '/') + product.img;
}

export const getProduct = (id) => byId.get(id) ?? null;

export const productsInCategory = (catId) =>
  catId === 'highlight' ? HIGHLIGHT?.products ?? [] : PRODUCTS.filter((p) => p.category === catId);

/** Sizes for the detail modal - falls back to a sensible EU run. */
export const sizesFor = (product) =>
  product?.sizes?.length ? product.sizes.map((s) => s.label ?? s) : [40, 41, 42, 43, 44, 45];
