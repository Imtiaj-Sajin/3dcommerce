// METAMART admin console.
//
// Plain ES modules, no build step. The signature interaction is the product
// editor: ask the AI to complete the listing, then accept each suggestion
// field-by-field with Tab / Arrow-Right, or all of them at once.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => '$' + (Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '');

const state = {
  token: localStorage.getItem('mm_token') || '',
  user: null,
  spaces: [],
  space: null,       // full space record with limits
  view: 'dashboard',
};

/* ------------------------------------------------------------------ */
/*  api                                                                */
/* ------------------------------------------------------------------ */

async function api(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: {} };
  if (state.token) opts.headers.Authorization = `Bearer ${state.token}`;
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401) signOut();
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return raw ? text : json;
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = isError ? 'err' : '';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 3600);
}

/* ------------------------------------------------------------------ */
/*  auth                                                               */
/* ------------------------------------------------------------------ */

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/admin/login', {
      method: 'POST',
      body: { email: $('#li-email').value, password: $('#li-pw').value },
    });
    state.token = r.token;
    state.user = r.user;
    localStorage.setItem('mm_token', r.token);
    await boot();
  } catch (err) {
    toast(err.message === 'invalid_credentials' ? 'Wrong email or password' : err.message, true);
  }
});

function signOut() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('mm_token');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
$('#logout').addEventListener('click', signOut);

/* ------------------------------------------------------------------ */
/*  boot                                                               */
/* ------------------------------------------------------------------ */

async function boot() {
  const me = await api('/api/admin/me');
  state.user = me.user;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#who').textContent = `${me.user.name} · ${me.user.role}`;

  const ov = await api('/api/admin/overview');
  state.spaces = ov.spaces;

  const sel = $('#space-select');
  sel.innerHTML = ov.spaces
    .map((s) => `<option value="${s.slug}">${esc(s.name)}${s.status === 'live' ? '' : ' (soon)'}</option>`)
    .join('');
  sel.value = localStorage.getItem('mm_space') || ov.spaces[0]?.slug;
  sel.onchange = async () => {
    localStorage.setItem('mm_space', sel.value);
    await loadSpace(sel.value);
    render();
  };

  await loadSpace(sel.value);
  render();
}

async function loadSpace(slug) {
  const r = await api(`/api/admin/spaces/${slug}`);
  state.space = r.space;
  state.categories = r.categories;
  state.highlights = r.highlights;
  state.discounts = r.discounts;
}

$$('.nav').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.nav').forEach((x) => x.classList.toggle('active', x === b));
    state.view = b.dataset.view;
    render();
  })
);

const TITLES = {
  dashboard: 'Dashboard', products: 'Products', categories: 'Categories',
  highlight: 'Highlight island', discounts: 'Discounts', spaces: 'Spaces',
  ai: 'AI activity', settings: 'Settings',
};

async function render() {
  $('#view-title').textContent = TITLES[state.view] || '';
  const el = $('#view');
  el.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await VIEWS[state.view](el);
  } catch (e) {
    el.innerHTML = `<div class="card"><p style="color:var(--danger)">${esc(e.message)}</p></div>`;
  }
}

/* ------------------------------------------------------------------ */
/*  views                                                              */
/* ------------------------------------------------------------------ */

const VIEWS = {};

VIEWS.dashboard = async (el) => {
  const ov = await api('/api/admin/overview');
  state.spaces = ov.spaces;
  el.innerHTML = `
    <div class="grid c4" style="margin-bottom:18px">
      <div class="stat"><div class="n">${ov.counts.products}</div><div class="l">Active products</div></div>
      <div class="stat"><div class="n">${ov.counts.live_spaces}</div><div class="l">Live spaces</div></div>
      <div class="stat"><div class="n">${ov.counts.discounts}</div><div class="l">Active discounts</div></div>
      <div class="stat"><div class="n">$${Number(ov.aiToday.cost || 0).toFixed(3)}</div><div class="l">AI spend today (${ov.aiToday.n} calls)</div></div>
    </div>
    <div class="card">
      <h2>Spaces</h2>
      <table>
        <thead><tr><th>Space</th><th>Status</th><th>Room</th><th>Categories</th><th>Products</th></tr></thead>
        <tbody>${ov.spaces.map((s) => {
          const pct = Math.round((s.categories / s.max_categories) * 100);
          return `<tr>
            <td><b>${esc(s.name)}</b> <span class="muted small">/${esc(s.slug)}</span></td>
            <td><span class="pill ${s.status === 'live' ? 'live' : 'soon'}">${s.status.replace('_', ' ')}</span></td>
            <td class="muted">${esc(s.architecture)}</td>
            <td>${s.categories} / ${s.max_categories}
              <div class="bar"><i class="${pct >= 100 ? 'full' : ''}" style="width:${Math.min(100, pct)}%"></i></div></td>
            <td>${s.products}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
};

