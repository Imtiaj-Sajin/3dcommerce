// Drives the admin console in a real browser: login, navigate, open the
// product editor and run the AI autofill.
//   node scripts/admin-smoke.mjs
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8787';
let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`  PASS  ${n}${x ? ' — ' + x : ''}`); };
const no = (n, w) => { fail++; console.log(`  FAIL  ${n} — ${w}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle' });

/* ---- login ---- */
await page.fill('#li-email', 'admin@metamart.local');
await page.fill('#li-pw', 'ChangeMe!2026');
await page.click('#login-form button[type=submit]');
try {
  await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
  ok('login', await page.textContent('#who'));
} catch { no('login', 'app never appeared'); }

/* ---- dashboard ---- */
try {
  await page.waitForSelector('.stat', { timeout: 10000 });
  const stats = await page.$$eval('.stat', (els) => els.map((e) => `${e.querySelector('.n').textContent} ${e.querySelector('.l').textContent}`));
  ok('dashboard stats', stats.join(' | '));
} catch (e) { no('dashboard', e.message); }

/* ---- categories view shows capacity ---- */
await page.click('[data-view="categories"]');
await page.waitForTimeout(1200);
const catCards = await page.$$eval('.grid.c3 .card b', (els) => els.map((e) => e.textContent));
catCards.length >= 6 ? ok('categories view', catCards.join(', ')) : no('categories', `only ${catCards.length}`);

/* ---- products view ---- */
await page.click('[data-view="products"]');
await page.waitForSelector('table tbody tr', { timeout: 10000 });
const rows = await page.$$eval('table tbody tr', (r) => r.length);
rows >= 20 ? ok('products list', `${rows} rows`) : no('products list', `${rows} rows`);

/* ---- product editor + AI autofill ---- */
await page.click('#new-product');
await page.waitForSelector('#f-name', { timeout: 8000 });
ok('product editor opens');

await page.fill('#f-name', 'Gel-Cumulus 26');
await page.fill('#f-brand', 'ASICS');
await page.click('#ai-fill');

try {
  await page.waitForSelector('.ghosttext', { timeout: 60000 });
  const ghosts = await page.$$eval('.ghosttext', (els) => els.length);
  const status = await page.textContent('#ai-status');
  ok('AI autofill produced suggestions', `${ghosts} fields · ${status.trim()}`);

  // Tab in the short-description field should accept that suggestion.
  const before = await page.inputValue('#f-short');
  await page.focus('#f-short');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const after = await page.inputValue('#f-short');
  after && after !== before
    ? ok('Tab accepts a suggestion', after.slice(0, 60) + '…')
    : no('Tab accept', `before="${before}" after="${after}"`);

  // Ctrl+Enter should accept the rest.
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(600);
  const left = await page.$$eval('.ghosttext', (els) => els.length);
  left === 0 ? ok('Ctrl+Enter accepts all remaining') : no('accept all', `${left} left`);

  const filled = await page.evaluate(() => ({
    price: document.querySelector('#f-price').value,
    tags: document.querySelector('#f-tags').value,
    sizes: document.querySelector('#f-sizes').value,
    cat: document.querySelector('#f-category').selectedOptions[0]?.textContent,
  }));
  filled.price && filled.tags && filled.sizes
    ? ok('form fully populated', `${filled.cat} · $${filled.price} · ${filled.tags.slice(0, 40)}`)
    : no('form population', JSON.stringify(filled));
} catch (e) {
  no('AI autofill', e.message.slice(0, 160));
}

await page.screenshot({ path: 'tmp-admin.png', fullPage: false });
console.log('  screenshot -> tmp-admin.png');

/* ---- AI activity log ---- */
await page.keyboard.press('Escape');
await page.click('[data-view="ai"]');
await page.waitForTimeout(2000);
const logRows = await page.$$eval('.log tbody tr', (r) => r.length).catch(() => 0);
logRows > 0 ? ok('AI activity log', `${logRows} entries`) : no('AI log', 'empty');

errors.length === 0 ? ok('no console errors') : no('console errors', errors.slice(0, 3).join(' || '));

await browser.close();
console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
process.exit(fail ? 1 : 0);
