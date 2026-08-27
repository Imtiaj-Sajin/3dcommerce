# METAMART — project status & plan

Last updated: 2026-08-27

This is the handoff note: what exists and is verified, what is stubbed, and
what to build next.

---

## 🔴 Do this first — rotate the exposed secrets

The database password and the OpenAI / Gemini API keys were pasted into a chat
and are written into `.env`. Treat all of them as public:

| Secret | Action |
| --- | --- |
| OpenAI key `sk-proj-I2vf…` | Revoke at platform.openai.com → API keys, issue a new one |
| Hugging Face `hf_NJuf…` | Revoke at huggingface.co → Settings → Access Tokens |
| Gemini key `AQ.Ab8RN…` | Revoke in Google AI Studio, issue a new one |
| MySQL `odin` / `odin156100` | Change the password; the DB is also open to the internet on 31.97.211.4:3306 |
| Admin login `ChangeMe!2026` | Change it at /admin → Settings |
| `JWT_SECRET` | Replace with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

`.env` is gitignored, so nothing was committed — but the keys still need
rotating. Also consider firewalling MySQL to the app server only, and giving
the app a least-privilege user (it does not need `DROP`, `SUPER` or
`CREATE USER`).

---

## What is built and verified

### Database — done
16 tables in `metama_db`, already applied to the live server.
`sql/metamart_full.sql` is the single importable file (phpMyAdmin → Import).

Key idea: **architectures** define how much a room can physically display, and
those limits are enforced in the API.

| Blueprint | Category zones | Products/zone | Island |
| --- | --- | --- | --- |
| `l_hall` | 8 | 5 | 4 |
| `gallery` | 7 | 5 | — |
| `boutique` | 4 | 5 | 3 |

Seeded: 10 spaces (SoleSpace live + 9 tenants), 6 categories, 25 products with
real photos, 150 size variants, 3 highlight campaigns, 4 discounts.

### Backend API — done
`server/` — Express, JWT auth, role gates (`owner` > `admin` > `editor`),
audit log, image upload (sharp → 1400×1000 white-bg JPEG into
`public/products/`).

- `GET /api/spaces` — mall directory
- `GET /api/spaces/:slug/bundle` — **everything for one space, nothing else**
- `GET /api/products/:id`, `GET /api/search`
- `/api/admin/*` — full CRUD
- `/api/ai/*` — agents

Discounts: percent or fixed; scoped to product / category / space / global;
best single discount wins, never stacks; money is integer cents throughout.

### AI agent layer — done
Everything goes through the orchestrator:
`permission → rate limit → daily budget → execute → schema validation → log`

| Agent | Status |
| --- | --- |
| `enrich` — admin autofill | ✅ verified in browser |
| `search` — sentence → filters | ✅ verified |
| `vision` — photo → matches | ✅ verified (recognises adidas, returns Samba first) |
| `merchandiser` — island picks | ✅ verified |
| `stylist` — try-on render | ✅ works via Hugging Face (free tier, ~12s) |
| router (`/api/ai/ask`) | ✅ picks an agent or refuses |

Providers: Groq → OpenAI → Gemini, skipping any that is unconfigured, falling
through on error. Guardrails: injection screening, PII redaction,
untrusted-data framing, output schema validation, price clamping, rate limit,
daily USD budget. Every call lands in `ai_jobs` (visible under **AI activity**).

### Admin console — done
`/admin` — dashboard, products, categories, highlight island, discounts,
spaces, AI activity, settings.

Product editor: **✨ Complete with AI** fills every field, then
<kbd>Tab</kbd>/<kbd>→</kbd> accepts one field, <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
accepts all. Verified end-to-end in Chromium.

### 3D client — DB-driven
`src/products.js` is now a runtime catalogue holding **only the current
space**. Zones are addressed by slot index, so the room renders whatever the
database contains. The island title/accent/products come from the DB.

### Tests
```bash
npm run test:api        # 23 checks: capacity, pricing, guardrails, agents
npm run test:browser    # boots the client in Chromium (7 checks)
node scripts/admin-smoke.mjs   # drives the admin console (11 checks)
```
All green as of this commit.

---

## Caveats / known gaps

1. **Try-on cannot match the exact shoe.** The free Hugging Face tier only
   reaches text-to-image models; image *editing* (which would let us condition
   on the real product photo) lives on paid providers. So the stylist
   describes the photo in words with the vision agent and renders from that.
   Colour, silhouette and materials carry over well, but fine model detailing
   does not — a Samba may come back looking like a Superstar. To fix properly,
   either add credits to a HF image-editing provider (fal-ai / replicate) or
   put `gemini` first once its image quota is available.
   Gemini image models are currently 429 quota-blocked on this key; its text
   models work fine.
2. **Only the `l_hall` room geometry exists.** `boutique` and `gallery` are
   defined in the DB and served by the API, but there is no 3D room built for
   them yet — every space currently renders in the L-hall room.
3. **Entering a tenant reloads the page** (`?space=slug`). That genuinely
   guarantees the old space is freed, but it is not a seamless walk-through
   yet. See next steps.
4. The 9 tenant spaces have **no products** — they are `coming_soon`, so
   clicking a bay shows a "leasing now" toast.
5. Cart is client-side only; there is no orders table, checkout or payment.
6. No multi-person yet (deferred by you).

---

## Next steps, in the order I would do them

### 1. Seamless space transitions (replaces the page reload)
Wrap each space's meshes in a `THREE.Group`, return it from `buildShop`, and
add `disposeSpace()` that walks the group calling `geometry.dispose()` and
`material.dispose()`. Then `enterSpace()` becomes: fade out → dispose → fetch
the new bundle → rebuild → fade in, with the player placed at the entrance.
The catalogue swap already works this way; only the mesh lifecycle is missing.

### 2. The other two room blueprints
Build `buildBoutique()` and `buildGallery()` alongside `buildShop()`, each
exposing the same interface (`interactables`, `browsePoints`, `colliders`,
`update`, `sun`). Pick the builder from `space.architecture`. The layout slots
are already in `architectures.layout_json`.

### 3. Stock the other tenants
For each of the 9 spaces: create categories, then use the admin's AI autofill
to add products quickly. The capacity rules will keep it honest.

### 4. Orders
`orders` + `order_items` tables, a checkout endpoint, and an Orders view in
the admin. Payment provider after that.

### 5. Multi-person
Add a WebSocket server broadcasting `{spaceSlug, position, heading, animation}`
per player. `src/visitors.js` already models remote avatars exactly the way a
networked player would work — swap the wander logic for network state and it
is most of the way there.

---

## Running it

```bash
npm run server     # API + admin on :8787
npm run dev        # 3D client on :5174 (proxies /api)
npm run build      # then :8787 serves the built client too
```

| URL | What |
| --- | --- |
| http://localhost:5174 | the mall (dev) |
| http://localhost:8787/admin | admin console |
| http://localhost:8787/api/health | API + DB + provider status |

Useful scripts: `npm run db:seed` (regenerate seed from the front-end
catalogue), `npm run db:apply` (schema + seed), `npm run sql:build` (rebuild
the single import file).

## Deploying to the VPS

The Express server serves the API, the admin console and the built client from
one origin, so the VPS needs only Node + MySQL access:

```bash
npm ci && npm run build && NODE_ENV=production node server/index.js
```

Put nginx in front for TLS, run it under pm2/systemd, and rotate every secret
listed at the top of this file first.
