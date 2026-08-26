// End-to-end smoke test against a running API server.
//   node scripts/smoke.mjs
import 'dotenv/config';

const BASE = process.env.SMOKE_BASE || 'http://localhost:8787';
let token = '';
let pass = 0;
let fail = 0;

const ok = (name, extra = '') => { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); };
const no = (name, why) => { fail++; console.log(`  FAIL  ${name} — ${why}`); };

async function call(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leave null */ }
  return { status: res.status, json, text };
}

async function section(title) { console.log(`\n${title}`); }

/* ---------------- health ---------------- */
await section('health & catalogue');
{
  const r = await call('/api/health', { auth: false });
  r.json?.db ? ok('health: db reachable', `providers=${r.json.aiProviders.join('+')}`) : no('health', r.text.slice(0, 120));
}
{
  const r = await call('/api/spaces', { auth: false });
  const live = r.json?.spaces?.filter((s) => s.status === 'live') ?? [];
  live.length ? ok('spaces list', `${r.json.spaces.length} spaces, ${live.length} live`) : no('spaces list', r.text.slice(0, 120));
}
{
  const r = await call('/api/spaces/solespace/bundle', { auth: false });
  const b = r.json;
  const wall = b?.categories?.reduce((n, c) => n + c.products.length, 0) ?? 0;
  const island = b?.highlight?.products?.length ?? 0;
  wall + island === 25
    ? ok('bundle: all 25 products placed', `${wall} on walls + ${island} on island`)
    : no('bundle product count', `got ${wall}+${island}`);

  const overCap = b?.categories?.filter((c) => c.products.length > b.space.limits.maxProductsPerCategory) ?? [];
  overCap.length === 0 ? ok('bundle: no category over capacity') : no('capacity', overCap.map((c) => c.slug).join(','));

  const sale = b?.highlight?.products?.[0];
  sale && sale.onSale && sale.finalPrice < sale.price
    ? ok('bundle: discount applied', `${sale.name} ${sale.price} -> ${sale.finalPrice}`)
    : no('discount pricing', JSON.stringify(sale).slice(0, 120));
}
{
  const r = await call('/api/spaces/does-not-exist/bundle', { auth: false });
  r.status === 404 ? ok('bundle: unknown space 404s') : no('unknown space', `status ${r.status}`);
}

/* ---------------- auth ---------------- */
await section('auth');
{
  const r = await call('/api/admin/login', { method: 'POST', auth: false, body: { email: 'admin@metamart.local', password: 'ChangeMe!2026' } });
  if (r.json?.token) { token = r.json.token; ok('login', r.json.user.role); } else no('login', r.text.slice(0, 120));
}
{
  const r = await call('/api/admin/login', { method: 'POST', auth: false, body: { email: 'admin@metamart.local', password: 'wrong' } });
  r.status === 401 ? ok('login: wrong password rejected') : no('bad login', `status ${r.status}`);
}
{
  const r = await call('/api/admin/products', { auth: false });
  r.status === 401 ? ok('admin routes require a token') : no('auth gate', `status ${r.status}`);
}

/* ---------------- capacity rules ---------------- */
await section('capacity rules');
const space = (await call('/api/admin/spaces/solespace')).json;
{
  // nike currently holds 4 of 5 - two more must fail
  const nike = space.categories.find((c) => c.slug === 'nike');
  const mk = (n) => ({
    space_id: space.space.id, category_id: nike.id, name: `Smoke Test Shoe ${n}`,
    price_cents: 9900, status: 'draft', stock: 1,
  });
  const first = await call('/api/admin/products', { method: 'POST', body: mk(1) });
  if (first.status === 201) {
    ok('product create (fills nike to 5)');
    const second = await call('/api/admin/products', { method: 'POST', body: mk(2) });
    second.status === 409
      ? ok('capacity: 6th product rejected', second.json.error)
      : no('capacity enforcement', `expected 409, got ${second.status}`);
    // clean up
    await call(`/api/admin/products/${first.json.product.id}?hard=1`, { method: 'DELETE' });
    ok('cleanup: test product removed');
  } else {
    no('product create', first.text.slice(0, 160));
  }
}
{
  // the l_hall room allows 8 categories and 6 exist - adding 3 must fail
  const made = [];
  for (let i = 0; i < 3; i++) {
    const r = await call('/api/admin/categories', { method: 'POST', body: { space_id: space.space.id, name: `Smoke Cat ${i}` } });
    if (r.status === 201) made.push(r.json.category.id);
    else if (r.status === 409 && i === 2) ok('capacity: 9th category rejected', r.json.error);
    else if (i === 2) no('category capacity', `expected 409, got ${r.status}`);
  }
  for (const cid of made) await call(`/api/admin/categories/${cid}?force=1`, { method: 'DELETE' });
  ok('cleanup: test categories removed', `${made.length} removed`);
}

