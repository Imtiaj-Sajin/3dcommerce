// One canonical JSON shape for a product, used by every endpoint that
// returns products so the client never has to care which route it came from.

export function shapeProduct(p) {
  if (!p) return null;
  const price = Number(p.price_cents ?? 0);
  const final = Number(p.final_price_cents ?? p.price_cents ?? 0);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand ?? null,
    category: p.category_slug ?? null,
    categoryName: p.category_name ?? null,
    accent: p.accent_color ?? null,
    badge: p.badge ?? null,
    shortDescription: p.short_description ?? null,
    description: p.description ?? null,
    image: p.image ?? null,
    price: price / 100,
    finalPrice: final / 100,
    onSale: !!p.on_sale,
    discount: p.discount ?? null,
    currency: p.currency ?? 'USD',
    slot: p.slot_index ?? 0,
    stock: p.stock ?? 0,
    sizes: p.sizes ?? [],
  };
}

export const shapeAll = (rows) => (rows || []).map(shapeProduct);
