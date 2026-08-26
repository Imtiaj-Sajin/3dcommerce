# METAMART 🛍️

A virtual shopping mall you walk through in third person — Three.js on the
front, a MySQL-backed commerce API and an AI agent layer behind it.

You spawn inside **SoleSpace**, the anchor sneaker store: an L-shaped daylight
showroom with brand walls, a rotating highlight island and animated shoppers.
Walk out through the storefront into a domed **concourse** ringed with nine
more tenant bays. Walking into a bay loads that store — nothing else stays in
memory.

> Product photos and brand names are used for demo/portfolio purposes only.

---

## Quick start

```bash
npm install
cp .env.example .env          # then fill in DB + API keys
npm run db:apply              # create the schema and seed the catalogue
npm run server                # API + admin on :8787
npm run dev                   # 3D client on :5174 (proxies /api to :8787)
```

| URL | What |
| --- | --- |
| http://localhost:5174 | the mall (dev) |
| http://localhost:8787 | the mall (built) + API |
| http://localhost:8787/admin | admin console |

Seeded admin login: `admin@metamart.local` / `ChangeMe!2026` —
**change it under Settings on first login.**

### Importing the database by hand

`sql/metamart_full.sql` is a single importable file (schema + seed).
In phpMyAdmin: pick the database → Import → choose the file → Go.

---

## How a space works

Everything the player can see is one **space**. A space is bound to an
**architecture** — a room blueprint that decides how much it can physically
display:

| Blueprint | Category zones | Products per zone | Highlight island |
| --- | --- | --- | --- |
| `l_hall` | 8 | 5 | 4 slots |
| `gallery` | 7 | 5 | — |
| `boutique` | 4 | 5 | 3 slots |

Those limits are enforced in the API, not just the UI: the 9th category and
the 6th product in a zone are rejected with a 409, because there is nowhere in
the room to put them.

Categories carry a `slot_index` that maps to a physical wall, so whatever the
database contains drops into the right place — the renderer has no hardcoded
brand names.

### Only one space is ever loaded

`GET /api/spaces/:slug/bundle` returns everything for a single store and
nothing about any other. The client holds exactly one space's catalogue at a
time, so the mall can grow to any number of stores without the client getting
heavier. Entering a tenant bay swaps the whole space rather than opening a
door into a second room.

---

## The AI layer

Nothing calls a model directly. Every request goes through the **orchestrator**,
which owns the pipeline:

```
permission → rate limit → daily budget → execute → schema validation → log
```

| Agent | Does | Who can use it |
| --- | --- | --- |
| `enrich` | Completes a product listing from partial input + photo | editor |
| `search` | Turns a sentence into catalogue filters | public |
| `vision` | Reads an uploaded photo, finds similar products | public |
| `merchandiser` | Picks products for a highlight campaign | editor |
| `stylist` | Renders a try-on preview at a chosen body size | public |

`POST /api/ai/ask` puts a **router model** in front: it reads a free-form
message and picks one agent from the registry, or refuses. It can only choose
from what is registered, so it cannot reach anything unpublished.

**Providers** are tried in order — Groq → OpenAI → Gemini — and any that is
not configured is skipped, so the platform runs with a single key. A provider
that errors falls through to the next one automatically.

**Guardrails** (`server/agents/guardrails.js`): input size caps, prompt
injection screening, PII redaction, untrusted-data framing, output schema
validation, price clamping, per-minute rate limits and a per-day USD budget.
Every call — including blocked ones — lands in `ai_jobs` with tokens, cost,
latency and flags, visible under **AI activity** in the admin console.

Model output is *normalised* rather than rejected where it is safe to do so: a
model that answers `sort: "price_low_to_high"` understood the shopper fine, and
only its vocabulary was off. Hard failures are reserved for the fields that
matter — category, price, product ids.

---

## Admin console

`/admin` — dashboard, products, categories, highlight island, discounts,
spaces, AI activity, settings.

The product editor is the centrepiece. Press **✨ Complete with AI** and every
empty field gets a greyed suggestion:

- <kbd>Tab</kbd> or <kbd>→</kbd> inside a field accepts that field
- <kbd>Ctrl</kbd>+<kbd>Enter</kbd> accepts everything
- clicking a suggestion accepts it

The AI picks the category from the ones that space actually has, and its price
is clamped to a sane range before it ever reaches the form.

**Highlight island** — the centre display. Rename it to anything (Sale,
Popular, New Arrivals, Editor's Picks), pick which products sit on it, or let
the merchandiser agent suggest a set from a one-line brief. Products on the
island are automatically taken off the wall shelves.

**Discounts** — percent or fixed, scoped to a product, a category, a space or
everything, with an optional date window. The best single discount wins per
product; they never stack.

---

## Layout

```text
src/                    3D client
  main.js               bootstrap: load catalogue -> build room -> loop
  api.js                API client
  products.js           runtime catalogue for the CURRENT space only
  shop.js               the L-hall room, zones driven by slot index
  concourse.js          the domed plaza and its nine tenant bays
  player.js  cameraRig.js  visitors.js  rig.js
  sneakerArt.js         product card + neon sign textures
  textures.js           procedural brick / concrete / floor
  ui.js  style.css

server/
  index.js              Express app
  lib/                  db, auth, pricing, shaping, audit
  routes/               catalog (public), admin (CRUD), ai
  agents/               orchestrator, guardrails, providers + 5 agents
  admin/                admin console (no build step)

sql/                    01_schema, 02_seed, metamart_full (import this)
scripts/                gen-seed, db-apply, build-sql, smoke, browser-smoke
public/                 models/ (KayKit CC0) + products/ (photos)
```

## Tests

```bash
node scripts/smoke.mjs           # 23 API checks: capacity, pricing, guardrails
node scripts/browser-smoke.mjs   # boots the real client in Chromium
```

## Deploying

The Express server serves the built client, the admin console and the API from
one origin, so a VPS needs only Node and network access to MySQL:

```bash
npm ci && npm run build && NODE_ENV=production node server/index.js
```

Put nginx in front for TLS. Before going live: change the admin password, set a
real `JWT_SECRET`, and rotate any key that has ever been pasted into a chat.
