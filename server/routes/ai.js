// AI endpoints. Everything here delegates to the orchestrator, which owns
// permissions, rate limiting, budget and logging - these handlers only
// translate HTTP into an agent call.

import express from 'express';
import { runAgent, route, capabilities } from '../agents/orchestrator.js';
import { recentJobs, spentTodayUsd } from '../agents/guardrails.js';
import { availableProviders } from '../agents/providers.js';
import { readToken } from '../lib/auth.js';
import jwt from 'jsonwebtoken';
import { one } from '../lib/db.js';

export const router = express.Router();

/** Soft auth: attach an admin actor if a valid token is present, else public. */
function actorOf(req) {
  const token = readToken(req);
  if (token) {
    try {
      const p = jwt.verify(token, process.env.JWT_SECRET);
      return { id: p.sub, role: p.role, type: 'admin', email: p.email };
    } catch { /* fall through to public */ }
  }
  return { id: null, role: 'public', type: 'shopper' };
}

const ctxOf = (req) => ({
  actor: actorOf(req),
  ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString(),
});

async function spaceIdOf(slugOrId) {
  if (!slugOrId) return null;
  const row = await one('SELECT id FROM spaces WHERE slug = ? OR id = ?', [String(slugOrId), Number(slugOrId) || 0]);
  return row?.id ?? null;
}

/* ---------------- introspection ---------------- */

router.get('/capabilities', (req, res) => {
  res.json({ providers: availableProviders(), agents: capabilities(actorOf(req)) });
});

/* ---------------- direct agent invocation ---------------- */

router.post('/agents/:name', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.space) {
      payload.spaceId = await spaceIdOf(payload.space);
      delete payload.space;
    }
    const out = await runAgent(req.params.name, payload, ctxOf(req));
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ---------------- natural-language router ---------------- */

router.post('/ask', async (req, res) => {
  try {
    const spaceId = await spaceIdOf(req.body.space || 'solespace');
    const out = await route(String(req.body.message || ''), { ...ctxOf(req), spaceId });
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ---------------- shopper conveniences ---------------- */

router.post('/search', async (req, res) => {
  try {
    const spaceId = await spaceIdOf(req.body.space || 'solespace');
    const out = await runAgent(
      'search',
      { spaceId, query: String(req.body.query || ''), limit: Number(req.body.limit) || 24 },
      ctxOf(req)
    );
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/search-image', async (req, res) => {
  try {
    const spaceId = await spaceIdOf(req.body.space || 'solespace');
    const out = await runAgent(
      'vision',
      { spaceId, imageDataUrl: String(req.body.image || ''), limit: Number(req.body.limit) || 12 },
      ctxOf(req)
    );
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/try-on', async (req, res) => {
  try {
    const out = await runAgent(
      'stylist',
      {
        productId: Number(req.body.productId),
        size: String(req.body.size || 'M').toUpperCase(),
        faceDataUrl: req.body.face || undefined,
      },
      ctxOf(req)
    );
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* ---------------- ops (admin) ---------------- */

router.get('/jobs', async (req, res) => {
  const actor = actorOf(req);
  if (actor.role === 'public') return res.status(401).json({ error: 'auth_required' });
  res.json({ spentTodayUsd: await spentTodayUsd(), jobs: await recentJobs(Number(req.query.limit) || 50) });
});