VIEWS.products = async (el) => {
  const { products } = await api(`/api/admin/products?space=${state.space.slug}`);
  el.innerHTML = `
    <div class="head" style="margin-bottom:14px">
      <p class="muted small">${products.length} products in ${esc(state.space.name)} ·
        max ${state.space.max_products_per_category} per category</p>
      <button id="new-product">+ New product</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table>
        <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Slot</th><th>Status</th><th></th></tr></thead>
        <tbody>${products.map((p) => `<tr>
          <td>${p.image ? `<img src="/${esc(p.image)}" alt="">` : ''}</td>
          <td><b>${esc(p.name)}</b><div class="muted small">${esc(p.brand || '')} · ${esc(p.sku)}</div></td>
          <td>${esc(p.category_name)}</td>
          <td>${money(p.price_cents)}</td>
          <td class="muted">${p.slot_index}</td>
          <td><span class="pill ${p.status === 'active' ? 'live' : 'soon'}">${p.status}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="ghost sm" data-edit="${p.id}">Edit</button>
            <button class="danger sm" data-del="${p.id}">Archive</button>
          </td></tr>`).join('')}</tbody>
      </table>
    </div>`;

  $('#new-product').onclick = () => productModal(null);
  $$('[data-edit]', el).forEach((b) => (b.onclick = () => productModal(Number(b.dataset.edit))));
  $$('[data-del]', el).forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm('Archive this product? It will disappear from the shop floor.')) return;
        await api(`/api/admin/products/${b.dataset.del}`, { method: 'DELETE' });
        toast('Product archived');
        render();
      })
  );
};

VIEWS.categories = async (el) => {
  const s = state.space;
  const used = state.categories.length;
  el.innerHTML = `
    <div class="head" style="margin-bottom:14px">
      <p class="muted small">${used} of ${s.max_categories} wall zones used in the
        <b>${esc(s.architecture)}</b> room. Each holds up to ${s.max_products_per_category} products.</p>
      <button id="new-cat" ${used >= s.max_categories ? 'disabled' : ''}>+ New category</button>
    </div>
    <div class="grid c3">
      ${state.categories.map((c) => `
        <div class="card" style="margin:0">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
            <span style="width:13px;height:13px;border-radius:50%;background:${esc(c.accent_color)}"></span>
            <b>${esc(c.name)}</b>
          </div>
          <div class="muted small">slot ${c.slot_index} · /${esc(c.slug)}</div>
          <div class="small" style="margin-top:9px">${c.product_count} / ${s.max_products_per_category} products
            <div class="bar"><i class="${c.product_count >= s.max_products_per_category ? 'full' : ''}"
              style="width:${Math.min(100, (c.product_count / s.max_products_per_category) * 100)}%"></i></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:7px">
            <button class="ghost sm" data-cedit="${c.id}">Edit</button>
            <button class="danger sm" data-cdel="${c.id}">Delete</button>
          </div>
        </div>`).join('')}
    </div>`;

  $('#new-cat').onclick = () => categoryModal(null);
  $$('[data-cedit]', el).forEach(
    (b) => (b.onclick = () => categoryModal(state.categories.find((c) => c.id === Number(b.dataset.cedit))))
  );
  $$('[data-cdel]', el).forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm('Delete this category?')) return;
        try {
          await api(`/api/admin/categories/${b.dataset.cdel}`, { method: 'DELETE' });
          toast('Category deleted');
          await loadSpace(state.space.slug);
          render();
        } catch (e) { toast(e.message, true); }
      })
  );
};

