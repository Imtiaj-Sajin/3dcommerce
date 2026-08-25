// Procedural sneaker illustrations (SVG) + product card textures for the 3D scene.
// Everything is generated locally so the project needs no external image assets.

import * as THREE from 'three';

const VB_W = 640;
const VB_H = 400;

/* ------------------------------------------------------------------ */
/*  SVG silhouette templates                                          */
/*  palette: { upper, overlay, sole, midsole, accent, lace, collar }  */
/* ------------------------------------------------------------------ */

function soleLayers(c) {
  // Midsole + outsole shared by every template (toe points right).
  let tread = '';
  for (let i = 0; i < 9; i++) {
    const x = 110 + i * 52;
    tread += `<rect x="${x}" y="337" width="26" height="7" rx="3" fill="rgba(0,0,0,0.30)"/>`;
  }
  return `
    <path d="M 78 330 C 70 314 86 303 116 299 C 262 285 440 286 564 300
             C 592 304 602 317 595 330 C 520 321 380 317 240 321
             C 168 323 110 327 78 330 Z" fill="${c.midsole}"/>
    <path d="M 84 349 C 68 349 62 338 76 331 C 180 323 430 319 578 329
             C 596 331 599 342 586 347 C 470 353 200 353 84 349 Z" fill="${c.sole}"/>
    ${tread}`;
}

function laceCrossings(c, startX, startY, dx, dy, count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const cx = startX + i * dx;
    const cy = startY + i * dy;
    out += `<line x1="${cx - 17}" y1="${cy + 21}" x2="${cx + 15}" y2="${cy - 7}"
             stroke="${c.lace}" stroke-width="10" stroke-linecap="round"/>`;
  }
  return out;
}

function runnerBody(c) {
  return `
    <path d="M 96 322
             C 82 288 86 232 108 204
             C 116 192 134 190 144 200
             C 158 214 185 224 212 219
             C 224 217 232 206 238 192
             C 244 176 252 166 262 164
             C 276 162 290 168 298 178
             C 340 210 400 236 452 252
             C 490 262 530 270 556 282
             C 578 292 594 300 597 310
             C 599 318 592 326 580 328
             L 96 322 Z" fill="${c.upper}"/>
    <path d="M 144 200 C 158 214 185 224 212 219 C 222 217 229 209 235 196
             C 218 205 198 208 180 204 C 166 201 152 197 144 200 Z"
          fill="${c.collar}"/>
    <path d="M 96 322 C 82 288 86 232 108 204 C 121 213 130 240 132 268
             C 133 291 128 309 118 322 Z" fill="${c.overlay}"/>
    <path d="M 470 258 C 510 266 546 276 572 290 C 590 300 598 309 596 316
             C 597 322 590 327 578 328 L 472 325 C 463 301 462 279 470 258 Z"
          fill="${c.overlay}"/>
    <path d="M 152 300 L 258 262 C 320 243 382 243 442 262 L 468 273 L 460 298
             C 392 277 322 277 260 295 L 170 322 Z" fill="${c.accent}"/>
    <path d="M 252 172 C 292 180 332 198 368 216 C 400 231 428 242 450 250
             L 443 272 C 396 256 346 234 302 210 C 280 198 262 186 249 180 Z"
          fill="rgba(0,0,0,0.14)"/>
    ${laceCrossings(c, 288, 190, 36, 16, 5)}
    <path d="M 120 210 C 160 200 210 196 250 172 C 300 190 360 220 430 244"
          stroke="rgba(255,255,255,0.10)" stroke-width="6" fill="none" stroke-linecap="round"/>`;
}

function hightopBody(c) {
  return `
    <path d="M 96 322
             C 84 288 88 200 106 150
             C 112 132 130 122 146 129
             C 168 141 196 150 222 148
             C 236 146 246 138 254 128
             C 268 117 284 121 294 132
             C 330 176 396 222 452 248
             C 492 262 532 272 558 284
             C 580 294 594 302 597 312
             C 599 320 592 326 580 328
             L 96 322 Z" fill="${c.upper}"/>
    <path d="M 106 150 C 112 132 130 122 146 129 C 168 141 196 150 222 148
             C 233 146 242 140 250 131 L 258 154 C 240 166 214 172 190 169
             C 158 165 126 158 108 166 Z" fill="${c.collar}"/>
    <path d="M 96 322 C 86 290 88 220 102 172 C 116 182 126 218 129 258
             C 131 285 126 308 117 322 Z" fill="${c.overlay}"/>
    <path d="M 470 258 C 510 266 546 276 572 290 C 590 300 598 309 596 316
             C 597 322 590 327 578 328 L 472 325 C 463 301 462 279 470 258 Z"
          fill="${c.overlay}"/>
    <path d="M 122 206 L 248 180 L 256 208 L 130 236 Z" fill="${c.accent}"/>
    <path d="M 160 306 L 268 272 C 326 254 386 254 444 270 L 466 279 L 458 302
             C 394 283 328 284 268 301 L 176 326 Z" fill="${c.accent}"/>
    ${laceCrossings(c, 300, 150, 26, 17, 7)}
    <circle cx="132" cy="176" r="9" fill="rgba(0,0,0,0.25)"/>
    <circle cx="132" cy="176" r="4" fill="${c.accent}"/>`;
}

