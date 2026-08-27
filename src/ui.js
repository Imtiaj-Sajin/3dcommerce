// HTML overlay: product detail modal, sizes, cart drawer, toasts and the
// bottom brand navigation. Product photos come from public/products/.

import { getProduct, imgURL, sizesFor, sizeSystemOf } from './products.js';

const $ = (sel) => document.querySelector(sel);

const VIEW_VARIANTS = [
  { id: 'side', label: 'Photo', cls: '' },
  { id: 'flip', label: 'Mirror', cls: 'v-flip' },
  { id: 'zoom', label: 'Detail', cls: 'v-zoom' },
];

export class UI {
  constructor({ onNavigate }) {
    this.onNavigate = onNavigate;
    this.cart = [];
    this.current = null;
    this.sizeChoice = null;
    this._bindStatic();
  }

  /* ---------------- static bindings ---------------- */

  _bindStatic() {
    document.querySelectorAll('#zone-nav button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setActiveZone(btn.dataset.zone);
        this.onNavigate(btn.dataset.zone);
      });
    });

    $('.modal-close').addEventListener('click', () => this.closeModal());
    $('.modal-backdrop').addEventListener('click', () => this.closeModal());
    $('#add-to-cart').addEventListener('click', () => this._addToCart());

    $('#cart-btn').addEventListener('click', () => this.toggleCart());
    $('#cart-close').addEventListener('click', () => this.toggleCart(false));
    $('#checkout-btn').addEventListener('click', () => {
      if (!this.cart.length) return this.toast('Your cart is empty — go grab a pair! 👟');
      this.toast('Demo shop — no real checkout. Your taste is confirmed though ✨');
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.toggleCart(false);
      }
    });
  }

  setActiveZone(zone) {
    document.querySelectorAll('#zone-nav button').forEach((b) =>
      b.classList.toggle('active', b.dataset.zone === zone)
    );
  }

  /* ---------------- product modal ---------------- */

  get modalOpen() {
    return !$('#modal').classList.contains('hidden');
  }

  openProduct(id) {
    const p = getProduct(id);
    if (!p) return;
    this.current = p;
    this.sizeChoice = null;

    $('#modal-name').textContent = p.name;
    $('#modal-desc').textContent = p.desc;
    $('#modal-category').textContent = p.categoryName;
    $('#modal-category').style.color = p.accent;
    $('#modal-category').style.borderColor = p.accent;

    const priceEl = $('#modal-price');
    if (p.salePrice) {
      priceEl.innerHTML = `<s>$${p.price}</s> <span class="sale-now">$${p.salePrice}</span>`;
    } else {
      priceEl.textContent = `$${p.price}`;
    }

    const tag = $('#modal-tag');
    tag.classList.toggle('hidden', !p.tag);
    tag.textContent = p.tag || '';
    tag.classList.toggle('chip-sale', !!p.salePrice);

    $('#modal-img').src = imgURL(p);
    const sysLabel = sizeSystemOf(p);
    $('#modal-size-label').textContent = sysLabel ? `Size (${sysLabel})` : 'Size';
    this._renderSizes();
    this._renderVariants();
    this._setView('side');

    $('#modal').classList.remove('hidden');
  }

  closeModal() {
    $('#modal').classList.add('hidden');
    this.current = null;
  }

  _renderSizes() {
    const wrap = $('#modal-sizes');
    wrap.innerHTML = '';
    sizesFor(this.current).forEach((s) => {
      const b = document.createElement('button');
      b.textContent = s;
      b.addEventListener('click', () => {
        this.sizeChoice = s;
        wrap.querySelectorAll('button').forEach((x) =>
          x.classList.toggle('active', x === b)
        );
      });
      wrap.appendChild(b);
    });
  }

  _renderVariants() {
    const wrap = $('#modal-thumbs');
    wrap.innerHTML = '';
    VIEW_VARIANTS.forEach((v) => {
      const b = document.createElement('button');
      b.textContent = v.label;
      b.dataset.view = v.id;
      b.addEventListener('click', () => this._setView(v.id));
      wrap.appendChild(b);
    });
  }

  _setView(id) {
    const v = VIEW_VARIANTS.find((x) => x.id === id);
    $('#modal-img-wrap').className = `modal-img-wrap ${v.cls}`;
    document.querySelectorAll('#modal-thumbs button').forEach((b) =>
      b.classList.toggle('active', b.dataset.view === id)
    );
  }

  /* ---------------- cart ---------------- */

  _addToCart() {
    if (!this.sizeChoice) {
      this.toast('Pick a size first 👆');
      return;
    }
    const p = this.current;
    const system = sizeSystemOf(p);
    this.cart.push({
      productId: p.id,
      name: p.name,
      price: p.salePrice ?? p.price,
      size: this.sizeChoice,
      sizeSystem: system,
    });
    this._refreshCartBadge();
    this.toast(`${p.name} (${system ? system + ' ' : ''}${this.sizeChoice}) added to cart 🛒`);
    this.closeModal();
  }

  _refreshCartBadge() {
    const badge = $('#cart-count');
    badge.textContent = this.cart.length;
    badge.classList.toggle('hidden', this.cart.length === 0);
  }

  toggleCart(force) {
    const drawer = $('#cart-drawer');
    const show = force ?? drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden', !show);
    if (show) this._renderCart();
  }

  _renderCart() {
    const wrap = $('#cart-items');
    wrap.innerHTML = '';
    if (!this.cart.length) {
      wrap.innerHTML = '<div class="cart-empty">Nothing here yet.<br/>The shelves are calling…</div>';
    }
    this.cart.forEach((item, idx) => {
      const p = getProduct(item.productId);
      const row = document.createElement('div');
      row.className = 'cart-row';
      const img = document.createElement('img');
      img.src = imgURL(p);
      const info = document.createElement('div');
      info.className = 'cr-info';
      info.innerHTML = `<div class="cr-name">${item.name}</div>
        <div class="cr-meta">${p.categoryName} · ${item.sizeSystem ? item.sizeSystem + ' ' : ''}${item.size}</div>`;
      const price = document.createElement('div');
      price.className = 'cr-price';
      price.textContent = `$${item.price}`;
      const rm = document.createElement('button');
      rm.className = 'cr-remove';
      rm.textContent = '✕';
      rm.title = 'Remove';
      rm.addEventListener('click', () => {
        this.cart.splice(idx, 1);
        this._refreshCartBadge();
        this._renderCart();
      });
      row.append(img, info, price, rm);
      wrap.appendChild(row);
    });
    $('#cart-total').textContent =
      '$' + this.cart.reduce((sum, i) => sum + i.price, 0);
  }

  /* ---------------- toast ---------------- */

  toast(msg, ms = 2400) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }
}