VIEWS.highlight = async (el) => {
  const s = state.space;
  const { products } = await api(`/api/admin/products?space=${s.slug}&status=active`);
  const active = state.highlights.find((h) => h.is_active);
  const chosen = active ? (await api(`/api/admin/highlights/${active.id}/items`)).items.map((i) => i.product_id) : [];

  el.innerHTML = `
    <div class="card">
      <h2>Which display is live?</h2>
      <p class="muted small" style="margin-bottom:12px">
        The centre island shows one campaign at a time. Rename it to anything you like —
        Sale, Popular, New Arrivals, Editor's Picks.</p>
      <div class="grid c3">
        ${state.highlights.map((h) => `
          <div class="card ${h.is_active ? '' : ''}" style="margin:0;border-color:${h.is_active ? 'var(--accent)' : 'var(--line)'}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>${esc(h.title)}</b>
              ${h.is_active ? '<span class="pill acc">LIVE</span>' : ''}
            </div>
            <div class="muted small" style="margin:6px 0 10px">${esc(h.subtitle || '')} · ${h.item_count} items</div>
            <div style="display:flex;gap:7px">
              ${h.is_active ? '' : `<button class="sm" data-act="${h.id}">Make live</button>`}
              <button class="ghost sm" data-hedit="${h.id}">Rename</button>
            </div>
          </div>`).join('')}
        <div class="card" style="margin:0;border-style:dashed;display:grid;place-items:center">
          <button class="ghost sm" id="new-hl">+ New campaign</button>
        </div>
      </div>
    </div>

    ${active ? `
    <div class="card">
      <div class="head" style="margin-bottom:6px">
        <h2 style="margin:0">Products on the “${esc(active.title)}” island</h2>
        <div style="display:flex;gap:8px">
          <button class="ghost sm" id="ai-pick">✨ Suggest with AI</button>
          <button class="sm" id="save-items">Save island</button>
        </div>
      </div>
      <p class="muted small" style="margin-bottom:12px">Pick up to ${s.highlight_capacity}. Selected products move off the wall shelves onto the island.</p>
      <div class="grid c4" id="picker">
        ${products.map((p) => `
          <div class="picker ${chosen.includes(p.id) ? 'on' : ''}" data-pid="${p.id}">
            ${p.image ? `<img class="thumb" src="/${esc(p.image)}" alt="">` : '<div class="thumb"></div>'}
            <div class="nm">${esc(p.name)}</div>
            <div class="pr">${money(p.price_cents)}</div>
          </div>`).join('')}
      </div>
    </div>` : '<div class="card"><p class="muted">No campaign is live. Make one live to fill the island.</p></div>'}`;

  $('#new-hl').onclick = () => highlightModal(null);
  $$('[data-hedit]', el).forEach(
    (b) => (b.onclick = () => highlightModal(state.highlights.find((h) => h.id === Number(b.dataset.hedit))))
  );
  $$('[data-act]', el).forEach(
    (b) =>
      (b.onclick = async () => {
        await api(`/api/admin/highlights/${b.dataset.act}/activate`, { method: 'POST' });
        toast('Island updated');
        await loadSpace(state.space.slug);
        render();
      })
  );

  if (!active) return;

  const cap = s.highlight_capacity;
  $$('#picker .picker', el).forEach(
    (card) =>
      (card.onclick = () => {
        const on = card.classList.contains('on');
        if (!on && $$('#picker .picker.on', el).length >= cap) {
          toast(`The island holds ${cap} products`, true);
          return;
        }
        card.classList.toggle('on');
      })
  );

  $('#save-items').onclick = async () => {
    const ids = $$('#picker .picker.on', el).map((c) => Number(c.dataset.pid));
    try {
      await api(`/api/admin/highlights/${active.id}/items`, { method: 'PUT', body: { productIds: ids } });
      toast(`Island saved — ${ids.length} products`);
      await loadSpace(state.space.slug);
    } catch (e) { toast(e.message, true); }
  };

  $('#ai-pick').onclick = async () => {
    const brief = prompt('Describe the campaign for the AI merchandiser:', active.title);
    if (brief === null) return;
    const btn = $('#ai-pick');
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    try {
      const r = await api('/api/ai/agents/merchandiser', {
        method: 'POST',
        body: { space: state.space.slug, brief, slots: cap },
      });
      const ids = new Set(r.data.picks.map((p) => p.product_id));
      $$('#picker .picker', el).forEach((c) => c.classList.toggle('on', ids.has(Number(c.dataset.pid))));
      toast(`AI picked ${ids.size}: ${r.data.picks.map((p) => p.product.name).join(', ')}`);
    } catch (e) { toast(e.message, true); }
    btn.disabled = false;
    btn.textContent = '✨ Suggest with AI';
  };
};

VIEWS.discounts = async (el) => {
  const { discounts } = await api('/api/admin/discounts');
  const { products } = await api(`/api/admin/products?space=${state.space.slug}`);
  const nameOf = (d) => {
    if (d.scope === 'global') return 'Everything';
    if (d.scope === 'product') return products.find((p) => p.id === d.target_id)?.name || `product #${d.target_id}`;
    if (d.scope === 'category') return state.categories.find((c) => c.id === d.target_id)?.name || `category #${d.target_id}`;
    return state.spaces.find((s) => s.id === d.target_id)?.name || `space #${d.target_id}`;
  };
  el.innerHTML = `
    <div class="head" style="margin-bottom:14px">
      <p class="muted small">${discounts.length} discounts. The best one wins per product — they never stack.</p>
      <button id="new-disc">+ New discount</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table>
        <thead><tr><th>Name</th><th>Applies to</th><th>Amount</th><th>Window</th><th>Status</th><th></th></tr></thead>
        <tbody>${discounts.map((d) => `<tr>
          <td><b>${esc(d.name)}</b>${d.code ? `<div class="muted small">${esc(d.code)}</div>` : ''}</td>
          <td>${esc(nameOf(d))} <span class="muted small">(${d.scope})</span></td>
          <td>${d.kind === 'percent' ? d.value + '%' : money(d.value)} off</td>
          <td class="muted small">${d.starts_at ? new Date(d.starts_at).toLocaleDateString() : '—'} → ${d.ends_at ? new Date(d.ends_at).toLocaleDateString() : '—'}</td>
          <td><span class="pill ${d.is_active ? 'live' : 'soon'}">${d.is_active ? 'active' : 'off'}</span></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="ghost sm" data-dtoggle="${d.id}" data-on="${d.is_active}">${d.is_active ? 'Disable' : 'Enable'}</button>
            <button class="danger sm" data-ddel="${d.id}">Delete</button>
          </td></tr>`).join('')}</tbody>
      </table>
    </div>`;

  $('#new-disc').onclick = () => discountModal(products);
  $$('[data-dtoggle]', el).forEach(
    (b) =>
      (b.onclick = async () => {
        await api(`/api/admin/discounts/${b.dataset.dtoggle}`, {
          method: 'PATCH',
          body: { is_active: b.dataset.on !== '1' },
        });
        render();
      })
  );
  $$('[data-ddel]', el).forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm('Delete this discount?')) return;
        await api(`/api/admin/discounts/${b.dataset.ddel}`, { method: 'DELETE' });
        toast('Discount deleted');
        render();
      })
  );
};