function sliponBody(c) {
  return `
    <path d="M 96 322
             C 84 292 88 244 110 218
             C 120 206 138 201 152 206
             C 192 219 242 224 282 219
             C 332 214 384 228 442 250
             C 490 264 534 274 560 286
             C 580 294 594 302 597 312
             C 599 320 592 326 580 328
             L 96 322 Z" fill="${c.upper}"/>
    <path d="M 152 206 C 192 219 242 224 282 219 C 300 217 318 217 336 221
             L 330 240 C 288 234 244 236 204 228 C 180 223 160 216 148 212 Z"
          fill="${c.collar}"/>
    <path d="M 240 222 C 256 208 282 206 298 219 C 293 243 288 259 283 272
             C 268 264 252 250 244 236 Z" fill="${c.overlay}"/>
    <line x1="252" y1="232" x2="288" y2="230" stroke="rgba(0,0,0,0.28)" stroke-width="4" stroke-linecap="round"/>
    <line x1="255" y1="244" x2="287" y2="242" stroke="rgba(0,0,0,0.28)" stroke-width="4" stroke-linecap="round"/>
    <line x1="259" y1="256" x2="285" y2="254" stroke="rgba(0,0,0,0.28)" stroke-width="4" stroke-linecap="round"/>
    <path d="M 96 322 C 84 292 88 244 110 218 C 122 228 130 252 132 276
             C 133 295 128 310 119 322 Z" fill="${c.overlay}"/>
    <path d="M 478 262 C 514 270 548 279 572 291 C 590 300 598 309 596 316
             C 597 322 590 327 578 328 L 478 325 C 470 303 470 282 478 262 Z"
          fill="${c.overlay}"/>
    <path d="M 150 296 L 250 268 C 314 250 380 252 440 268 L 464 277 L 457 299
             C 392 280 324 280 262 297 L 166 320 Z" fill="${c.accent}"/>
    <path d="M 130 226 C 180 238 260 240 330 232" stroke="rgba(255,255,255,0.10)"
          stroke-width="6" fill="none" stroke-linecap="round"/>`;
}

const TEMPLATES = { runner: runnerBody, hightop: hightopBody, slipon: sliponBody };

/**
 * Full standalone SVG for one sneaker in one palette.
 */
export function sneakerSVG(template, palette) {
  const body = (TEMPLATES[template] || runnerBody)(palette);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}">
    <ellipse cx="330" cy="356" rx="252" ry="15" fill="#000" opacity="0.20"/>
    ${body}
    ${soleLayers(palette)}
  </svg>`;
}

export function sneakerDataURL(template, palette) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(sneakerSVG(template, palette))}`;
}

/* ------------------------------------------------------------------ */
/*  3D product card texture (canvas)                                  */
/* ------------------------------------------------------------------ */

const CARD_W = 512;
const CARD_H = 640;

/**
 * Builds a CanvasTexture for a product card shown in the 3D shop.
 * Returns { texture, redraw(paletteIndex) } — redraw regenerates the
 * card when the user picks another colorway in the detail modal.
 */
export function buildCardTexture(product, accent) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  function paint(img, paletteIndex) {
    ctx.clearRect(0, 0, CARD_W, CARD_H);

    // Card background
    const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
    bg.addColorStop(0, '#1d2130');
    bg.addColorStop(1, '#121520');
    ctx.beginPath();
    ctx.roundRect(6, 6, CARD_W - 12, CARD_H - 12, 30);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Accent glow behind the shoe
    const glow = ctx.createRadialGradient(CARD_W / 2, 265, 20, CARD_W / 2, 265, 240);
    glow.addColorStop(0, accent + '2e');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 40, CARD_W, 460);

    // Tag chip
    if (product.tag) {
      ctx.font = '700 22px "Segoe UI", sans-serif';
      const tw = ctx.measureText(product.tag).width;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(34, 34, tw + 30, 40, 20);
      ctx.fill();
      ctx.fillStyle = '#0b0d12';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(product.tag, 49, 56);
    }

    // Sneaker illustration
    if (img) {
      const iw = 460;
      const ih = iw * (VB_H / VB_W);
      ctx.drawImage(img, (CARD_W - iw) / 2, 120, iw, ih);
    }

    // Name / price
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#eef1f7';
    ctx.font = '800 40px "Segoe UI", sans-serif';
    ctx.fillText(product.name, CARD_W / 2, 500, CARD_W - 80);
    ctx.fillStyle = '#8b93a7';
    ctx.font = '600 22px "Segoe UI", sans-serif';
    ctx.fillText(product.categoryName.toUpperCase(), CARD_W / 2, 538);
    ctx.fillStyle = accent;
    ctx.font = '800 36px "Segoe UI", sans-serif';
    ctx.fillText(`$${product.price}`, CARD_W / 2, 588);

    // Colorway dots
    const palettes = product.colorways;
    const dotsW = palettes.length * 26;
    palettes.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(CARD_W / 2 - dotsW / 2 + 13 + i * 26, 96, i === paletteIndex ? 10 : 7, 0, Math.PI * 2);
      ctx.fillStyle = p.upper;
      ctx.fill();
      if (i === paletteIndex) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#eef1f7';
        ctx.stroke();
      }
    });

    texture.needsUpdate = true;
  }

  function redraw(paletteIndex = 0) {
    const img = new Image();
    img.onload = () => paint(img, paletteIndex);
    img.src = sneakerDataURL(product.template, product.colorways[paletteIndex]);
    paint(null, paletteIndex); // immediate paint (text/frame) while SVG decodes
  }

  redraw(0);
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
  ctx.font = '800 118px "Segoe UI", sans-serif';

  // Outer glow passes
  ctx.shadowColor = accent;
  ctx.shadowBlur = 60;
  ctx.fillStyle = accent;
  ctx.fillText(text, 512, 130);
  ctx.shadowBlur = 26;
  ctx.fillText(text, 512, 130);

  // Bright core
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 512, 130);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
