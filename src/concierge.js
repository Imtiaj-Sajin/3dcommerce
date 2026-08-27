// The concierge chat panel.
//
// The panel is a thin shell: it keeps the transcript, sends what the shopper
// says (and what is in their basket, and what is already on screen) to the
// concierge agent, and renders whatever comes back. Every product card and
// action button refers to a real row the server returned - the client never
// invents one either.

import { aiChat } from './api.js';
import { getProduct, SPACE } from './products.js';

const $ = (s) => document.querySelector(s);
const money = (n) => '$' + Number(n ?? 0).toFixed(2).replace(/\.00$/, '');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The prompt asks for plain prose, but models still reach for **bold**.
// Strip the markers rather than render them, so nobody sees raw asterisks.
const plain = (s) =>
  String(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|[.,!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

/** Shrink an upload before it goes over the wire. */
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
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const OPENERS = [
  'Hi — I can find anything in the mall for you. Describe it, or send me a photo of something you like.',
  'Welcome in. Tell me what you are after, or send a photo and I will find the closest thing we carry.',
];

export class Concierge {
  /**
   * @param {object} o
   * @param {import('./ui.js').UI} o.ui
   * @param {(slug:string)=>void} o.onWalkTo         walk to a product in this space
   * @param {(space:string,slug:string,name:string)=>void} o.onVisitSpace
   * @param {(productId:number,slug:string)=>void} o.onTryOn
   */
  constructor({ ui, onWalkTo, onVisitSpace, onTryOn }) {
    this.ui = ui;
    this.onWalkTo = onWalkTo;
    this.onVisitSpace = onVisitSpace;
    this.onTryOn = onTryOn;

    this.history = [];     // [{role, content}] sent back for context
    this.shown = [];       // product names currently on screen
    this.pendingImage = null;
    this.busy = false;
    this.opened = false;

    this._bind();
  }

  /* ---------------- wiring ---------------- */

  _bind() {
    $('#chat-fab')?.addEventListener('click', () => this.toggle(true));
    $('#chat-close')?.addEventListener('click', () => this.toggle(false));

    const input = $('#chat-input');
    // The scene listens for WASD on window; typing must not walk the player.
    input?.addEventListener('keydown', (e) => e.stopPropagation());
    input?.addEventListener('keyup', (e) => e.stopPropagation());

    $('#chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send(input.value);
    });

    $('#chat-photo')?.addEventListener('click', () => $('#chat-file').click());
    $('#chat-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        this.pendingImage = await fileToDataUrl(file);
        $('#chat-photo').classList.add('on');
        this.toggle(true);
        // A photo on its own is a complete question - send it straight away.
        this.send($('#chat-input').value || '');
      } catch (err) {
        this.ui.toast(err.message, true);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.toggle(false);
    });
  }

  get isOpen() {
    return !$('#chat-panel')?.classList.contains('hidden');
  }

  toggle(open) {
    const panel = $('#chat-panel');
    const fab = $('#chat-fab');
    const show = open ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
    fab.classList.toggle('hidden', show);
    fab.classList.remove('nudge');
    if (show) {
      if (!this.opened) {
        this.opened = true;
        this._bot(OPENERS[Math.floor(Math.random() * OPENERS.length)], {
          suggestions: ['Something for a wedding', 'What is on sale?', 'Show me white trainers'],
        });
      }
      setTimeout(() => $('#chat-input')?.focus(), 60);
    }
  }

  /** Draw attention to the chat without opening it. */
  nudge(text) {
    if (this.isOpen) return;
    $('#chat-fab')?.classList.add('nudge');
    if (text) this.ui.toast(text);
  }

  /** Tell the concierge what the shopper is looking at, for context. */
  setShown(names) {
    this.shown = (names ?? []).slice(0, 12);
  }

  /* ---------------- rendering ---------------- */

  _scroll() {
    const log = $('#chat-log');
    log.scrollTop = log.scrollHeight;
  }

  _me(text, imageDataUrl) {
    const el = document.createElement('div');
    el.className = 'msg me';
    el.innerHTML =
      (imageDataUrl ? `<img src="${imageDataUrl}" alt="your photo">` : '') +
      (text ? esc(plain(text)) : imageDataUrl ? '<i>sent a photo</i>' : '');
    $('#chat-log').appendChild(el);
    this._scroll();
  }

  _typing(on) {
    const existing = $('#chat-typing');
    if (!on) return existing?.remove();
    if (existing) return;
    const el = document.createElement('div');
    el.className = 'msg bot';
    el.id = 'chat-typing';
    el.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
    $('#chat-log').appendChild(el);
    this._scroll();
  }

  _bot(text, { products = [], actions = [], suggestions = [], sawImage = null } = {}) {
    const el = document.createElement('div');
    el.className = 'msg bot';

    let html = esc(plain(text));
    if (sawImage?.description) {
      html += `<div class="seen">I looked at your photo: ${esc(sawImage.description)}</div>`;
    }
    if (products.length) {
      html += '<div class="chat-cards">' + products.slice(0, 4).map((p) => `
        <div class="chat-card" data-slug="${esc(p.slug)}" data-space="${esc(p.spaceSlug ?? '')}" data-id="${p.id}">
          <img src="${p.image ? '/' + esc(p.image) : ''}" alt="">
          <div>
            <div class="cc-nm">${esc(p.name)}</div>
            <div class="cc-mt">${esc(p.spaceName ?? '')}${p.categoryName ? ' · ' + esc(p.categoryName) : ''}</div>
          </div>
          <div class="cc-pr">${money(p.finalPrice)}${p.onSale ? `<s>${money(p.price)}</s>` : ''}</div>
        </div>`).join('') + '</div>';
    }
    el.innerHTML = html;

    if (actions.length) {
      const bar = document.createElement('div');
      bar.className = 'chat-actions';
      for (const a of actions) {
        const b = document.createElement('button');
        b.textContent = a.label;
        if (a.type === 'add_to_cart' || a.type === 'checkout') b.className = 'primary';
        b.addEventListener('click', () => this._act(a));
        bar.appendChild(b);
      }
      el.appendChild(bar);
    }

    $('#chat-log').appendChild(el);

    // card clicks open the product
    el.querySelectorAll('.chat-card').forEach((card) => {
      card.addEventListener('click', () =>
        this._act({ type: 'view', slug: card.dataset.slug, spaceSlug: card.dataset.space, productId: Number(card.dataset.id) })
      );
    });

    this._chips(suggestions);
    this._scroll();
  }

  _chips(list) {
    const wrap = $('#chat-chips');
    wrap.innerHTML = '';
    for (const s of list ?? []) {
      const b = document.createElement('button');
      b.textContent = s;
      b.addEventListener('click', () => this.send(s));
      wrap.appendChild(b);
    }
  }

  /* ---------------- actions ---------------- */

  _act(a) {
    const inThisSpace = !a.spaceSlug || a.spaceSlug === SPACE?.slug;

    if (a.type === 'checkout') {
      this.ui.toggleCart(true);
      return;
    }
    if (!inThisSpace) {
      // The item lives in another store: go there and open it on arrival.
      this.onVisitSpace?.(a.spaceSlug, a.slug, a.label);
      return;
    }
    const product = getProduct(a.slug);
    if (!product) {
      this.ui.toast('That one is not on display here');
      return;
    }

    if (a.type === 'view' || a.type === 'add_to_cart') {
      this.onWalkTo?.(a.slug);
      this.ui.openProduct(a.slug);
      if (a.type === 'add_to_cart') {
        this.ui.toast('Pick a size and it is yours 👆');
      }
      return;
    }
    if (a.type === 'try_on') {
      this.onWalkTo?.(a.slug);
      this.ui.openProduct(a.slug);
      this.onTryOn?.(product.dbId, a.slug);
    }
  }

  /* ---------------- the turn ---------------- */

  async send(text) {
    const message = String(text || '').trim();
    const image = this.pendingImage;
    if (!message && !image) return;
    if (this.busy) return;

    this.busy = true;
    $('#chat-send').disabled = true;
    $('#chat-input').value = '';
    $('#chat-photo').classList.remove('on');
    this.pendingImage = null;
    this._chips([]);

    this._me(message, image);
    this.history.push({ role: 'user', content: message || '(sent a photo)' });
    this._typing(true);

    try {
      const r = await aiChat({
        space: SPACE?.slug,
        message,
        image,
        history: this.history.slice(-8),
        cart: this.ui.cart.map((c) => ({ name: c.name, price: c.price, size: c.size ? String(c.size) : null })),
        shown: this.shown,
      });
      this._typing(false);

      const d = r.data;
      this._bot(d.reply, {
        products: d.products,
        actions: d.actions,
        suggestions: d.suggestions,
        sawImage: d.sawImage,
      });
      this.history.push({ role: 'assistant', content: d.reply });
      this.setShown((d.products ?? []).map((p) => p.name));
    } catch (err) {
      this._typing(false);
      this._bot(
        `Sorry — I could not reach the shop just then. ${err.message}`,
        { suggestions: ['Try again'] }
      );
    }

    this.busy = false;
    $('#chat-send').disabled = false;
    $('#chat-input').focus();
  }

  /**
   * Volunteer the try-on when someone lingers on a wearable product. This is
   * the assistant being useful without being asked - but only once per
   * product, and never while they are already talking to it.
   */
  offerTryOn(product) {
    if (!product || this._offered === product.id) return;
    this._offered = product.id;
    if (this.isOpen) {
      this._bot(
        `Curious how the ${product.name} would look on you? I can render a preview — ` +
        `use your own photo or a stand-in model.`,
        {
          actions: [{ type: 'try_on', productId: product.dbId, slug: product.id, spaceSlug: SPACE?.slug, label: 'See it on me' }],
          suggestions: ['Show me similar', 'Anything cheaper?'],
        }
      );
    } else {
      this.nudge(`Want to see the ${product.name} on you? Ask the concierge 💬`);
    }
  }
}
