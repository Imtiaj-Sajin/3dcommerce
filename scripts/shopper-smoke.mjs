// Exercises the shopper-facing AI in a real browser: text search, photo
// search and the try-on preview.
//   node scripts/shopper-smoke.mjs [url]
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const URL = process.argv[2] || 'http://localhost:8787/';
let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`  PASS  ${n}${x ? ' — ' + x : ''}`); };
const no = (n, w) => { fail++; console.log(`  FAIL  ${n} — ${w}`); };

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#loader.fade', { timeout: 45000 }).catch(() => {});

/* ---------- text search ---------- */
await page.fill('#search-input', 'white classic sneakers under 110 dollars');
await page.press('#search-input', 'Enter');
try {
  await page.waitForFunction(() => document.querySelectorAll('#sp-results .sp-row').length > 0, { timeout: 60000 });
  const rows = await page.$$eval('#sp-results .sp-row .nm', (e) => e.map((x) => x.textContent));
  const note = await page.textContent('#sp-note');
  ok('AI text search', `${rows.length} results — ${rows.slice(0, 3).join(', ')}`);
  ok('search explains itself', note.slice(0, 70));
} catch (e) { no('AI text search', e.message.slice(0, 120)); }

/* ---------- typing must not walk the character ---------- */
const moved = await page.evaluate(async () => {
  const s = window.__solespace;
  if (!s?.player) return 'no-handle';
  const before = s.player.root.position.clone();
  document.querySelector('#search-input').focus();
  return new Promise((res) => {
    // 'w' 'a' 's' 'd' typed into the box
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      document.querySelector('#search-input').dispatchEvent(
        new KeyboardEvent('keydown', { code: k, key: k.slice(3).toLowerCase(), bubbles: true })
      );
    }
    setTimeout(() => res(before.distanceTo(s.player.root.position).toFixed(3)), 700);
  });
});
if (moved === 'no-handle') console.log('  SKIP  typing-does-not-walk (production build)');
else Number(moved) < 0.2 ? ok('typing in search does not walk the player', `moved ${moved}m`) : no('typing walks the player', `${moved}m`);

/* ---------- clicking a result opens the product ---------- */
try {
  await page.click('#sp-results .sp-row');
  await page.waitForSelector('#modal:not(.hidden)', { timeout: 8000 });
  const name = await page.textContent('#modal-name');
  ok('result opens the product card', name);
} catch (e) { no('result click', e.message.slice(0, 100)); }

/* ---------- try-on ---------- */
try {
  await page.selectOption('#tryon-size', 'L');
  await page.click('#tryon-btn');
  await page.waitForSelector('#tryon-modal:not(.hidden)', { timeout: 5000 });
  ok('try-on modal opens');

  await page.waitForFunction(() => {
    const img = document.querySelector('#tryon-img');
    return img && !img.hidden && img.naturalWidth > 50;
  }, { timeout: 180000 });

  const info = await page.evaluate(() => ({
    w: document.querySelector('#tryon-img').naturalWidth,
    h: document.querySelector('#tryon-img').naturalHeight,
    note: document.querySelector('#tryon-disclaimer').textContent,
  }));
  ok('try-on rendered', `${info.w}x${info.h} · ${info.note.slice(-28)}`);
  await page.screenshot({ path: 'tmp-tryon-ui.png' });
  console.log('  screenshot -> tmp-tryon-ui.png');
} catch (e) {
  const spinnerText = await page.textContent('#tryon-spinner').catch(() => '');
  no('try-on render', (e.message + ' | ' + spinnerText).slice(0, 200));
}

/* ---------- photo search ---------- */
await page.keyboard.press('Escape');
try {
  await page.setInputFiles('#search-file', {
    name: 'samba.jpg', mimeType: 'image/jpeg',
    buffer: readFileSync('public/products/samba-og.jpg'),
  });
  await page.waitForFunction(
    () => /similar|No close match|failed/i.test(document.querySelector('#sp-title')?.textContent || ''),
    { timeout: 90000 }
  );
  const title = await page.textContent('#sp-title');
  const note = await page.textContent('#sp-note');
  const rows = await page.$$eval('#sp-results .sp-row .nm', (e) => e.map((x) => x.textContent));
  /failed/i.test(title)
    ? no('photo search', note)
    : ok('photo search', `${title} — ${note.slice(0, 50)} — ${rows.slice(0, 3).join(', ')}`);
} catch (e) { no('photo search', e.message.slice(0, 120)); }

errors.length === 0 ? ok('no console errors') : no('console errors', errors.slice(0, 3).join(' || '));

await browser.close();
console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
process.exit(fail ? 1 : 0);
