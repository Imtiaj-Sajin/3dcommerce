// Procedural canvas textures for the premium hall: brick, concrete,
// polished tiles and the sun-shaft gradient. No external image files.

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function jitter(base, amt) {
  return base + (Math.random() - 0.5) * amt;
}

/** Warm red-brown brick wall. One texture tile = 8 bricks × 16 rows. */
export function brickTexture() {
  const c = canvas(512, 512);
  const ctx = c.getContext('2d');

  // mortar
  ctx.fillStyle = '#8f8578';
  ctx.fillRect(0, 0, 512, 512);

  const BW = 64, BH = 32, GAP = 5;
  for (let row = 0; row < 16; row++) {
    const offset = row % 2 === 0 ? 0 : -BW / 2;
    for (let col = -1; col < 9; col++) {
      const x = col * BW + offset;
      const y = row * BH;
      // per-brick colour variation around a worn red-brown
      const r = Math.round(jitter(138, 44));
      const g = Math.round(jitter(82, 26));
      const b = Math.round(jitter(66, 22));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + GAP / 2, y + GAP / 2, BW - GAP, BH - GAP);
      // subtle top highlight + bottom shade for depth
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + GAP / 2, y + GAP / 2, BW - GAP, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x + GAP / 2, y + BH - GAP / 2 - 3, BW - GAP, 3);
      // occasional blemish
      if (Math.random() < 0.25) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
        ctx.fillRect(x + GAP / 2 + Math.random() * 40, y + GAP / 2 + Math.random() * 20, 14, 8);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex; // caller sets repeat — one tile ≈ 4.4m × 2.9m of wall
}

/** Light poured-concrete / plaster for the signage walls and ceiling. */
export function concreteTexture(base = [206, 202, 194]) {
  const c = canvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, 512, 512);

  // fine speckle noise
  for (let i = 0; i < 5200; i++) {
    const v = Math.random() * 0.1;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${v})` : `rgba(255,255,255,${v})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  // soft stains
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 40 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, `rgba(90,86,78,${0.05 + Math.random() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // faint formwork seams
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 2;
  for (const p of [170, 340]) {
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Polished showroom floor tiles (drawn light — sits over the mirror). */
export function tileTexture() {
  const c = canvas(512, 512);
  const ctx = c.getContext('2d');
  const T = 128; // 4×4 tiles per texture

  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const v = Math.round(jitter(210, 14));
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(tx * T, ty * T, T, T);
      // subtle per-tile sheen gradient
      const g = ctx.createLinearGradient(tx * T, ty * T, tx * T + T, ty * T + T);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.05)');
      ctx.fillStyle = g;
      ctx.fillRect(tx * T, ty * T, T, T);
    }
  }
  // grout
  ctx.strokeStyle = 'rgba(96,92,84,0.85)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * T, 0); ctx.lineTo(i * T, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * T); ctx.lineTo(512, i * T); ctx.stroke();
  }
  // light scratches
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 130, y + (Math.random() - 0.5) * 130);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vertical white→black gradient used as an additive sun-shaft. */
export function shaftGradientTexture() {
  const c = canvas(64, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
