// Product catalog — 14 sneakers across 4 category zones.
// palette keys: upper, overlay, sole, midsole, accent, lace, collar

export const CATEGORIES = [
  { id: 'running',    name: 'Running',       accent: '#00e5ff', wall: 'west' },
  { id: 'basketball', name: 'Basketball',    accent: '#ff9f1c', wall: 'north' },
  { id: 'lifestyle',  name: 'Lifestyle',     accent: '#b980ff', wall: 'east' },
  { id: 'limited',    name: 'Limited Drops', accent: '#ff2d75', wall: 'center' },
];

const SIZES = [40, 41, 42, 43, 44, 45];

export const PRODUCTS = [
  /* ---------------- Running ---------------- */
  {
    id: 'velocity-flux', category: 'running', template: 'runner',
    name: 'Velocity Flux', price: 129, tag: 'NEW',
    desc: 'Featherlight tempo trainer with a rebound foam midsole and a breathable knit upper. Built for the runner who negotiates with red lights.',
    colorways: [
      { upper: '#1d2b3f', overlay: '#101b2b', sole: '#0c1018', midsole: '#f2f5f9', accent: '#00e5ff', lace: '#e8edf4', collar: '#0d1521' },
      { upper: '#e9edf2', overlay: '#c9d2dd', sole: '#20242e', midsole: '#ffffff', accent: '#ff5470', lace: '#2a2f3a', collar: '#b8c2cf' },
      { upper: '#233524', overlay: '#16241a', sole: '#101510', midsole: '#e6e9dd', accent: '#a4f04e', lace: '#dfe6d5', collar: '#111c14' },
    ],
    sizes: SIZES,
  },
  {
    id: 'aeroglide-2', category: 'running', template: 'runner',
    name: 'AeroGlide 2', price: 139,
    desc: 'Second generation of the crowd favorite. Softer landing, snappier toe-off, and a heel clip that hugs like it means it.',
    colorways: [
      { upper: '#f2f5f9', overlay: '#d8dee7', sole: '#1a1e28', midsole: '#ff8c42', accent: '#1d2b3f', lace: '#2a2f3a', collar: '#c6ceda' },
      { upper: '#12263a', overlay: '#0a1826', sole: '#0a0d14', midsole: '#f2f5f9', accent: '#ff8c42', lace: '#e8edf4', collar: '#081220' },
    ],
    sizes: SIZES,
  },
  {
    id: 'pulse-runner', category: 'running', template: 'runner',
    name: 'Pulse Runner', price: 119,
    desc: 'Daily-miles workhorse. Grippy outsole, plush collar, zero drama. The pair you reach for without thinking.',
    colorways: [
      { upper: '#0f5c46', overlay: '#0a4032', sole: '#0c1210', midsole: '#eef3ef', accent: '#ffd166', lace: '#e6efe9', collar: '#083328' },
      { upper: '#20242e', overlay: '#14171f', sole: '#0b0d12', midsole: '#3ddc97', accent: '#3ddc97', lace: '#cfd6e0', collar: '#101218' },
    ],
    sizes: SIZES,
  },
  {
    id: 'cloudstep', category: 'running', template: 'runner',
    name: 'Cloudstep', price: 149, tag: 'BEST SELLER',
    desc: 'Marshmallow stack height with a surprisingly stable ride. Long-run legs, saved. Clouds, but with traction.',
    colorways: [
      { upper: '#f6f2ec', overlay: '#e3dbd0', sole: '#d8dee7', midsole: '#ffffff', accent: '#8fd3f4', lace: '#cbc2b4', collar: '#d9d0c3' },
      { upper: '#e9d8f2', overlay: '#d3bce3', sole: '#2a2438', midsole: '#ffffff', accent: '#b980ff', lace: '#c9b3da', collar: '#c9aede' },
    ],
    sizes: SIZES,
  },

  /* ---------------- Basketball ---------------- */
  {
    id: 'skyhook-pro', category: 'basketball', template: 'hightop',
    name: 'Skyhook Pro', price: 159, tag: 'NEW',
    desc: 'Lockdown high-top with a torsion plate and herringbone grip. For players who live above the rim — or plan to.',
    colorways: [
      { upper: '#b3122e', overlay: '#7e0c20', sole: '#14090c', midsole: '#f2f5f9', accent: '#f2f5f9', lace: '#f2f5f9', collar: '#5f0918' },
      { upper: '#15181f', overlay: '#0b0d12', sole: '#0b0d12', midsole: '#b3122e', accent: '#b3122e', lace: '#d9dde3', collar: '#08090d' },
    ],
    sizes: SIZES,
  },
  {
    id: 'rim-reaper', category: 'basketball', template: 'hightop',
    name: 'Rim Reaper', price: 169,
    desc: 'Aggressive court cut with reinforced ankle wings. Comes with intimidation pre-installed.',
    colorways: [
      { upper: '#3b2a68', overlay: '#281c49', sole: '#141021', midsole: '#f4c95d', accent: '#f4c95d', lace: '#e8e2f4', collar: '#1e1536' },
      { upper: '#101218', overlay: '#090a0f', sole: '#090a0f', midsole: '#7f5af0', accent: '#7f5af0', lace: '#cfd6e0', collar: '#06070b' },
    ],
    sizes: SIZES,
  },
  {
    id: 'fast-break', category: 'basketball', template: 'hightop',
    name: 'Fast Break', price: 139,
    desc: 'Guard-ready and lighter than it looks. First step so quick the defense files a complaint.',
    colorways: [
      { upper: '#1857b8', overlay: '#0f3d85', sole: '#0d1424', midsole: '#f2f5f9', accent: '#ffffff', lace: '#e8edf4', collar: '#0b2f68' },
      { upper: '#f2f5f9', overlay: '#d8dee7', sole: '#1a1e28', midsole: '#1857b8', accent: '#1857b8', lace: '#2a2f3a', collar: '#c6ceda' },
    ],
    sizes: SIZES,
  },

  /* ---------------- Lifestyle ---------------- */
  {
    id: 'metro-slip', category: 'lifestyle', template: 'slipon',
    name: 'Metro Slip', price: 89,
    desc: 'Slip in, head out. Elastic gore panel, cushioned footbed, and a silhouette that goes with literally everything.',
    colorways: [
      { upper: '#cbb794', overlay: '#ab9878', sole: '#3a352c', midsole: '#efe9dc', accent: '#5c6b4e', lace: '#cbb794', collar: '#8f7f63' },
      { upper: '#3c4048', overlay: '#2a2d34', sole: '#17191e', midsole: '#e6e8ec', accent: '#d7a04c', lace: '#3c4048', collar: '#1f2228' },
    ],
    sizes: SIZES,
  },
  {
    id: 'court-classic', category: 'lifestyle', template: 'runner',
    name: 'Court Classic', price: 99, tag: 'ICON',
    desc: 'The clean white staple, reissued. Buttery leather look, gum details, timeless attitude since forever.',
    colorways: [
      { upper: '#f5f6f8', overlay: '#e2e5ea', sole: '#c9a96b', midsole: '#ffffff', accent: '#1c6e46', lace: '#eceef2', collar: '#d5d9e0' },
      { upper: '#f5f6f8', overlay: '#e2e5ea', sole: '#20242e', midsole: '#ffffff', accent: '#b3122e', lace: '#eceef2', collar: '#d5d9e0' },
    ],
    sizes: SIZES,
  },
  {
    id: 'daily-drift', category: 'lifestyle', template: 'slipon',
    name: 'Daily Drift', price: 95,
    desc: 'Soft canvas, softer sole. Made for coffee runs, corner stores, and doing absolutely nothing in style.',
    colorways: [
      { upper: '#9aa2ae', overlay: '#7d8592', sole: '#2c2f36', midsole: '#f0f1f4', accent: '#ff7b6b', lace: '#9aa2ae', collar: '#6a7280' },
      { upper: '#e8b4b8', overlay: '#d29a9f', sole: '#3a2e30', midsole: '#f7f0f0', accent: '#8c3f45', lace: '#e8b4b8', collar: '#c08a90' },
    ],
    sizes: SIZES,
  },
  {
    id: 'canvas-coast', category: 'lifestyle', template: 'runner',
    name: 'Canvas Coast', price: 85,
    desc: 'Beach-town energy in sneaker form. Salt-washed canvas and a rope-texture midsole detail.',
    colorways: [
      { upper: '#1f3a5f', overlay: '#142845', sole: '#c9bfa4', midsole: '#efe9d8', accent: '#efe9d8', lace: '#e6dfc9', collar: '#0f1e35' },
      { upper: '#e8e2d2', overlay: '#d1c9b3', sole: '#2c3a4a', midsole: '#f6f2e8', accent: '#3c7a89', lace: '#c6bda5', collar: '#bdb298' },
    ],
    sizes: SIZES,
  },

  /* ---------------- Limited Drops ---------------- */
  {
    id: 'neon-genesis', category: 'limited', template: 'hightop',
    name: 'Neon Genesis', price: 249, tag: 'LIMITED',
    desc: 'Blackout base, reactor-green hits. 500 pairs worldwide. Glows harder than your monitor at 3am.',
    colorways: [
      { upper: '#0d0f14', overlay: '#060709', sole: '#060709', midsole: '#39ff88', accent: '#39ff88', lace: '#39ff88', collar: '#03040a' },
      { upper: '#0d0f14', overlay: '#060709', sole: '#060709', midsole: '#00e5ff', accent: '#00e5ff', lace: '#00e5ff', collar: '#03040a' },
    ],
    sizes: SIZES,
  },
  {
    id: 'gold-standard', category: 'limited', template: 'runner',
    name: 'Gold Standard', price: 299, tag: 'LIMITED',
    desc: 'Obsidian upper, 24-karat accents, numbered tongue tag. The flex is the point.',
    colorways: [
      { upper: '#15130e', overlay: '#0b0a07', sole: '#0b0a07', midsole: '#d4af37', accent: '#d4af37', lace: '#cdb662', collar: '#080705' },
    ],
    sizes: SIZES,
  },
  {
    id: 'aurora-one', category: 'limited', template: 'slipon',
    name: 'Aurora One', price: 279, tag: 'LIMITED',
    desc: 'Color-shift coating sampled from a sky that only happens twice a year. Each pair is slightly different.',
    colorways: [
      { upper: '#7ae0d8', overlay: '#58b8c9', sole: '#1c2333', midsole: '#f2eefc', accent: '#c77dff', lace: '#7ae0d8', collar: '#3f93ab' },
      { upper: '#c77dff', overlay: '#a75ee0', sole: '#241c33', midsole: '#f2eefc', accent: '#7ae0d8', lace: '#c77dff', collar: '#8b48c4' },
    ],
    sizes: SIZES,
  },
];

// Attach category metadata to each product for convenience.
const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
for (const p of PRODUCTS) {
  p.categoryName = catById[p.category].name;
  p.accent = catById[p.category].accent;
}

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

export function productsInCategory(catId) {
  return PRODUCTS.filter((p) => p.category === catId);
}
