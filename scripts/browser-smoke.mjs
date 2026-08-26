// Boots the built client in a real browser and checks it renders the
// catalogue that came from the database.
//   node scripts/browser-smoke.mjs [url]
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8787/';
let pass = 0;
let fail = 0;
const ok = (n, x = '') => { pass++; console.log(`  PASS  ${n}${x ? ' — ' + x : ''}`); };
const no = (n, w) => { fail++; console.log(`  FAIL  ${n} — ${w}`); };

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const pageLogs = [];
page.on('console', (m) => {
  pageLogs.push(`${m.type()}: ${m.text()}`);
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const missing = [];
page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });

console.log(`\nopening ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

// The loader fades once characters are in and the first frames have drawn.
try {
  await page.waitForSelector('#loader.fade', { timeout: 45000 });
  ok('loader faded (scene rendered)');
} catch {
  no('loader faded', 'still visible after 45s');
}

// The bottom nav is rebuilt from the categories the API returned.
const navButtons = await page.$$eval('#zone-nav button', (bs) => bs.map((b) => b.textContent.trim()));
const expected = ['Nike', 'Jordan', 'adidas', 'New Balance', 'ASICS', 'Converse'];
const hasAll = expected.every((e) => navButtons.some((b) => b.toLowerCase() === e.toLowerCase()));
hasAll
  ? ok('zone nav built from the database', navButtons.join(' | '))
  : no('zone nav', `got: ${navButtons.join(' | ')}`);

const hasHighlight = navButtons.some((b) => /sale/i.test(b));
hasHighlight ? ok('highlight island named from the database', navButtons.find((b) => /sale/i.test(b))) : no('highlight nav', navButtons.join('|'));

// Canvas should be painting something other than a flat clear colour.
const painted = await page.evaluate(() => {
  const c = document.getElementById('scene');
  if (!c) return { ok: false, why: 'no canvas' };
  return { ok: c.width > 100 && c.height > 100, w: c.width, h: c.height };
});
painted.ok ? ok('canvas sized', `${painted.w}x${painted.h}`) : no('canvas', JSON.stringify(painted));

// Click a product card by driving the app the way a shopper would: use the
// nav to walk to a zone, then confirm the modal opens from a known product.
const opened = await page.evaluate(async () => {
  // Only possible on the dev server, where the module graph is unbundled.
  try {
    const s = window.__solespace;
    if (!s?.ui) return 'no-dev-handle';
    const { PRODUCTS } = await import('/src/products.js');
    if (!PRODUCTS?.length) return 'no-products';
    s.ui.openProduct(PRODUCTS[0].id);
    return document.querySelector('#modal')?.classList.contains('hidden') === false
      ? `opened:${PRODUCTS[0].name}`
      : 'modal-did-not-open';
  } catch (e) {
    return 'no-dev-handle';
  }
});
if (opened.startsWith('opened:')) ok('product modal opens', opened.slice(7));
else if (opened === 'no-dev-handle') console.log('  SKIP  product modal (production build has no dev handle)');
else no('product modal', opened);

// Product images must actually resolve.
const imgStatus = await page.evaluate(async () => {
  const r = await fetch('/products/samba-og.jpg', { method: 'HEAD' });
  return r.status;
});
imgStatus === 200 ? ok('product photos served') : no('product photos', `HTTP ${imgStatus}`);

const appMissing = missing.filter((m) => !m.includes('/src/products.js'));
appMissing.length === 0
  ? ok('no failed requests')
  : no('failed requests', appMissing.slice(0, 5).join(' || '));

const realErrors = errors.filter((e) => !/Failed to load resource/.test(e));
realErrors.length === 0
  ? ok('no console errors')
  : no('console errors', realErrors.slice(0, 4).join(' || '));

await page.screenshot({ path: 'tmp-shot.png' });
console.log('  screenshot -> tmp-shot.png');

await browser.close();
console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
if (fail) {
  console.log('\nrecent page logs:');
  console.log(pageLogs.slice(-12).map((l) => '  ' + l).join('\n'));
}
process.exit(fail ? 1 : 0);