VIEWS.spaces = async (el) => {
  const { architectures } = await api('/api/admin/architectures');
  el.innerHTML = `
    <div class="card">
      <h2>${esc(state.space.name)}</h2>
      <div class="row c2">
        <div class="field"><label>Name</label><input id="sp-name" value="${esc(state.space.name)}"></div>
        <div class="field"><label>Accent colour</label><input id="sp-accent" type="color" value="${esc(state.space.accent_color)}" style="height:40px;padding:4px"></div>
      </div>
      <div class="field"><label>Tagline</label><input id="sp-tag" value="${esc(state.space.tagline || '')}"></div>
      <div class="row c2">
        <div class="field"><label>Status</label>
          <select id="sp-status">
            ${['live', 'coming_soon', 'hidden'].map((s) => `<option ${state.space.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
        <div class="field"><label>Room blueprint</label>
          <select id="sp-arch">
            ${architectures.map((a) => `<option value="${a.id}" ${a.code === state.space.architecture ? 'selected' : ''}>${esc(a.name)} — ${a.max_categories} zones × ${a.max_products_per_category}</option>`).join('')}
          </select></div>
      </div>
      <button id="sp-save">Save space</button>
    </div>

    <div class="card">
      <h2>Room blueprints</h2>
      <table>
        <thead><tr><th>Blueprint</th><th>Zones</th><th>Products / zone</th><th>Island</th></tr></thead>
        <tbody>${architectures.map((a) => `<tr>
          <td><b>${esc(a.name)}</b><div class="muted small">${esc(a.description || '')}</div></td>
          <td>${a.max_categories}</td><td>${a.max_products_per_category}</td>
          <td>${a.has_highlight_island ? `${a.highlight_capacity} slots` : '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;

  $('#sp-save').onclick = async () => {
    try {
      await api(`/api/admin/spaces/${state.space.id}`, {
        method: 'PATCH',
        body: {
          name: $('#sp-name').value,
          tagline: $('#sp-tag').value || null,
          accent_color: $('#sp-accent').value,
          status: $('#sp-status').value,
          architecture_id: Number($('#sp-arch').value),
        },
      });
      toast('Space saved');
      await loadSpace(state.space.slug);
      render();
    } catch (e) { toast(e.message, true); }
  };
};

VIEWS.ai = async (el) => {
  const [{ jobs, spentTodayUsd }, caps] = await Promise.all([
    api('/api/ai/jobs?limit=60'),
    api('/api/ai/capabilities'),
  ]);
  el.innerHTML = `
    <div class="card">
      <h2>Agents</h2>
      <p class="muted small" style="margin-bottom:12px">Providers in fallback order: <b>${caps.providers.join(' → ') || 'none configured'}</b> · spent today $${spentTodayUsd.toFixed(4)}</p>
      <div class="grid c3">
        ${caps.agents.map((a) => `<div class="card" style="margin:0">
          <b>${esc(a.name)}</b> <span class="pill acc">${esc(a.role)}</span>
          <p class="muted small" style="margin-top:7px">${esc(a.description)}</p>
        </div>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="log">
        <thead><tr><th>When</th><th>Agent</th><th>Status</th><th>Provider</th><th>Tokens</th><th>Cost</th><th>ms</th><th>Flags / error</th></tr></thead>
        <tbody>${jobs.map((j) => `<tr>
          <td class="muted">${new Date(j.created_at).toLocaleTimeString()}</td>
          <td>${esc(j.agent)}${j.intent && j.intent !== j.agent ? ` <span class="muted">→${esc(j.intent)}</span>` : ''}</td>
          <td class="${j.status}">${j.status}</td>
          <td class="muted">${esc(j.provider || '—')}</td>
          <td class="muted">${j.tokens_in}/${j.tokens_out}</td>
          <td>$${Number(j.cost_usd).toFixed(5)}</td>
          <td class="muted">${j.latency_ms}</td>
          <td class="muted">${esc(j.error || (j.guardrail_flags ? JSON.parse(j.guardrail_flags).join(', ') : ''))}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
};

VIEWS.settings = async (el) => {
  el.innerHTML = `
    <div class="card" style="max-width:520px">
      <h2>Change password</h2>
      <div class="field"><label>Current password</label><input id="pw-cur" type="password"></div>
      <div class="field"><label>New password</label><input id="pw-new" type="password" placeholder="at least 8 characters"></div>
      <button id="pw-save">Update password</button>
    </div>
    <div class="card" style="max-width:520px">
      <h2>Search index</h2>
      <p class="muted small" style="margin-bottom:12px">Rebuild the text index after bulk edits. Embeddings cost a little and improve semantic search.</p>
      <div style="display:flex;gap:8px">
        <button class="ghost sm" id="reindex">Rebuild text index</button>
        <button class="ghost sm" id="reindex-emb">Rebuild + embeddings</button>
      </div>
    </div>`;

  $('#pw-save').onclick = async () => {
    try {
      await api('/api/admin/change-password', {
        method: 'POST',
        body: { currentPassword: $('#pw-cur').value, newPassword: $('#pw-new').value },
      });
      toast('Password updated');
      $('#pw-cur').value = $('#pw-new').value = '';
    } catch (e) { toast(e.message, true); }
  };
  const reindex = async (emb) => {
    toast('Reindexing…');
    const r = await api(`/api/admin/reindex${emb ? '?embeddings=1' : ''}`, { method: 'POST' });
    toast(`Reindexed ${r.reindexed} products`);
  };
  $('#reindex').onclick = () => reindex(false);
  $('#reindex-emb').onclick = () => reindex(true);
};

/* ------------------------------------------------------------------ */
/*  modals                                                             */
/* ------------------------------------------------------------------ */

function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const bg = $('.modal-bg', root);
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  closeModal._off = () => document.removeEventListener('keydown', onKey);
  return root;
}
function closeModal() {
  closeModal._off?.();
  $('#modal-root').innerHTML = '';
}

async function categoryModal(cat) {
  openModal(`
    <div class="head"><h1>${cat ? 'Edit' : 'New'} category</h1><button class="ghost sm" id="x">✕</button></div>
    <div class="row c2">
      <div class="field"><label>Name</label><input id="c-name" value="${esc(cat?.name || '')}"></div>
      <div class="field"><label>Accent colour</label><input id="c-accent" type="color" value="${esc(cat?.accent_color || '#00e5ff')}" style="height:40px;padding:4px"></div>
    </div>
    <div class="field"><label>Wall slot</label>
      <input id="c-slot" type="number" min="0" max="${state.space.max_categories - 1}" value="${cat?.slot_index ?? ''}" placeholder="auto">
      <p class="muted small" style="margin-top:5px">Which wall zone in the room (0–${state.space.max_categories - 1}). Leave blank to auto-place.</p>
    </div>
    <button id="c-save">${cat ? 'Save' : 'Create'}</button>`);

  $('#x').onclick = closeModal;
  $('#c-save').onclick = async () => {
    const body = { name: $('#c-name').value, accent_color: $('#c-accent').value };
    const slot = $('#c-slot').value;
    if (slot !== '') body.slot_index = Number(slot);
    try {
      if (cat) await api(`/api/admin/categories/${cat.id}`, { method: 'PATCH', body });
      else await api('/api/admin/categories', { method: 'POST', body: { ...body, space_id: state.space.id } });
      toast('Category saved');
      closeModal();
      await loadSpace(state.space.slug);
      render();
    } catch (e) { toast(e.message, true); }
  };
}

async function highlightModal(hl) {
  openModal(`
    <div class="head"><h1>${hl ? 'Rename' : 'New'} campaign</h1><button class="ghost sm" id="x">✕</button></div>
    <div class="field"><label>Sign title</label><input id="h-title" value="${esc(hl?.title || '')}" placeholder="SALE % / POPULAR / NEW ARRIVALS"></div>
    <div class="field"><label>Subtitle</label><input id="h-sub" value="${esc(hl?.subtitle || '')}"></div>
    <div class="field"><label>Accent colour</label><input id="h-accent" type="color" value="${esc(hl?.accent_color || '#ff2d55')}" style="height:40px;padding:4px"></div>
    <button id="h-save">${hl ? 'Save' : 'Create'}</button>`);

  $('#x').onclick = closeModal;
  $('#h-save').onclick = async () => {
    const body = { title: $('#h-title').value, subtitle: $('#h-sub').value || null, accent_color: $('#h-accent').value };
    try {
      if (hl) await api(`/api/admin/highlights/${hl.id}`, { method: 'PATCH', body });
      else await api('/api/admin/highlights', { method: 'POST', body: { ...body, space_id: state.space.id } });
      toast('Campaign saved');
      closeModal();
      await loadSpace(state.space.slug);
      render();
    } catch (e) { toast(e.message, true); }
  };
}

async function discountModal(products) {
  openModal(`
    <div class="head"><h1>New discount</h1><button class="ghost sm" id="x">✕</button></div>
    <div class="field"><label>Name</label><input id="d-name" placeholder="Weekend flash sale"></div>
    <div class="row c3">
      <div class="field"><label>Type</label><select id="d-kind"><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></div>
      <div class="field"><label>Value</label><input id="d-value" type="number" min="1" value="20"><p class="muted small" id="d-hint" style="margin-top:5px">20% off</p></div>
      <div class="field"><label>Priority</label><input id="d-prio" type="number" value="0"></div>
    </div>
    <div class="row c2">
      <div class="field"><label>Applies to</label>
        <select id="d-scope">
          <option value="product">One product</option>
          <option value="category">A category</option>
          <option value="space">A whole space</option>
          <option value="global">Everything</option>
        </select></div>
      <div class="field"><label>Target</label><select id="d-target"></select></div>
    </div>
    <div class="row c2">
      <div class="field"><label>Starts</label><input id="d-start" type="datetime-local"></div>
      <div class="field"><label>Ends</label><input id="d-end" type="datetime-local"></div>
    </div>
    <button id="d-save">Create discount</button>`);

  const fillTargets = () => {
    const scope = $('#d-scope').value;
    const sel = $('#d-target');
    sel.disabled = scope === 'global';
    const opts =
      scope === 'product' ? products.map((p) => [p.id, `${p.name} (${money(p.price_cents)})`])
      : scope === 'category' ? state.categories.map((c) => [c.id, c.name])
      : scope === 'space' ? state.spaces.map((s) => [s.id, s.name])
      : [['', 'Everything']];
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  };
  const hint = () => {
    const v = Number($('#d-value').value) || 0;
    $('#d-hint').textContent = $('#d-kind').value === 'percent' ? `${v}% off` : `${money(v)} off (value is in cents)`;
  };
  $('#d-scope').onchange = fillTargets;
  $('#d-kind').onchange = hint;
  $('#d-value').oninput = hint;
  fillTargets();
  hint();

  $('#x').onclick = closeModal;
  $('#d-save').onclick = async () => {
    const scope = $('#d-scope').value;
    try {
      await api('/api/admin/discounts', {
        method: 'POST',
        body: {
          name: $('#d-name').value || 'Discount',
          kind: $('#d-kind').value,
          value: Number($('#d-value').value),
          scope,
          target_id: scope === 'global' ? null : Number($('#d-target').value),
          starts_at: $('#d-start').value ? $('#d-start').value.replace('T', ' ') + ':00' : null,
          ends_at: $('#d-end').value ? $('#d-end').value.replace('T', ' ') + ':00' : null,
          priority: Number($('#d-prio').value) || 0,
          is_active: true,
        },
      });
      toast('Discount created');
      closeModal();
      render();
    } catch (e) { toast(e.message, true); }
  };
}

/* ------------------------------------------------------------------ */
/*  product editor - with AI ghost suggestions                         */
/* ------------------------------------------------------------------ */

async function productModal(id) {
  let prod = null;
  let variants = [];
  let tags = [];
  if (id) {
    const r = await api(`/api/admin/products/${id}`);
    prod = r.product;
    variants = r.variants;
    tags = r.tags;
    prod.image = r.images.find((i) => i.is_primary)?.file_path || r.images[0]?.file_path || null;
  }

  const catOpts = state.categories
    .map((c) => `<option value="${c.id}" ${prod?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`)
    .join('');

  openModal(`
    <div class="head"><h1>${id ? 'Edit' : 'New'} product</h1><button class="ghost sm" id="x">✕</button></div>

    <div class="aibar">
      <button class="sm" id="ai-fill">✨ Complete with AI</button>
      <span class="hint">Type a name (and drop a photo) first. Then press
        <kbd>Tab</kbd> or <kbd>→</kbd> in a field to accept its suggestion,
        or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to accept everything.</span>
      <span id="ai-status" class="hint"></span>
    </div>

    <div class="row c2">
      <div>
        <div class="field" data-f="name"><label>Name</label><input id="f-name" value="${esc(prod?.name || '')}" autocomplete="off"></div>
        <div class="row c2">
          <div class="field" data-f="brand"><label>Brand</label><input id="f-brand" value="${esc(prod?.brand || '')}" autocomplete="off"></div>
          <div class="field" data-f="category"><label>Category</label><select id="f-category">${catOpts}</select></div>
        </div>
        <div class="row c2">
          <div class="field" data-f="price"><label>Price (${esc(state.space.slug)} currency)</label>
            <input id="f-price" type="number" step="0.01" min="0" value="${prod ? (prod.price_cents / 100).toFixed(2) : ''}"></div>
          <div class="field" data-f="badge"><label>Badge</label>
            <select id="f-badge">
              <option value="">none</option>
              ${['NEW', 'ICON', 'TRENDING', 'HEAT', 'LIMITED', 'SALE'].map((b) => `<option ${prod?.badge === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select></div>
        </div>
        <div class="field" data-f="short_description"><label>Short description</label>
          <input id="f-short" value="${esc(prod?.short_description || '')}" autocomplete="off"></div>
        <div class="field" data-f="description"><label>Description</label>
          <textarea id="f-desc">${esc(prod?.description || '')}</textarea></div>
      </div>

      <div>
        <div class="field"><label>Photo</label>
          <img id="f-preview" class="thumb" src="${prod?.image ? '/' + esc(prod.image) : ''}" style="${prod?.image ? '' : 'display:none'}">
          <input id="f-file" type="file" accept="image/*" style="margin-top:8px">
          <input id="f-imgpath" type="hidden" value="${esc(prod?.image || '')}">
        </div>
        <div class="row c2">
          <div class="field" data-f="colorway"><label>Colourway</label><input id="f-colorway" value="${esc(prod?.colorway || '')}" autocomplete="off"></div>
          <div class="field" data-f="material"><label>Material</label><input id="f-material" value="${esc(prod?.material || '')}" autocomplete="off"></div>
        </div>
        <div class="row c2">
          <div class="field"><label>Stock</label><input id="f-stock" type="number" min="0" value="${prod?.stock ?? 20}"></div>
          <div class="field"><label>Status</label>
            <select id="f-status">${['active', 'draft', 'archived'].map((s) => `<option ${prod?.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <div class="row c2">
          <div class="field" data-f="size_system"><label>Size system</label>
            <select id="f-sizesys">${['EU', 'US', 'UK', 'ALPHA', 'ONE_SIZE'].map((s) => `<option ${variants[0]?.size_system === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field" data-f="sizes"><label>Sizes (comma separated)</label>
            <input id="f-sizes" value="${esc(variants.map((v) => v.size_label).join(', '))}" autocomplete="off"></div>
        </div>
        <div class="field" data-f="tags"><label>Tags (comma separated)</label>
          <input id="f-tags" value="${esc(tags.map((t) => t.name).join(', '))}" autocomplete="off"></div>
      </div>
    </div>

    <div style="display:flex;gap:9px;margin-top:8px">
      <button id="f-save">${id ? 'Save product' : 'Create product'}</button>
      <button class="ghost" id="f-cancel">Cancel</button>
    </div>`);

  $('#x').onclick = closeModal;
  $('#f-cancel').onclick = closeModal;

  /* ---- image upload ---- */
  let uploadedDataUrl = null;
  $('#f-file').onchange = async () => {
    const file = $('#f-file').files[0];
    if (!file) return;
    uploadedDataUrl = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(file);
    });
    $('#f-preview').src = uploadedDataUrl;
    $('#f-preview').style.display = '';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', $('#f-name').value || file.name);
    try {
      const r = await api('/api/admin/upload', { method: 'POST', body: fd });
      $('#f-imgpath').value = r.path;
      toast('Photo uploaded');
    } catch (e) { toast(e.message, true); }
  };

  /* ---- AI suggestions with Tab-to-accept ---- */
  const FIELDS = {
    name: { el: '#f-name' },
    brand: { el: '#f-brand' },
    short_description: { el: '#f-short' },
    description: { el: '#f-desc' },
    colorway: { el: '#f-colorway' },
    material: { el: '#f-material' },
    price: { el: '#f-price', from: (d) => (d.price_cents / 100).toFixed(2) },
    badge: { el: '#f-badge', from: (d) => d.badge || '' },
    category: { el: '#f-category', from: (d) => state.categories.find((c) => c.slug === d.category_slug)?.id ?? '' },
    size_system: { el: '#f-sizesys', from: (d) => d.size_system },
    sizes: { el: '#f-sizes', from: (d) => (d.sizes || []).join(', ') },
    tags: { el: '#f-tags', from: (d) => (d.tags || []).join(', ') },
  };

  let suggestions = {};

  function showGhost(key, value, confidence) {
    const wrap = $(`[data-f="${key}"]`);
    if (!wrap || value === '' || value == null) return;
    const input = $(FIELDS[key].el);
    if (String(input.value).trim() === String(value).trim()) return; // already matches

    wrap.classList.add('has-ghost');
    let g = $('.ghosttext', wrap);
    if (!g) {
      g = document.createElement('div');
      g.className = 'ghosttext';
      wrap.appendChild(g);
    }
    const label = key === 'category'
      ? state.categories.find((c) => c.id === Number(value))?.name ?? value
      : value;
    const pct = confidence != null ? `<span class="conf">${Math.round(confidence * 100)}%</span>` : '';
    g.innerHTML = `<b>AI:</b> ${esc(String(label).slice(0, 220))}${pct} <span class="conf">— Tab to accept</span>`;
    g.onclick = () => accept(key);
  }

  function accept(key) {
    const s = suggestions[key];
    if (s === undefined) return false;
    const input = $(FIELDS[key].el);
    input.value = s;
    input.dispatchEvent(new Event('change'));
    const wrap = $(`[data-f="${key}"]`);
    wrap?.classList.remove('has-ghost');
    $('.ghosttext', wrap)?.remove();
    delete suggestions[key];
    return true;
  }

  function acceptAll() {
    const n = Object.keys(suggestions).length;
    Object.keys(suggestions).forEach(accept);
    toast(`Accepted ${n} AI suggestions`);
  }

  // Tab / ArrowRight inside a field accepts that field's suggestion.
  $('.modal').addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); acceptAll(); return; }
    const wrap = e.target.closest?.('[data-f]');
    if (!wrap) return;
    const key = wrap.dataset.f;
    if (suggestions[key] === undefined) return;
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      // Only intercept ArrowRight at the end of the text, so it stays usable.
      if (e.key === 'ArrowRight') {
        const el = e.target;
        if (typeof el.selectionStart === 'number' && el.selectionStart !== el.value.length) return;
      }
      e.preventDefault();
      accept(key);
    }
  });

  $('#ai-fill').onclick = async () => {
    const btn = $('#ai-fill');
    const status = $('#ai-status');
    if (!$('#f-name').value.trim() && !uploadedDataUrl) {
      toast('Type a product name or add a photo first', true);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    status.textContent = '';
    try {
      const r = await api('/api/ai/agents/enrich', {
        method: 'POST',
        body: {
          space: state.space.slug,
          name: $('#f-name').value,
          brand: $('#f-brand').value,
          categoryHint: state.categories.find((c) => c.id === Number($('#f-category').value))?.slug,
          priceHint: $('#f-price').value ? `$${$('#f-price').value}` : '',
          notes: $('#f-short').value,
          imageDataUrl: uploadedDataUrl || undefined,
        },
      });
      const d = r.data;
      suggestions = {};
      for (const [key, cfg] of Object.entries(FIELDS)) {
        const val = cfg.from ? cfg.from(d) : d[key];
        if (val === undefined || val === null || val === '') continue;
        suggestions[key] = val;
        showGhost(key, val, d.confidence?.[key] ?? d.confidence?.[key === 'price' ? 'price_cents' : key]);
      }
      status.innerHTML = `<span class="muted">${esc(r.provider)} · ${r.latencyMs}ms · $${r.costUsd.toFixed(5)}</span>`;
      toast(`AI filled ${Object.keys(suggestions).length} fields — Tab to accept, Ctrl+Enter for all`);
    } catch (e) {
      toast(e.message, true);
    }
    btn.disabled = false;
    btn.textContent = '✨ Complete with AI';
  };

  /* ---- save ---- */
  $('#f-save').onclick = async () => {
    const body = {
      space_id: state.space.id,
      category_id: Number($('#f-category').value),
      name: $('#f-name').value.trim(),
      brand: $('#f-brand').value.trim() || null,
      short_description: $('#f-short').value.trim() || null,
      description: $('#f-desc').value.trim() || null,
      price_cents: Math.round(Number($('#f-price').value || 0) * 100),
      badge: $('#f-badge').value || null,
      colorway: $('#f-colorway').value.trim() || null,
      material: $('#f-material').value.trim() || null,
      stock: Number($('#f-stock').value || 0),
      status: $('#f-status').value,
      size_system: $('#f-sizesys').value,
      sizes: $('#f-sizes').value.split(',').map((s) => s.trim()).filter(Boolean),
      tags: $('#f-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if ($('#f-imgpath').value) body.image_path = $('#f-imgpath').value;
    if (!body.name) return toast('Name is required', true);

    try {
      if (id) await api(`/api/admin/products/${id}`, { method: 'PATCH', body });
      else await api('/api/admin/products', { method: 'POST', body });
      toast('Product saved');
      closeModal();
      await loadSpace(state.space.slug);
      render();
    } catch (e) { toast(e.message, true); }
  };
}

/* ------------------------------------------------------------------ */

if (state.token) {
  boot().catch(() => signOut());
} else {
  $('#login').classList.remove('hidden');
}
