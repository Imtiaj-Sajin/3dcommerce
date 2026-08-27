// Thin client for the METAMART API.
//
// In dev the Vite server proxies /api to the Express server; in production
// they are the same origin, so relative URLs work in both.

const BASE = import.meta.env.VITE_API_BASE ?? '';

async function get(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `${path} -> HTTP ${res.status}`);
  return json;
}

/** Directory of every space in the mall (for the plaza bays). */
export const fetchSpaces = () => get('/api/spaces').then((r) => r.spaces);

/** Everything needed to build ONE space. */
export const fetchSpaceBundle = (slug) => get(`/api/spaces/${slug}/bundle`);

export const fetchProduct = (id) => get(`/api/products/${id}`).then((r) => r.product);

/* ---------------- AI ---------------- */

export const aiSearch = (space, query) => post('/api/ai/search', { space, query });
export const aiSearchImage = (space, image) => post('/api/ai/search-image', { space, image });
export const aiTryOn = (productId, size, face) => post('/api/ai/try-on', { productId, size, face });
export const aiAsk = (space, message) => post('/api/ai/ask', { space, message });

/** One turn with the concierge. */
export const aiChat = (body) => post('/api/ai/chat', body);

/** Plain keyword search - no model, no cost. */
export const plainSearch = (space, q) =>
  get(`/api/search?space=${encodeURIComponent(space)}&q=${encodeURIComponent(q)}`).then((r) => r.results);
