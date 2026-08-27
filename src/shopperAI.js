// Shopper-facing AI: the search bar, photo search and the try-on preview.
//
// All three talk to the agent endpoints through src/api.js. Everything
// degrades quietly: if the model is unavailable the search falls back to a
// plain keyword query server-side, and the try-on button just reports why.

import { aiSearch, aiSearchImage, aiTryOn, plainSearch } from './api.js';
import { getProduct } from './products.js';

const $ = (s) => document.querySelector(s);

const money = (n) => '$' + Number(n ?? 0).toFixed(2).replace(/\.00$/, '');

/** Downscale an upload before it goes over the wire - phones shoot huge JPEGs. */
function fileToDataUrl(file, maxEdge = 1024) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('could not read that file'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('that file is not an image'));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export class ShopperAI {
  /**
   * @param {object} opts
   * @param {string} opts.space        current space slug
   * @param {import('./ui.js').UI} opts.ui
   * @param {(id:string)=>void} [opts.onWalkTo] walk the player to a product
   */
  constructor({ space, ui, onWalkTo }) {
    this.space = space;
    this.ui = ui;
    this.onWalkTo = onWalkTo;
    this.faceDataUrl = null;
    this.busy = false;
    this._bind();
  }

  /* ---------------- search ---------------- */

  _bind() {
    const input = $('#search-input');
    input?.addEventListener('keydown', (e) => {
      // The 3D scene listens for WASD on window; stop it hearing typing.
      e.stopPropagation();
      if (e.key === 'Enter') this.search(input.value);
      if (e.key === 'Escape') { input.value = ''; input.blur(); this.closePanel(); }
    });
    input?.addEventListener('keyup', (e) => e.stopPropagation());

    $('#search-camera')?.addEventListener('click', () => $('#search-file').click());
    $('#search-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) this.searchByPhoto(file);
    });

    $('#sp-close')?.addEventListener('click', () => this.closePanel());

    /* ---- try-on ---- */
    $('#tryon-btn')?.addEventListener('click', () => this.tryOn());
    $('#tryon-face')?.addEventListener('click', () => $('#tryon-file').click());
    $('#tryon-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        this.faceDataUrl = await fileToDataUrl(file, 768);
        $('#tryon-face').classList.add('on');
        $('#tryon-face').textContent = '✓ Photo';
        this._note('Your photo is used for this preview only — it is never saved.');
      } catch (err) {
        this.ui.toast(err.message, true);
      }
    });

    document.querySelectorAll('[data-close-tryon]').forEach((el) =>
      el.addEventListener('click', () => $('#tryon-modal').classList.add('hidden'))
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('#tryon-modal').classList.add('hidden');
    });
  }

  _note(msg) {
    const el = $('#tryon-note');
    if (el) el.textContent = msg;
  }

  closePanel() {
    $('#search-panel')?.classList.add('hidden');
  }

  _showResults(title, note, results) {
    $('#sp-title').textContent = title;
    $('#sp-note').textContent = note || '';
    const wrap = $('#sp-results');
    wrap.innerHTML = '';

    if (!results.length) {
      wrap.innerHTML = '<div class="sp-empty">Nothing in this store matched.<br>Try different words, or browse the walls.</div>';
    }

    for (const r of results) {
      const row = document.createElement('div');
      row.className = 'sp-row';
      row.innerHTML = `
        <img src="${r.image ? '/' + r.image : ''}" alt="">
        <div>
          <div class="nm">${r.name}</div>
          <div class="mt">${r.brand ?? ''}${r.categoryName ? ' · ' + r.categoryName : ''}</div>
        </div>
        <div class="pr">${money(r.finalPrice)}${r.onSale ? `<s>${money(r.price)}</s>` : ''}</div>`;
      row.addEventListener('click', () => {
        // The product may not be on a wall (it could be on the island), so
        // open the card either way and walk over when we know where it is.
        if (getProduct(r.slug)) {
          this.onWalkTo?.(r.slug);
          this.ui.openProduct(r.slug);
        } else {
          this.ui.toast(`${r.name} is not on display in this space`);
        }
      });
      wrap.appendChild(row);
    }
    $('#search-panel').classList.remove('hidden');
  }

  async search(text) {
    const query = String(text || '').trim();
    if (!query) return this.closePanel();
    if (this.busy) return;

    this.busy = true;
    this._showResults('Searching…', query, []);
    try {
      const r = await aiSearch(this.space, query);
      const results = r.data?.results ?? [];
      const note = r.data?.degraded
        ? 'Keyword results (the assistant was unavailable).'
        : r.data?.explanation || query;
      this._showResults(`${results.length} result${results.length === 1 ? '' : 's'}`, note, results);
    } catch (err) {
      // Last-resort: the plain SQL search needs no model at all.
      try {
        const results = await plainSearch(this.space, query);
        this._showResults(`${results.length} results`, 'Keyword results.', results);
      } catch {
        this._showResults('Search failed', err.message, []);
      }
    }
    this.busy = false;
  }

  async searchByPhoto(file) {
    if (this.busy) return;
    this.busy = true;
    const btn = $('#search-camera');
    btn?.classList.add('busy');
    this._showResults('Reading your photo…', 'Looking for something similar in this store.', []);

    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await aiSearchImage(this.space, dataUrl);
      const a = r.data?.attrs;
      const results = r.data?.results ?? [];
      const seen = a
        ? [a.primary_color, a.silhouette || a.product_type, a.brand_guess ? `(looks like ${a.brand_guess})` : '']
            .filter(Boolean)
            .join(' ')
        : '';
      this._showResults(
        results.length ? `${results.length} similar` : 'No close match',
        r.data?.note || (seen ? `I see: ${seen}` : ''),
        results
      );
    } catch (err) {
      this._showResults('Photo search failed', err.message, []);
    }
    btn?.classList.remove('busy');
    this.busy = false;
  }

  /* ---------------- try-on ---------------- */

  /** Reset the panel when a different product is opened. */
  resetTryOn() {
    this.faceDataUrl = null;
    const face = $('#tryon-face');
    if (face) {
      face.classList.remove('on');
      face.textContent = '＋ Photo';
    }
    this._note('');
  }

  async tryOn() {
    const product = this.ui.current;
    if (!product) return;
    if (!product.dbId) {
      this.ui.toast('This product cannot be previewed yet', true);
      return;
    }

    const btn = $('#tryon-btn');
    const modal = $('#tryon-modal');
    const img = $('#tryon-img');
    const spinner = $('#tryon-spinner');

    btn.disabled = true;
    $('#tryon-title').textContent = `${product.name} — size ${$('#tryon-size').value}`;
    $('#tryon-disclaimer').textContent = '';
    img.hidden = true;
    spinner.hidden = false;
    modal.classList.remove('hidden');

    try {
      const r = await aiTryOn(product.dbId, $('#tryon-size').value, this.faceDataUrl || undefined);
      img.src = r.data.image;
      img.hidden = false;
      spinner.hidden = true;
      $('#tryon-disclaimer').textContent =
        `${r.data.disclaimer} · rendered by ${r.data.imageProvider ?? 'AI'}`;
    } catch (err) {
      spinner.innerHTML = `<p style="color:#ff5470;max-width:320px;line-height:1.6">Could not render a preview.</p>
        <span>${err.message}</span>`;
    }
    btn.disabled = false;
  }
}
