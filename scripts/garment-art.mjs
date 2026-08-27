// Procedural garment illustrations for the clothing stores.
//
// Real catalogue photos exist for sneakers but not for these pieces, and the
// free image-model credits do not stretch to 48 renders. So the apparel is
// drawn: clean flat-lay illustrations on white, one consistent style, any
// colourway, no cost and no licensing question.
//
// Everything is built from two parameterised bases - a TOP and a BOTTOM -
// which is what keeps eighteen garment types from becoming eighteen
// hand-drawn shapes.

const W = 700;
const H = 500;

/* ------------------------------------------------------------------ */
/*  palette helpers                                                    */
/* ------------------------------------------------------------------ */

const NAMED = {
  'off-white': '#f2efe9', ecru: '#eae4d8', chalk: '#f4f2ee', ivory: '#f3efe4',
  cream: '#efe7d8', oat: '#e2d7c3', sand: '#ddcbb0', khaki: '#c2ad83',
  camel: '#c19a6b', 'washed navy': '#3b4a63', navy: '#22304d', 'ink navy': '#1e2a44',
  'pale blue': '#c3d8ea', 'sea blue': '#2f7fb5', 'mid wash': '#5a7fa8',
  'light wash': '#9db6cf', 'mid indigo': '#3f5f88', 'rigid indigo': '#2b3d5c',
  charcoal: '#3a3f47', slate: '#5b6470', 'heather grey': '#b8bcc2',
  'dove grey': '#c6c6c4', pewter: '#8d8f92', black: '#22242a', olive: '#5c6144',
  forest: '#2f4634', 'forest check': '#3b5240', sage: '#a8b79b',
  'butter yellow': '#f0dd9a', champagne: '#e8dcc8', 'rose print': '#e7b7c4',
  'sand stripe': '#ded3bd', stone: '#cfc6b6',
};

const colourOf = (name) => NAMED[String(name || '').toLowerCase().trim()] || '#b9bec6';

/** Darken/lighten a hex colour for seams and shading. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(c + amount)))
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Pale garments need dark seams; dark garments need light ones. */
function seamOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  return lum > 0.6 ? shade(hex, -46) : shade(hex, 40);
}

/* ------------------------------------------------------------------ */
/*  shared pieces                                                      */
/* ------------------------------------------------------------------ */

const stitch = (d, seam, dash = '7 6') =>
  `<path d="${d}" fill="none" stroke="${seam}" stroke-width="2" stroke-dasharray="${dash}" opacity="0.55"/>`;

