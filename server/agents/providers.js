// Unified LLM access with an ordered fallback chain.
//
// One call site, three vendors. We try the cheapest/fastest first (Groq),
// then OpenAI, then Gemini. Any provider that is not configured is skipped
// rather than erroring, so the platform still runs with a single key.
//
// Every call returns the same shape, including token counts and an
// estimated cost, so the orchestrator can budget and log uniformly.

import 'dotenv/config';

const ORDER = (process.env.AI_PROVIDER_ORDER || 'groq,openai,gemini')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// USD per 1M tokens [input, output] - rough, for budget tracking only.
const PRICES = {
  'llama-3.3-70b-versatile': [0.59, 0.79],
  'llama-3.1-8b-instant': [0.05, 0.08],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
  'text-embedding-3-small': [0.02, 0],
  'gemini-flash-latest': [0.075, 0.3],
};

const cost = (model, tin, tout) => {
  const [pin, pout] = PRICES[model] || [0.2, 0.6];
  return (tin / 1e6) * pin + (tout / 1e6) * pout;
};

export const configured = {
  groq: () => !!process.env.GROQ_API_KEY,
  openai: () => !!process.env.OPENAI_API_KEY,
  gemini: () => !!process.env.GEMINI_API_KEY,
};

export function availableProviders() {
  return ORDER.filter((p) => configured[p]?.());
}

/* ------------------------------------------------------------------ */
/*  low-level callers                                                  */
/* ------------------------------------------------------------------ */

async function postJSON(url, headers, body, timeoutMs = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI-compatible chat completion (works for both OpenAI and Groq). */
async function chatOpenAICompatible({ baseURL, apiKey, model, system, user, images, wantJSON, maxTokens, temperature }) {
  const content = [];
  if (user) content.push({ type: 'text', text: user });
  for (const img of images || []) {
    content.push({ type: 'image_url', image_url: { url: img } });
  }

  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: images?.length ? content : user },
    ],
    max_tokens: maxTokens ?? 1200,
    temperature: temperature ?? 0.4,
  };
  if (wantJSON) body.response_format = { type: 'json_object' };

  const json = await postJSON(`${baseURL}/chat/completions`, { Authorization: `Bearer ${apiKey}` }, body);
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
    model: json.model || model,
  };
}

/** Google Gemini generateContent. */
async function chatGemini({ apiKey, model, system, user, images, wantJSON, maxTokens, temperature }) {
  const parts = [];
  if (user) parts.push({ text: user });
  for (const img of images || []) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(img);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: maxTokens ?? 1200,
      temperature: temperature ?? 0.4,
      // These are structured extraction tasks - thinking tokens would eat
      // the output budget and add latency for no benefit.
      thinkingConfig: { thinkingBudget: 0 },
      ...(wantJSON ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const json = await postJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'X-goog-api-key': apiKey },
    body
  );

  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  return {
    text,
    tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
    model,
  };
}

/* ------------------------------------------------------------------ */
/*  public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Run a completion through the fallback chain.
 * @returns {{text, json, provider, model, tokensIn, tokensOut, costUsd, attempts}}
 */
export async function complete({
  system,
  user,
  images = [],
  wantJSON = false,
  maxTokens = 1200,
  temperature = 0.4,
  only = null, // force a single provider
}) {
  const chain = only ? [only] : availableProviders();
  if (!chain.length) {
    throw new Error('no AI provider configured - set GROQ_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY');
  }

  const attempts = [];
  for (const provider of chain) {
    if (!configured[provider]?.()) continue;
    // Vision needs a multimodal model; Groq's text model can't take images.
    if (images.length && provider === 'groq') {
      attempts.push({ provider, skipped: 'no vision model configured' });
      continue;
    }

    const started = Date.now();
    try {
      let r;
      if (provider === 'groq') {
        r = await chatOpenAICompatible({
          baseURL: 'https://api.groq.com/openai/v1',
          apiKey: process.env.GROQ_API_KEY,
          model: process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
          system, user, images, wantJSON, maxTokens, temperature,
        });
      } else if (provider === 'openai') {
        r = await chatOpenAICompatible({
          baseURL: 'https://api.openai.com/v1',
          apiKey: process.env.OPENAI_API_KEY,
          model: images.length
            ? process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini'
            : process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
          system, user, images, wantJSON, maxTokens, temperature,
        });
      } else if (provider === 'gemini') {
        r = await chatGemini({
          apiKey: process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_TEXT_MODEL || 'gemini-flash-latest',
          system, user, images, wantJSON, maxTokens, temperature,
        });
      } else {
        continue;
      }

      let json = null;
      if (wantJSON) {
        json = safeParseJSON(r.text);
        if (!json) {
          throw new Error(
            `unparseable JSON (${r.text ? `got ${r.text.length} chars: ${r.text.slice(0, 120)}` : 'empty response'})`
          );
        }
      }

      return {
        text: r.text,
        json,
        provider,
        model: r.model,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd: cost(r.model, r.tokensIn, r.tokensOut),
        latencyMs: Date.now() - started,
        attempts,
      };
    } catch (e) {
      attempts.push({ provider, error: e.message, status: e.status, ms: Date.now() - started });
      console.warn(`[ai] ${provider} failed: ${e.message}`);
    }
  }

  const err = new Error(`all providers failed: ${attempts.map((a) => `${a.provider}(${a.error || a.skipped})`).join(', ')}`);
  err.attempts = attempts;
  throw err;
}

/** Tolerant JSON extraction - models like to wrap JSON in prose or fences. */
export function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const openCh = cleaned[start];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Text embedding (OpenAI only for now). Returns a float array or null. */
export async function embed(text) {
  if (!process.env.OPENAI_API_KEY) return null;
  const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  try {
    const json = await postJSON(
      'https://api.openai.com/v1/embeddings',
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      { model, input: String(text).slice(0, 8000) }
    );
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn('[ai] embed failed:', e.message);
    return null;
  }
}

/**
 * Image generation (Gemini). Returns { dataUrl, mime } or null.
 * Used by the stylist agent for try-on previews.
 */
export async function generateImage({ prompt, images = [], size = '1K' }) {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || 'models/gemini-3.1-flash-lite-image';
  const modelPath = model.startsWith('models/') ? model.slice(7) : model;

  const parts = [{ text: prompt }];
  for (const img of images) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(img);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }

  const json = await postJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent`,
    { 'X-goog-api-key': process.env.GEMINI_API_KEY },
    {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { imageSize: size } },
    },
    90000
  );

  for (const p of json.candidates?.[0]?.content?.parts || []) {
    const data = p.inline_data?.data || p.inlineData?.data;
    const mime = p.inline_data?.mime_type || p.inlineData?.mimeType || 'image/png';
    if (data) return { dataUrl: `data:${mime};base64,${data}`, mime, base64: data };
  }
  return null;
}
