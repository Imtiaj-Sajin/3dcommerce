// Product catalog — real product photography (downloaded into
// public/products/, white-background shots) organized by brand zones.
// Brand names/photos are used for demo purposes only.

export const CATEGORIES = [
  { id: 'nike',       name: 'Nike',        accent: '#ff6a2b' },
  { id: 'jordan',     name: 'Jordan',      accent: '#e63946' },
  { id: 'adidas',     name: 'adidas',      accent: '#4895ef' },
  { id: 'newbalance', name: 'New Balance', accent: '#2ec4b6' },
  { id: 'asics',      name: 'ASICS',       accent: '#9b5de5' },
  { id: 'converse',   name: 'Converse',    accent: '#ffd166' },
  { id: 'sale',       name: 'Sale',        accent: '#ff2d55' },
];

const SIZES = [40, 41, 42, 43, 44, 45];

function P(id, category, name, price, img, desc, extra = {}) {
  return { id, category, name, price, img: `products/${img}.jpg`, desc, sizes: SIZES, ...extra };
}

export const PRODUCTS = [
  /* ---------------- Nike ---------------- */
  P('dunk-panda', 'nike', 'Dunk Low "Panda"', 115, 'nike-dunk-panda',
    'The black-and-white staple that refuses to stay in stock. Goes with everything you own.'),
  P('af1-white', 'nike', 'Air Force 1 \'07', 110, 'nike-af1-a',
    'Triple white. The most worn sneaker on planet Earth, and still undefeated.'),
  P('dunk-grey-fog', 'nike', 'Dunk Low "Grey Fog"', 110, 'nike-dunk-fog',
    'Soft grey overlays on crisp white leather. The Panda\'s calmer sibling.'),
  P('kobe-6-grinch', 'nike', 'Kobe 6 "Reverse Grinch"', 190, 'nike-kobe6',
    'Christmas-day energy all year. Sharp, fast, and impossible to miss on court.', { tag: 'HEAT' }),

  /* ---------------- Jordan ---------------- */
  P('aj3-white-cement', 'jordan', 'Air Jordan 3 "White Cement"', 200, 'aj3-cement',
    'Elephant print, visible Air, and history in every step. The \'88 icon reimagined.'),
  P('aj4-military', 'jordan', 'Air Jordan 4 "Military Black"', 215, 'aj4-military',
    'Clean white base, black hits, endless outfit rotation. A modern-day essential.', { tag: 'ICON' }),
  P('aj11-cool-grey', 'jordan', 'Air Jordan 11 "Cool Grey"', 225, 'aj11-cool-grey',
    'Patent leather shine in signature Cool Grey. Dress code approved, court certified.'),

  /* ---------------- adidas ---------------- */
  P('samba-og', 'adidas', 'Samba OG', 100, 'samba-og',
    'Terrace classic turned global fashion staple. White leather, gum sole, done.', { tag: 'TRENDING' }),
  P('campus-00s', 'adidas', 'Campus 00s', 110, 'campus-00s',
    'Chunky Y2K proportions with premium suede. The skate-shop look, revived.'),
  P('superstar', 'adidas', 'Superstar', 95, 'superstar',
    'Shell toe. Three stripes. Fifty years of street cred in one silhouette.'),
  P('yeezy-350-zebra', 'adidas', 'Yeezy Boost 350 V2 "Zebra"', 230, 'yeezy-350-zebra',
    'The unmistakable stripe pattern on Primeknit, riding full-length Boost.'),

  /* ---------------- New Balance ---------------- */
  P('nb-550', 'newbalance', '550 "White Grey"', 130, 'nb-550',
    'The \'89 basketball shape that took over the streets. Perfectly aged proportions.'),
  P('nb-2002r-rain', 'newbalance', '2002R "Rain Cloud"', 150, 'nb-2002r-rain',
    'Protection Pack construction with soft layered greys. Comfort with edge.', { tag: 'NEW' }),
  P('nb-9060', 'newbalance', '9060 "Sea Salt"', 160, 'nb-9060-sea-salt',
    'Warped lines and creamy tones — a futurist remix of the classic 99X series.'),

  /* ---------------- ASICS ---------------- */
  P('gel-kayano-14', 'asics', 'GEL-Kayano 14', 150, 'asics-k14-silver',
    'Y2K running tech turned runway favorite. White and pure silver mesh magic.', { tag: 'NEW' }),
  P('gel-1130', 'asics', 'GEL-1130 "Clay Canyon"', 120, 'asics-1130',
    'Retro runner DNA with modern comfort. The quiet flex of people who know.'),
  P('gel-nyc-arctic', 'asics', 'GEL-NYC "Arctic Sky"', 130, 'asics-nyc-arctic',
    'Layered cream and icy blue inspired by early-2000s city marathons.'),
  P('gel-nyc-graphite', 'asics', 'GEL-NYC "Graphite"', 130, 'asics-nyc-graphite',
    'Tonal grey stack with reflective hits. Urban camouflage, elevated.'),

  /* ---------------- Converse ---------------- */
  P('chuck-hi', 'converse', 'Chuck Taylor All Star Hi', 65, 'chuck-classic-hi',
    'The canvas high-top that started it all. Every generation makes it theirs.'),
  P('chuck-70-ox', 'converse', 'Chuck 70 Ox "Parchment"', 85, 'chuck-70-ox',
    'Vintage-spec construction, warmer canvas, higher foxing. The connoisseur\'s Chuck.'),
  P('run-star-hike', 'converse', 'Run Star Hike', 110, 'run-star-hike',
    'The Chuck on a platform lugged sole. Height, attitude, and grip included.'),

  /* ---------------- Sale (center island) ---------------- */
  P('yeezy-foam-rnnr', 'sale', 'Yeezy Foam Runner "Onyx"', 90, 'yeezy-foam-rnnr',
    'Sculptural one-piece foam. Feels like walking on the moon, priced like Earth.',
    { salePrice: 59, tag: 'SALE' }),
  P('nb-530', 'sale', 'New Balance 530', 100, 'nb-530',
    'Silvery retro runner with everyday comfort. Last sizes going fast.',
    { salePrice: 69, tag: 'SALE' }),
  P('gel-1130-black', 'sale', 'ASICS GEL-1130 "Black"', 120, 'asics-1130-black',
    'The stealth colorway of the fan favorite. Discounted, not discontinued.',
    { salePrice: 79, tag: 'SALE' }),
  P('nb-1906r', 'sale', 'New Balance 1906R', 155, 'nb-1906r',
    'Tech-runner shine in Sea Salt metallics. Premium comfort, clearance price.',
    { salePrice: 99, tag: 'SALE' }),
];

// Attach category metadata to each product for convenience.
const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
for (const p of PRODUCTS) {
  p.categoryName = catById[p.category].name;
  p.accent = catById[p.category].accent;
}

export function imgURL(product) {
  return import.meta.env.BASE_URL + product.img;
}

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

export function productsInCategory(catId) {
  return PRODUCTS.filter((p) => p.category === catId);
}
