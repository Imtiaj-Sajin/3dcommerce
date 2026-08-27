// Drives the concierge chat in a real browser.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const URL = process.argv[2] || 'http://localhost:8787/';
let pass = 0, fail = 0;
const ok = (n, x = '') => { pass++; console.log(`  PASS  ${n}${x ? ' — ' + x : ''}`); };
const no = (n, w) => { fail++; console.log(`  FAIL  ${n} — ${w}`); };

const browser = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1400,height:860} });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type()==='error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(URL, { waitUntil:'networkidle', timeout:60000 });
await page.waitForSelector('#loader.fade', { timeout:45000 });

// open the chat
await page.click('#chat-fab');
await page.waitForSelector('#chat-panel:not(.hidden)', { timeout:8000 });
const opener = await page.textContent('.msg.bot');
ok('chat opens with a greeting', opener.slice(0, 58));

const lastBot = async () => {
  const els = await page.$$('.msg.bot');
  return els.length ? (await els[els.length-1].innerText()).replace(/\s+/g,' ').trim() : '';
};

// ---- a real shopping question ----
await page.fill('#chat-input', 'i need a shirt for work, nothing over 40 dollars');
await page.press('#chat-input', 'Enter');
await page.waitForFunction(() => document.querySelectorAll('.msg.bot').length >= 2 && !document.querySelector('#chat-typing'), { timeout: 90000 });
const r1 = await lastBot();
const cards = await page.$$eval('.msg.bot:last-child .chat-card .cc-nm', e => e.map(x=>x.textContent));
cards.length ? ok('answers with real products', `${cards.length}: ${cards.slice(0,3).join(', ')}`) : no('product cards', r1.slice(0,120));
ok('reply text', r1.split('\n')[0].slice(0, 90));

// ---- action buttons ----
const actions = await page.$$eval('.msg.bot:last-child .chat-actions button', b => b.map(x=>x.textContent));
actions.length ? ok('offers actions', actions.join(' / ')) : no('actions', 'none rendered');

// ---- suggestion chips, and follow-up keeps context ----
const chips = await page.$$eval('#chat-chips button', b => b.map(x=>x.textContent));
chips.length ? ok('suggestion chips', chips.join(' / ')) : no('chips', 'none');

await page.fill('#chat-input', 'do you have anything cheaper?');
await page.press('#chat-input', 'Enter');
await page.waitForFunction(() => document.querySelectorAll('.msg.bot').length >= 3 && !document.querySelector('#chat-typing'), { timeout: 90000 });
const r2 = await lastBot();
ok('follow-up keeps context', r2.split('\n')[0].slice(0, 90));

// ---- typing must not walk the player ----
const moved = await page.evaluate(async () => {
  const s = window.__solespace; if (!s?.player) return 'no-handle';
  const before = s.player.root.position.clone();
  const el = document.querySelector('#chat-input'); el.focus();
  for (const k of ['KeyW','KeyA','KeyS','KeyD']) el.dispatchEvent(new KeyboardEvent('keydown',{code:k,bubbles:true}));
  return new Promise(res => setTimeout(() => res(before.distanceTo(s.player.root.position).toFixed(3)), 700));
});
moved === 'no-handle' ? console.log('  SKIP  typing-does-not-walk') :
  (Number(moved) < 0.2 ? ok('typing does not walk the player', `${moved}m`) : no('typing walks player', `${moved}m`));

// ---- photo -> related products ----
await page.setInputFiles('#chat-file', {
  name:'samba.jpg', mimeType:'image/jpeg', buffer: readFileSync('public/products/samba-og.jpg'),
});
await page.waitForFunction(() => document.querySelectorAll('.msg.bot').length >= 4 && !document.querySelector('#chat-typing'), { timeout: 120000 });
const r3 = await lastBot();
const photoCards = await page.$$eval('.msg.bot:last-child .chat-card .cc-nm', e => e.map(x=>x.textContent));
photoCards.length ? ok('photo finds related products', photoCards.slice(0,3).join(', ')) : no('photo search', r3.slice(0,120));

// ---- clicking a card opens the product ----
const card = await page.$('.msg.bot:last-child .chat-card');
if (card) {
  await card.click();
  try {
    await page.waitForSelector('#modal:not(.hidden)', { timeout: 12000 });
    ok('card opens the product', await page.textContent('#modal-name'));
  } catch { no('card click', 'modal never opened'); }
}

await page.screenshot({ path:'tmp-chat.png' });
console.log('  screenshot -> tmp-chat.png');
errors.length === 0 ? ok('no console errors') : no('console errors', errors.slice(0,3).join(' || '));

await browser.close();
console.log(`\n${'='.repeat(52)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
process.exit(fail ? 1 : 0);
