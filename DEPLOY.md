# Deploying METAMART

Context for whoever (or whatever) is doing the deploy on the VPS. The
database is already live and is **not** part of this deploy.

---

## What this is

A 3D virtual mall. One Node process serves everything from a single origin:

| Path | Served from |
|---|---|
| `/` | `dist/` — the Vite-built 3D client |
| `/api/...` | Express, public catalogue + AI routes |
| `/api/admin/...` | Express, admin CRUD (JWT, role-gated) |
| `/admin` | `server/admin/` — static admin console |
| `/products/…`, `/models/…` | `public/` |

Entry point is `server/index.js`, default port **8787**.

Because it is all one origin, the client needs no API base URL — `src/api.js`
falls back to `''` and hits its own host.

---

## Deploy

```bash
git pull
npm ci
npm run build          # writes dist/ — needs devDependencies, so build BEFORE pruning
npm prune --omit=dev   # drops vite, playwright, concurrently
NODE_ENV=production node server/index.js
```

`dist/` is gitignored, so it never arrives from git — you must build on the
server every time.

Run it under pm2 or systemd. **The working directory must be the repo root**
(see the uploads gotcha below).

```bash
pm2 start server/index.js --name metamart --cwd /path/to/repo
```

### nginx

Terminate TLS and proxy to `127.0.0.1:8787`. One non-default setting matters:

```nginx
client_max_body_size 16m;
```

The API accepts 12 MB JSON bodies (photo search and try-on send data-URL
images) and 8 MB file uploads. nginx's 1 MB default will 413 both.

---

## Environment

`.env` is gitignored. It does **not** arrive with `git pull` — create it on the
server by hand. `.env.example` lists every key and is committed.

Four values differ from local development:

| Key | Local | Server |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `PUBLIC_BASE_URL` | `http://localhost:8787` | the real https origin |
| `DB_HOST` | `31.97.211.4` | `127.0.0.1` if deploying onto that same box |
| `PORT` | `8787` | keep, behind nginx |

`NODE_ENV=production` is not cosmetic. The error handler in `server/index.js`
puts `err.stack` into the JSON response body whenever `NODE_ENV !== 'production'`.
Deploy without it and every 500 hands the caller a stack trace.

Everything else — AI provider order, model names, budget guardrails — carries
over unchanged.

### Secrets

Every secret currently in the local `.env` must be treated as burned and
rotated before this goes up: the OpenAI, Gemini, Groq and Hugging Face keys,
the MySQL password, `JWT_SECRET`, and the admin login. See the table at the
top of `PROJECT_STATUS.md`.

---

## The database

**Already live. Nothing to deploy, migrate or seed.**

> Never run `npm run db:apply` against it. `sql/01_schema.sql` begins with
> `DROP TABLE IF EXISTS` and will destroy the live data. Same for
> `npm run db:seed`. These exist for rebuilding a scratch database only.

`npm run sql:dump` is read-only and safe.

If the app and MySQL end up on the same box, point `DB_HOST` at `127.0.0.1`
and firewall port 3306 shut — it is currently reachable from the internet.

---

## Gotchas

**Uploads are written into a git-tracked directory.**
`server/routes/admin.js` resolves `PRODUCTS_DIR` as
`path.resolve(process.cwd(), 'public', 'products')` and writes uploaded
product photos there with sharp. Two consequences:

1. The process **must** be started with the repo root as its working
   directory, or uploads land somewhere else entirely.
2. `public/products/` holds 73 tracked files *plus* every image uploaded
   through the admin panel, which are untracked. **Never run `git clean -fd`**
   in the repo — it deletes every uploaded image, and the `product_images`
   rows in the database will then point at files that no longer exist.
   Back that directory up before any aggressive git operation.

**Do not run `npx playwright install`.** Playwright is a devDependency used by
the local browser smoke tests. The npm package is 5 MB and `npm prune
--omit=dev` removes it. The browser binaries it would download are ~700 MB and
are not needed on the server.

**CORS is wide open.** `server/index.js` calls bare `app.use(cors())`. Since
the client is served from the same origin, this can be tightened to the real
domain or removed.

---

## Verify after deploy

```bash
curl -s localhost:8787/api/health
```

Expect `{"ok":true,"db":true,"aiProviders":[...],"env":"production"}`.

- `ok:false` or `db:false` → the DB credentials or host are wrong.
- `aiProviders: []` → no AI keys were picked up; check `.env` is being read
  from the working directory.
- `env` must read `production`.

Then check `/admin` loads, and that the 3D mall loads at `/` and walks. If `/`
returns the 404 JSON, `dist/` was not built.

`npm run test:api` is a server-side smoke test and safe to run. The
`test:browser`, `test:admin`, `test:shopper` and `test:chat` scripts need
Playwright browsers and are for local use only.
