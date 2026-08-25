// Product card + neon sign textures. Cards use the real product photos
// from public/products/ drawn onto a clean retail-style display card.

import * as THREE from 'three';
import { imgURL } from './products.js';

const CARD_W = 512;
const CARD_H = 640;

/**
 * Builds a CanvasTexture for a product display card in the 3D shop.
 * Paints immediately (frame + text) and repaints once the photo decodes.
 */
export function buildCardTexture(product, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  function paint(img) {
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    // white retail card
    ctx.beginPath();
    ctx.roundRect(6, 6, CARD_W - 12, CARD_H - 12, 28);
    ctx.fillStyle = '#fafafa';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.stroke();

    // accent top strip (clipped to the card's rounded corners)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(6, 6, CARD_W - 12, 56, 28);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(6, 6, CARD_W - 12, 16);
    ctx.restore();

    // product photo (700×500 source ratio)
    if (img) {
      const iw = 464;
      const ih = iw * (500 / 700);
      ctx.drawImage(img, (CARD_W - iw) / 2, 88, iw, ih);
    } else {
      ctx.fillStyle = '#ececec';
      ctx.beginPath();
      ctx.roundRect(60, 120, 392, 270, 18);
      ctx.fill();
    }

    // tag chip
    if (product.tag) {
      ctx.font = '700 24px "Segoe UI", sans-serif';
      const tw = ctx.measureText(product.tag).width;
      ctx.fillStyle = product.salePrice ? '#ff2d55' : accent;
      ctx.beginPath();
      ctx.roundRect(30, 40, tw + 32, 42, 21);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(product.tag, 46, 62);
    }

    // brand
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = accent;
    ctx.font = '800 26px "Segoe UI", sans-serif';
    ctx.fillText(product.categoryName.toUpperCase(), CARD_W / 2, 452);

    // name (shrink to fit)
    ctx.fillStyle = '#17191c';
    let px = 40;
    ctx.font = `800 ${px}px "Segoe UI", sans-serif`;
    while (ctx.measureText(product.name).width > CARD_W - 70 && px > 24) {
      px -= 2;
      ctx.font = `800 ${px}px "Segoe UI", sans-serif`;
    }
    ctx.fillText(product.name, CARD_W / 2, 502);

    // price (sale = old price struck through + red price)
    if (product.salePrice) {
      ctx.font = '600 28px "Segoe UI", sans-serif';
      ctx.fillStyle = '#9aa0a8';
      const old = `$${product.price}`;
      const ow = ctx.measureText(old).width;
      ctx.fillText(old, CARD_W / 2 - 62, 566);
      ctx.strokeStyle = '#9aa0a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CARD_W / 2 - 62 - ow / 2 - 4, 556);
      ctx.lineTo(CARD_W / 2 - 62 + ow / 2 + 4, 556);
      ctx.stroke();
      ctx.font = '800 42px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ff2d55';
      ctx.fillText(`$${product.salePrice}`, CARD_W / 2 + 46, 570);
    } else {
      ctx.font = '800 40px "Segoe UI", sans-serif';
      ctx.fillStyle = '#17191c';
      ctx.fillText(`$${product.price}`, CARD_W / 2, 568);
    }

    texture.needsUpdate = true;
  }

  function redraw() {
    const img = new Image();
    img.onload = () => paint(img);
    img.src = imgURL(product);
    paint(null);
  }

  redraw();
  return { texture, redraw };
}

/* ------------------------------------------------------------------ */
/*  Neon sign texture                                                 */
/* ------------------------------------------------------------------ */

export function buildSignTexture(text, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 118;
  ctx.font = `800 ${px}px "Segoe UI", sans-serif`;
  while (ctx.measureText(text).width > 960 && px > 60) {
    px -= 6;
    ctx.font = `800 ${px}px "Segoe UI", sans-serif`;
  }

  ctx.shadowColor = accent;
  ctx.shadowBlur = 60;
  ctx.fillStyle = accent;
  ctx.fillText(text, 512, 130);
  ctx.shadowBlur = 26;
  ctx.fillText(text, 512, 130);
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 512, 130);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