function patternDefs(id, kind, base, seam) {
  if (kind === 'stripe') {
    return `<pattern id="${id}" width="34" height="34" patternUnits="userSpaceOnUse">
      <rect width="34" height="34" fill="${base}"/>
      <rect width="34" height="16" fill="${shade(base, -70)}" opacity="0.85"/></pattern>`;
  }
  if (kind === 'check') {
    return `<pattern id="${id}" width="46" height="46" patternUnits="userSpaceOnUse">
      <rect width="46" height="46" fill="${base}"/>
      <rect width="46" height="14" fill="${shade(base, -34)}"/>
      <rect width="14" height="46" fill="${shade(base, -34)}" opacity="0.75"/>
      <rect width="14" height="14" fill="${shade(base, -60)}"/></pattern>`;
  }
  if (kind === 'floral') {
    let dots = '';
    for (let i = 0; i < 10; i++) {
      const x = 6 + (i % 4) * 15 + (i % 2 ? 5 : 0);
      const y = 8 + Math.floor(i / 4) * 18;
      dots += `<circle cx="${x}" cy="${y}" r="3.4" fill="${shade(base, -60)}" opacity="0.75"/>` +
              `<circle cx="${x + 4}" cy="${y + 5}" r="1.8" fill="${shade(base, 40)}" opacity="0.8"/>`;
    }
    return `<pattern id="${id}" width="62" height="56" patternUnits="userSpaceOnUse">
      <rect width="62" height="56" fill="${base}"/>${dots}</pattern>`;
  }
  if (kind === 'denim') {
    return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${base}"/>
      <path d="M0 6 L6 0" stroke="${shade(base, 26)}" stroke-width="1.4" opacity="0.5"/></pattern>`;
  }
  if (kind === 'rib' || kind === 'cable') {
    const step = kind === 'cable' ? 22 : 11;
    return `<pattern id="${id}" width="${step}" height="10" patternUnits="userSpaceOnUse">
      <rect width="${step}" height="10" fill="${base}"/>
      <rect width="${step / 2.6}" height="10" fill="${shade(base, -22)}" opacity="0.6"/></pattern>`;
  }
  return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse">
    <rect width="10" height="10" fill="${base}"/></pattern>`;
}

/* ------------------------------------------------------------------ */
/*  TOP - tees, shirts, knits, jackets, coats, dresses                 */
/* ------------------------------------------------------------------ */

/**
 * @param {object} o
 * @param {'none'|'short'|'long'} o.sleeve
 * @param {'crew'|'vneck'|'collar'|'hood'|'strap'|'lapel'} o.neck
 * @param {'none'|'placket'|'zip'|'buttons'} o.open
 * @param {number} o.length   body length in px (220 tee ... 400 coat)
 * @param {number} o.width    shoulder half-width
 */
function top(o, fill, seam, base) {
  const cx = W / 2;
  const topY = o.neck === 'strap' ? 150 : 118;
  const shoulder = o.width;
  const hemY = topY + o.length;
  const hemHalf = shoulder * (o.flare ?? 0.92);

  const parts = [];

  // sleeves first so the body overlaps them
  if (o.sleeve !== 'none') {
    const len = o.sleeve === 'long' ? 190 : 92;
    const drop = o.sleeve === 'long' ? 168 : 74;
    const wrist = o.sleeve === 'long' ? 26 : 40;
    for (const dir of [-1, 1]) {
      const sx = cx + dir * shoulder;
      parts.push(
        `<path d="M ${sx - dir * 12} ${topY + 12}
                  C ${sx + dir * 44} ${topY + 22}, ${sx + dir * (len * 0.42)} ${topY + drop * 0.42}, ${sx + dir * (len * 0.5)} ${topY + drop}
                  L ${sx + dir * (len * 0.5 - wrist * 0.9)} ${topY + drop + wrist}
                  C ${sx + dir * 20} ${topY + drop * 0.55}, ${sx - dir * 10} ${topY + 70}, ${sx - dir * 26} ${topY + 66} Z"
                fill="${fill}" stroke="${seam}" stroke-width="2.2" stroke-linejoin="round"/>`
      );
      // cuff
      parts.push(
        `<path d="M ${sx + dir * (len * 0.5)} ${topY + drop} L ${sx + dir * (len * 0.5 - wrist * 0.9)} ${topY + drop + wrist}"
                stroke="${seam}" stroke-width="3" opacity="0.8"/>`
      );
    }
  }

  // body
  const waist = o.taper ? shoulder * 0.86 : shoulder * 0.97;
  parts.push(
    `<path d="M ${cx - shoulder} ${topY + 14}
              C ${cx - shoulder - 4} ${topY + 90}, ${cx - waist} ${topY + o.length * 0.55}, ${cx - hemHalf} ${hemY}
              L ${cx + hemHalf} ${hemY}
              C ${cx + waist} ${topY + o.length * 0.55}, ${cx + shoulder + 4} ${topY + 90}, ${cx + shoulder} ${topY + 14}
              C ${cx + shoulder * 0.6} ${topY - 4}, ${cx + 44} ${topY - 12}, ${cx} ${topY - 12}
              C ${cx - 44} ${topY - 12}, ${cx - shoulder * 0.6} ${topY - 4}, ${cx - shoulder} ${topY + 14} Z"
            fill="${fill}" stroke="${seam}" stroke-width="2.4" stroke-linejoin="round"/>`
  );

  // neckline
  if (o.neck === 'crew') {
    parts.push(`<path d="M ${cx - 52} ${topY - 6} C ${cx - 34} ${topY + 34}, ${cx + 34} ${topY + 34}, ${cx + 52} ${topY - 6}"
      fill="none" stroke="${seam}" stroke-width="9" stroke-linecap="round"/>`);
  } else if (o.neck === 'vneck') {
    parts.push(`<path d="M ${cx - 46} ${topY - 6} L ${cx} ${topY + 52} L ${cx + 46} ${topY - 6}"
      fill="none" stroke="${seam}" stroke-width="8" stroke-linejoin="round"/>`);
  } else if (o.neck === 'strap') {
    parts.push(`<path d="M ${cx - 54} ${topY + 6} C ${cx - 26} ${topY + 30}, ${cx + 26} ${topY + 30}, ${cx + 54} ${topY + 6}"
      fill="none" stroke="${seam}" stroke-width="4"/>`);
    for (const dir of [-1, 1]) {
      parts.push(`<path d="M ${cx + dir * 46} ${topY + 8} C ${cx + dir * 40} ${topY - 46}, ${cx + dir * 22} ${topY - 62}, ${cx + dir * 16} ${topY - 64}"
        fill="none" stroke="${fill}" stroke-width="9" stroke-linecap="round"/>`);
    }
  } else if (o.neck === 'collar') {
    parts.push(
      `<path d="M ${cx - 54} ${topY - 4} L ${cx - 8} ${topY + 8} L ${cx - 30} ${topY + 54} L ${cx - 66} ${topY + 14} Z"
        fill="${shade(base, -14)}" stroke="${seam}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M ${cx + 54} ${topY - 4} L ${cx + 8} ${topY + 8} L ${cx + 30} ${topY + 54} L ${cx + 66} ${topY + 14} Z"
        fill="${shade(base, -14)}" stroke="${seam}" stroke-width="2.2" stroke-linejoin="round"/>`
    );
  } else if (o.neck === 'lapel') {
    parts.push(
      `<path d="M ${cx - 46} ${topY - 6} L ${cx - 6} ${topY + 30} L ${cx - 26} ${topY + 150} L ${cx - 78} ${topY + 40} Z"
        fill="${shade(base, -18)}" stroke="${seam}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M ${cx + 46} ${topY - 6} L ${cx + 6} ${topY + 30} L ${cx + 26} ${topY + 150} L ${cx + 78} ${topY + 40} Z"
        fill="${shade(base, -18)}" stroke="${seam}" stroke-width="2.2" stroke-linejoin="round"/>`
    );
  } else if (o.neck === 'hood') {
    parts.push(
      `<path d="M ${cx - 78} ${topY + 26}
                C ${cx - 86} ${topY - 62}, ${cx + 86} ${topY - 62}, ${cx + 78} ${topY + 26}
                C ${cx + 40} ${topY + 54}, ${cx - 40} ${topY + 54}, ${cx - 78} ${topY + 26} Z"
              fill="${shade(base, -16)}" stroke="${seam}" stroke-width="2.4"/>` +
      `<path d="M ${cx - 44} ${topY + 34} C ${cx - 20} ${topY + 50}, ${cx + 20} ${topY + 50}, ${cx + 44} ${topY + 34}"
              fill="none" stroke="${seam}" stroke-width="3"/>` +
      // drawcords
      `<path d="M ${cx - 16} ${topY + 44} L ${cx - 22} ${topY + 104}" stroke="${seamOf(base)}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M ${cx + 16} ${topY + 44} L ${cx + 22} ${topY + 104}" stroke="${seamOf(base)}" stroke-width="4" stroke-linecap="round"/>`
    );
  }

  // opening
  if (o.open === 'zip') {
    parts.push(
      `<line x1="${cx}" y1="${topY + 30}" x2="${cx}" y2="${hemY - 6}" stroke="${seam}" stroke-width="5"/>` +
      stitch(`M ${cx} ${topY + 30} L ${cx} ${hemY - 6}`, seam, '5 5') +
      `<rect x="${cx - 6}" y="${topY + 40}" width="12" height="18" rx="3" fill="${seam}"/>`
    );
  } else if (o.open === 'placket' || o.open === 'buttons') {
    const from = o.open === 'placket' ? topY + 40 : topY + 20;
    const to = o.open === 'placket' ? topY + 150 : hemY - 14;
    parts.push(`<rect x="${cx - 17}" y="${from}" width="34" height="${to - from}" fill="${shade(base, -10)}" stroke="${seam}" stroke-width="2"/>`);
    const n = Math.max(2, Math.round((to - from) / 52));
    for (let i = 0; i < n; i++) {
      parts.push(`<circle cx="${cx}" cy="${from + 26 + i * ((to - from - 34) / Math.max(1, n - 1))}" r="6.5"
        fill="${shade(base, 60)}" stroke="${seam}" stroke-width="1.6"/>`);
    }
  }

  // pockets & extras
  if (o.pockets === 'chest') {
    parts.push(`<rect x="${cx + 34}" y="${topY + 78}" width="62" height="70" rx="4" fill="none" stroke="${seam}" stroke-width="2.4"/>`);
  }
  if (o.pockets === 'patch') {
    for (const dir of [-1, 1]) {
      parts.push(`<rect x="${cx + dir * 96 - (dir > 0 ? 0 : 74)}" y="${hemY - 130}" width="74" height="86" rx="5"
        fill="none" stroke="${seam}" stroke-width="2.4"/>`);
    }
  }
  if (o.pockets === 'kangaroo') {
    parts.push(`<path d="M ${cx - 96} ${hemY - 118} L ${cx + 96} ${hemY - 118} L ${cx + 78} ${hemY - 34} L ${cx - 78} ${hemY - 34} Z"
      fill="none" stroke="${seam}" stroke-width="2.6"/>`);
  }
  if (o.quilt) {
    for (let y = topY + 46; y < hemY - 16; y += 40) {
      parts.push(`<path d="M ${cx - shoulder + 8} ${y} L ${cx + shoulder - 8} ${y}" stroke="${seam}" stroke-width="2" opacity="0.6"/>`);
    }
  }
  if (o.cableKnit) {
    for (const x of [-58, 0, 58]) {
      parts.push(`<path d="M ${cx + x} ${topY + 60} C ${cx + x + 16} ${topY + 100}, ${cx + x - 16} ${topY + 140}, ${cx + x} ${topY + 180}
        C ${cx + x + 16} ${topY + 220}, ${cx + x - 16} ${topY + 250}, ${cx + x} ${hemY - 20}"
        fill="none" stroke="${seam}" stroke-width="3" opacity="0.7"/>`);
    }
  }

  // hem
  parts.push(stitch(`M ${cx - hemHalf + 6} ${hemY - 9} L ${cx + hemHalf - 6} ${hemY - 9}`, seam));
  return parts.join('');
}

/* ------------------------------------------------------------------ */
/*  BOTTOM - trousers, shorts, skirts                                  */
/* ------------------------------------------------------------------ */

function bottom(o, fill, seam, base) {
  const cx = W / 2;
  const topY = 112;
  const waist = o.waist ?? 92;
  const hemY = topY + o.length;
  const parts = [];

  if (o.kind === 'skirt') {
    const hemHalf = waist * (o.flare ?? 1.6);
    parts.push(
      `<path d="M ${cx - waist} ${topY}
                C ${cx - waist - 10} ${topY + o.length * 0.5}, ${cx - hemHalf} ${hemY - 40}, ${cx - hemHalf} ${hemY}
                L ${cx + hemHalf} ${hemY}
                C ${cx + hemHalf} ${hemY - 40}, ${cx + waist + 10} ${topY + o.length * 0.5}, ${cx + waist} ${topY} Z"
              fill="${fill}" stroke="${seam}" stroke-width="2.4" stroke-linejoin="round"/>`
    );
    if (o.pleats) {
      for (let i = 1; i < 9; i++) {
        const t = i / 9;
        const xTop = cx - waist + t * waist * 2;
        const xHem = cx - hemHalf + t * hemHalf * 2;
        parts.push(`<line x1="${xTop}" y1="${topY + 26}" x2="${xHem}" y2="${hemY - 6}" stroke="${seam}" stroke-width="2" opacity="0.65"/>`);
      }
    }
  } else {
    const legTop = topY + 96;
    const inseamX = 16;
    const hemHalf = o.wide ? 76 : o.kind === 'shorts' ? 66 : 44;

    // Seat panel first. Without it the two legs leave a white notch at the
    // crotch, which reads as a hole rather than a pair of trousers.
    parts.push(
      `<path d="M ${cx - waist} ${topY}
                L ${cx + waist} ${topY}
                C ${cx + waist} ${legTop - 20}, ${cx + 34} ${legTop - 4}, ${cx} ${legTop + 16}
                C ${cx - 34} ${legTop - 4}, ${cx - waist} ${legTop - 20}, ${cx - waist} ${topY} Z"
              fill="${fill}" stroke="${seam}" stroke-width="2.4" stroke-linejoin="round"/>`
    );

    for (const dir of [-1, 1]) {
      parts.push(
        `<path d="M ${cx + dir * waist} ${topY}
                  C ${cx + dir * (waist + 4)} ${legTop}, ${cx + dir * (hemHalf + 34)} ${hemY - 90}, ${cx + dir * (hemHalf + 20)} ${hemY}
                  L ${cx + dir * inseamX} ${hemY}
                  C ${cx + dir * (inseamX + 6)} ${hemY - 120}, ${cx + dir * 10} ${legTop + 20}, ${cx} ${legTop - 6} Z"
                fill="${fill}" stroke="${seam}" stroke-width="2.4" stroke-linejoin="round"/>`
      );
      parts.push(stitch(`M ${cx + dir * (hemHalf + 20) - dir * 4} ${hemY - 12} L ${cx + dir * inseamX + dir * 4} ${hemY - 12}`, seam));
    }
    // waistband
    parts.push(
      `<rect x="${cx - waist}" y="${topY - 26}" width="${waist * 2}" height="30" rx="5"
        fill="${shade(base, -12)}" stroke="${seam}" stroke-width="2.2"/>`
    );
    if (o.drawcord) {
      parts.push(`<path d="M ${cx - 30} ${topY - 6} C ${cx - 10} ${topY + 14}, ${cx + 10} ${topY + 14}, ${cx + 30} ${topY - 6}"
        fill="none" stroke="${seamOf(base)}" stroke-width="4" stroke-linecap="round"/>`);
    } else {
      parts.push(`<circle cx="${cx}" cy="${topY - 11}" r="5.5" fill="${shade(base, 60)}" stroke="${seam}" stroke-width="1.5"/>`);
      parts.push(`<line x1="${cx}" y1="${topY + 4}" x2="${cx}" y2="${topY + 40}" stroke="${seam}" stroke-width="2.5"/>`);
    }
    if (o.pockets) {
      for (const dir of [-1, 1]) {
        parts.push(`<path d="M ${cx + dir * (waist - 8)} ${topY + 6} C ${cx + dir * (waist - 18)} ${topY + 42}, ${cx + dir * 52} ${topY + 52}, ${cx + dir * 46} ${topY + 54}"
          fill="none" stroke="${seam}" stroke-width="2.4"/>`);
      }
    }
    if (o.cargo) {
      // Keep the pockets inside the leg silhouette - at this height the leg
      // edge sits around cx +/- 80, so anything wider floats in mid-air.
      for (const dir of [-1, 1]) {
        parts.push(`<rect x="${dir > 0 ? cx + 30 : cx - 76}" y="${topY + 150}" width="46" height="74" rx="5"
          fill="none" stroke="${seam}" stroke-width="2.4"/>`);
      }
    }
    if (o.pleats) {
      for (const dir of [-1, 1]) {
        parts.push(`<line x1="${cx + dir * 40}" y1="${topY + 10}" x2="${cx + dir * (hemHalf + 6)}" y2="${hemY - 18}"
          stroke="${seam}" stroke-width="2" opacity="0.55"/>`);
      }
    }
  }
  return parts.join('');
}

/* ------------------------------------------------------------------ */
/*  templates                                                          */
/* ------------------------------------------------------------------ */

const T = {
  tee:        { fn: top, o: { sleeve: 'short', neck: 'crew', open: 'none', length: 232, width: 150 } },
  teePocket:  { fn: top, o: { sleeve: 'short', neck: 'crew', open: 'none', length: 232, width: 150, pockets: 'chest' } },
  longSleeve: { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'none', length: 232, width: 138, taper: true } },
  camisole:   { fn: top, o: { sleeve: 'none', neck: 'strap', open: 'none', length: 210, width: 118, taper: true } },
  cropTee:    { fn: top, o: { sleeve: 'short', neck: 'crew', open: 'none', length: 168, width: 138 } },
  shirt:      { fn: top, o: { sleeve: 'long', neck: 'collar', open: 'buttons', length: 268, width: 152, pockets: 'chest' } },
  shirtShort: { fn: top, o: { sleeve: 'short', neck: 'collar', open: 'buttons', length: 250, width: 152, pockets: 'chest' } },
  blouse:     { fn: top, o: { sleeve: 'long', neck: 'collar', open: 'buttons', length: 246, width: 156 } },
  overshirt:  { fn: top, o: { sleeve: 'long', neck: 'collar', open: 'buttons', length: 290, width: 162, pockets: 'patch' } },
  hoodie:     { fn: top, o: { sleeve: 'long', neck: 'hood', open: 'none', length: 262, width: 162, pockets: 'kangaroo' } },
  hoodieZip:  { fn: top, o: { sleeve: 'long', neck: 'hood', open: 'zip', length: 262, width: 162, pockets: 'patch' } },
  crewneck:   { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'none', length: 250, width: 158 } },
  quarterZip: { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'placket', length: 250, width: 150 } },
  cardigan:   { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'buttons', length: 282, width: 170, pockets: 'patch' } },
  poloKnit:   { fn: top, o: { sleeve: 'short', neck: 'collar', open: 'placket', length: 236, width: 146 } },
  vest:       { fn: top, o: { sleeve: 'none', neck: 'vneck', open: 'none', length: 244, width: 140, cableKnit: true } },
  jacket:     { fn: top, o: { sleeve: 'long', neck: 'collar', open: 'buttons', length: 276, width: 166, pockets: 'patch' } },
  bomber:     { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'zip', length: 250, width: 162 } },
  puffer:     { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'zip', length: 268, width: 178, quilt: true } },
  blazer:     { fn: top, o: { sleeve: 'long', neck: 'lapel', open: 'none', length: 262, width: 158, taper: true, pockets: 'patch' } },
  coat:       { fn: top, o: { sleeve: 'long', neck: 'lapel', open: 'none', length: 356, width: 168, pockets: 'patch' } },
  biker:      { fn: top, o: { sleeve: 'long', neck: 'lapel', open: 'zip', length: 244, width: 160, taper: true } },
  dress:      { fn: top, o: { sleeve: 'none', neck: 'strap', open: 'none', length: 356, width: 122, flare: 1.5 } },
  dressShirt: { fn: top, o: { sleeve: 'long', neck: 'collar', open: 'buttons', length: 350, width: 146, flare: 1.4 } },
  dressKnit:  { fn: top, o: { sleeve: 'long', neck: 'crew', open: 'none', length: 352, width: 134, flare: 1.25 } },
  dressTea:   { fn: top, o: { sleeve: 'short', neck: 'vneck', open: 'buttons', length: 348, width: 140, flare: 1.6 } },
  trousers:   { fn: bottom, o: { kind: 'trousers', length: 316, waist: 92, pockets: true } },
  trousersWide: { fn: bottom, o: { kind: 'trousers', length: 322, waist: 96, wide: true, pleats: true, pockets: true } },
  jeans:      { fn: bottom, o: { kind: 'trousers', length: 316, waist: 92, pockets: true } },
  cargo:      { fn: bottom, o: { kind: 'trousers', length: 316, waist: 96, cargo: true, pockets: true } },
  joggers:    { fn: bottom, o: { kind: 'trousers', length: 312, waist: 92, drawcord: true, pockets: true } },
  shorts:     { fn: bottom, o: { kind: 'shorts', length: 176, waist: 92, pockets: true } },
  shortsDraw: { fn: bottom, o: { kind: 'shorts', length: 170, waist: 92, drawcord: true, pockets: true } },
  skirt:      { fn: bottom, o: { kind: 'skirt', length: 268, waist: 84 } },
  skirtPleat: { fn: bottom, o: { kind: 'skirt', length: 268, waist: 84, pleats: true } },
  skirtMini:  { fn: bottom, o: { kind: 'skirt', length: 168, waist: 84, flare: 1.35 } },
  skirtPencil:{ fn: bottom, o: { kind: 'skirt', length: 262, waist: 84, flare: 1.06 } },
};