/* ---------------- discounts ---------------- */
await section('discounts');
{
  const prod = (await call('/api/admin/products?space=solespace')).json.products.find((p) => !p.name.includes('Smoke'));
  const r = await call('/api/admin/discounts', {
    method: 'POST',
    body: { name: 'Smoke 25%', kind: 'percent', value: 25, scope: 'product', target_id: prod.id, is_active: true, priority: 99 },
  });
  if (r.status !== 201) { no('discount create', r.text.slice(0, 160)); }
  else {
    const bundle = (await call('/api/spaces/solespace/bundle', { auth: false })).json;
    const found = bundle.categories.flatMap((c) => c.products).concat(bundle.highlight?.products ?? []).find((p) => p.id === prod.id);
    found && found.discount && found.discount.percent_off === 25
      ? ok('discount: 25% shows in bundle', `${found.name} ${found.price} -> ${found.finalPrice}`)
      : no('discount in bundle', JSON.stringify(found?.discount));

    const over = await call('/api/admin/discounts', { method: 'POST', body: { name: 'bad', kind: 'percent', value: 150, scope: 'global' } });
    over.status === 400 ? ok('discount: >100% rejected') : no('percent guard', `status ${over.status}`);

    await call(`/api/admin/discounts/${r.json.discount.id}`, { method: 'DELETE' });
    ok('cleanup: test discount removed');
  }
}

/* ---------------- highlights ---------------- */
await section('highlight island');
{
  const s = (await call('/api/admin/spaces/solespace')).json;
  const popular = s.highlights.find((h) => h.code === 'popular');
  const cap = s.space.highlight_capacity;
  const prods = (await call('/api/admin/products?space=solespace&status=active')).json.products.slice(0, cap + 1);

  const tooMany = await call(`/api/admin/highlights/${popular.id}/items`, { method: 'PUT', body: { productIds: prods.map((p) => p.id) } });
  tooMany.status === 409 ? ok(`island: more than ${cap} rejected`) : no('island capacity', `status ${tooMany.status}`);

  const good = await call(`/api/admin/highlights/${popular.id}/items`, { method: 'PUT', body: { productIds: prods.slice(0, cap).map((p) => p.id) } });
  good.status === 200 ? ok('island: set items', `${good.json.count} products`) : no('island set', good.text.slice(0, 120));
}

/* ---------------- AI ---------------- */
await section('AI agents');
{
  const r = await call('/api/ai/capabilities', { auth: false });
  r.json?.agents?.length ? ok('capabilities', `${r.json.agents.length} agents visible to public`) : no('capabilities', r.text.slice(0, 120));
}
{
  const r = await call('/api/ai/agents/enrich', { method: 'POST', auth: false, body: { space: 'solespace', name: 'x' } });
  r.status === 403 ? ok('guardrail: enrich blocked for public') : no('role gate', `status ${r.status}`);
}
{
  const r = await call('/api/ai/search', { method: 'POST', auth: false, body: { space: 'solespace', query: 'black basketball shoes' } });
  r.json?.data?.results
    ? ok('AI search', `${r.json.data.results.length} results via ${r.json.provider || 'fallback'}`)
    : no('AI search', r.text.slice(0, 160));
}
{
  const r = await call('/api/ai/agents/enrich', { method: 'POST', body: { space: 'solespace', name: 'Gel Nimbus 26', brand: 'ASICS' } });
  const d = r.json?.data;
  d?.category_slug && d?.price_cents > 0 && d?.tags?.length && d?.sizes?.length
    ? ok('AI enrich', `${d.category_slug} $${d.price_cents / 100} tags=${d.tags.length} sizes=${d.sizes.length}`)
    : no('AI enrich', JSON.stringify(r.json).slice(0, 200));
}

/* ---------------- summary ---------------- */
console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
process.exit(fail ? 1 : 0);
