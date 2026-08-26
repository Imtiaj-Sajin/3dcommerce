// METAMART API server.
//
//   /api/...        catalogue + AI (public)
//   /api/admin/...  admin CRUD (token required)
//   /admin          admin panel (static)
//   /               the 3D mall (dist/ in production, Vite dev server otherwise)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';

import { router as catalogRouter } from './routes/catalog.js';
import { router as adminRouter } from './routes/admin.js';
import { router as aiRouter } from './routes/ai.js';
import { ping } from './lib/db.js';
import { availableProviders } from './agents/providers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);

const app = express();
app.set('trust proxy', 1);
app.use(cors());
// Data-URL images (photo search, try-on selfies) make requests large.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

// Tiny request log - useful while wiring the front end up.
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`${req.method} ${req.path}`);
  next();
});

/* ---------------- health ---------------- */

app.get('/api/health', async (_req, res) => {
  let db = false;
  try { db = await ping(); } catch { /* reported as false */ }
  res.json({
    ok: db,
    db,
    aiProviders: availableProviders(),
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

/* ---------------- routes ---------------- */

app.use('/api/admin', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }), adminRouter);
app.use('/api/ai', rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false }), aiRouter);
app.use('/api', catalogRouter);

/* ---------------- static ---------------- */

// Product photos and character models live in the repo.
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '7d' }));
// Admin panel.
app.use('/admin', express.static(path.join(__dirname, 'admin')));
// Built 3D client, when it exists.
app.use(express.static(path.join(ROOT, 'dist'), { maxAge: '1h' }));

/* ---------------- errors ---------------- */

app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (process.env.NODE_ENV !== 'production') console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'internal_error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack?.split('\n').slice(0, 4) } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`\n  METAMART API   http://localhost:${PORT}`);
  console.log(`  admin panel    http://localhost:${PORT}/admin`);
  console.log(`  AI providers   ${availableProviders().join(', ') || '(none configured)'}\n`);
});
