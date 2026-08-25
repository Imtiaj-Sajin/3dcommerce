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

/**
 * Polished large-format showroom floor — the premium is baked into the
 * texture (soft concrete mottling, thin light grout, polish streaks) and
 * a matching roughness map makes the env-map sheen vary like real stone.
 * One texture covers 4.6m of floor → each tile is 2.3m "large format".
 */
export function floorTextures() {
  const S = 1024;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');

  // warm light-grey base
  ctx.fillStyle = '#dad8d3';
  ctx.fillRect(0, 0, S, S);

  // large soft mottling — polished-concrete clouding
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 130 + Math.random() * 280;
    const g = ctx.createRadialGradient(x, y, 8, x, y, r);
    const dark = Math.random() < 0.55;
    g.addColorStop(0, dark
      ? `rgba(118,114,106,${0.03 + Math.random() * 0.04})`
      : `rgba(255,255,255,${0.03 + Math.random() * 0.04})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // fine grain
  for (let i = 0; i < 9000; i++) {
    const v = Math.random() * 0.045;
    ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${v})` : `rgba(255,255,255,${v})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
  }

  // diagonal polish streaks
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-0.5);
  for (let i = 0; i < 12; i++) {
    const y = -S + Math.random() * S * 2;
    const g = ctx.createLinearGradient(0, y - 26, 0, y + 26);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.02 + Math.random() * 0.025})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-S, y - 26, S * 2, 52);
  }
  ctx.restore();

  // thin light grout with a subtle bevel highlight (2 tiles per texture)
  for (const p of [0, S / 2]) {
    ctx.fillStyle = 'rgba(150,146,138,0.55)';
    ctx.fillRect(p, 0, 3, S);
    ctx.fillRect(0, p, S, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(p + 3, 0, 1.5, S);
    ctx.fillRect(0, p + 3, S, 1.5);
  }

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  // roughness map — darker = smoother = shinier
  const rc = canvas(512, 512);
  const rctx = rc.getContext('2d');
  rctx.fillStyle = '#5a5a5a';
  rctx.fillRect(0, 0, 512, 512);
  rctx.save();
  rctx.translate(256, 256);
  rctx.rotate(-0.5);
  for (let i = 0; i < 10; i++) {
    const y = -512 + Math.random() * 1024;
    const g = rctx.createLinearGradient(0, y - 30, 0, y + 30);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(50,50,50,${0.35 + Math.random() * 0.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    rctx.fillStyle = g;
    rctx.fillRect(-512, y - 30, 1024, 60);
  }
  rctx.restore();
  for (let i = 0; i < 2600; i++) {
    rctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
    rctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  for (const p of [0, 256]) {
    rctx.fillStyle = 'rgba(190,190,190,0.8)'; // grout is rougher
    rctx.fillRect(p, 0, 2, 512);
    rctx.fillRect(0, p, 512, 2);
  }
  const roughnessMap = new THREE.CanvasTexture(rc);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  return { map, roughnessMap };
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