/**
 * Pick a template from the product NAME only.
 *
 * Matching the description too is tempting but wrong: "Oxford Button-Down"
 * and "straight the whole way down" both contain "down", which is how an
 * oxford shirt and a pair of jeans became puffer jackets. The name is the
 * reliable signal, and order matters - the most specific rule wins first.
 */
export function templateFor(p) {
  const n = String(p.name || '').toLowerCase();
  const rules = [
    // garments whose name contains a word another rule would grab
    [/tea dress/, 'dressTea'],
    [/shirt dress/, 'dressShirt'],
    [/knit midi dress|knit midi/, 'dressKnit'],
    [/slip dress|dress/, 'dress'],
    [/pocket tee/, 'teePocket'],
    [/cropped knit tee|cropped.*tee/, 'cropTee'],
    [/long sleeve/, 'longSleeve'],
    [/tee|t-shirt/, 'tee'],

    // outerwear
    [/overcoat/, 'coat'],
    [/blazer/, 'blazer'],
    [/biker/, 'biker'],
    [/puffer/, 'puffer'],
    [/bomber/, 'bomber'],
    [/chore|trucker|quilted|jacket/, 'jacket'],

    // knits and sweats
    [/cardigan/, 'cardigan'],
    [/vest/, 'vest'],
    [/polo/, 'poloKnit'],
    [/quarter-zip|quarter zip/, 'quarterZip'],
    [/zip-through|zip through|full zip/, 'hoodieZip'],
    [/hoodie/, 'hoodie'],
    [/crewneck|cashmere crew|crew/, 'crewneck'],

    // shirts
    [/overshirt|flannel/, 'overshirt'],
    [/blouse/, 'blouse'],
    [/camp collar/, 'shirtShort'],
    [/western|button-down|oxford|shirt/, 'shirt'],
    [/camisole/, 'camisole'],

    // skirts before trousers, so "Denim Mini" is not read as denim trousers
    [/pencil/, 'skirtPencil'],
    [/pleated midi/, 'skirtPleat'],
    [/mini/, 'skirtMini'],
    [/skirt/, 'skirt'],

    // bottoms
    [/swim short|sweat short/, 'shortsDraw'],
    [/short/, 'shorts'],
    [/cargo/, 'cargo'],
    [/jean/, 'jeans'],
    [/wide leg|pleated wide/, 'trousersWide'],
    [/drawstring/, 'joggers'],
    [/trouser|pant/, 'trousers'],
  ];

  for (const [re, tpl] of rules) if (re.test(n)) return tpl;
  return 'tee';
}

/** Which surface pattern the fabric should use. */
function patternKind(p) {
  const n = `${p.name} ${p.colorway} ${p.material}`.toLowerCase();
  if (/stripe/.test(n)) return 'stripe';
  if (/check|flannel/.test(n)) return 'check';
  if (/floral|rose print/.test(n)) return 'floral';
  if (/denim|jean/.test(n)) return 'denim';
  if (/cable/.test(n)) return 'cable';
  if (/rib/.test(n)) return 'rib';
  return 'plain';
}

/** Full SVG for one garment. */
export function garmentSVG(product) {
  const tpl = T[templateFor(product)] ?? T.tee;
  const base = colourOf(product.colorway);
  const seam = seamOf(base);
  const kind = patternKind(product);
  const fill = kind === 'plain' ? base : `url(#fab)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    ${patternDefs('fab', kind, base, seam)}
    <radialGradient id="sh" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <ellipse cx="${W / 2}" cy="${H - 42}" rx="210" ry="26" fill="url(#sh)"/>
  ${tpl.fn(tpl.o, fill, seam, base)}
</svg>`;
}
