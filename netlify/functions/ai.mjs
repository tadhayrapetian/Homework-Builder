/* Worksheet Studio — Gemini proxy.
 *
 * The API key never reaches the browser. The page talks to this function,
 * the function talks to Google. Routes:
 *
 *   GET  /api/ai/status     → is a key configured, and which model
 *   POST /api/ai/generate   → {level, topic, kind, length, notes} → worksheet spec
 *   POST /api/ai/check      → {spec, issues} → {ok, issues, fixed}
 *
 * Required environment variable: GEMINI_API_KEY
 * Optional:                      GEMINI_MODEL (default gemini-3.8-flash)
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const KEY = process.env.GEMINI_API_KEY || '';
const ENDPOINT = m =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

/* ── the shape we ask the model for ───────────────────────────────── */
const SCHEMA = `Return ONLY valid JSON, no markdown fence, in exactly this shape:

{
  "title": "short worksheet title",
  "level": "A2 | B1 | B2 | C1",
  "topic": "the topic in a few words",
  "text": "a reading text of the requested length, or null if none was asked for",
  "exercises": [
    { "type": "gapfill",   "instruction": "...", "items": [ {"q": "sentence with ___ for the gap", "a": "answer"} ] },
    { "type": "mcq",       "instruction": "...", "items": [ {"q": "question", "options": ["a","b","c","d"], "correct": 0} ] },
    { "type": "match",     "instruction": "...", "pairs": [ ["left","right"] ] },
    { "type": "truefalse", "instruction": "...", "items": [ {"q": "statement", "a": true} ] },
    { "type": "wordform",  "instruction": "...", "items": [ {"q": "sentence with ___", "root": "PERFORM", "a": "performance"} ] },
    { "type": "transform", "instruction": "...", "items": [ {"q": "original sentence", "key": "KEY WORD", "a": "rewritten sentence"} ] },
    { "type": "writing",   "instruction": "...", "prompts": ["..."] },
    { "type": "speaking",  "instruction": "...", "prompts": ["..."] }
  ]
}

Rules that matter:
- Use only the exercise types listed above. Include only the types you were asked for.
- Every gap is written as three underscores: ___
- "correct" is the ZERO-BASED index of the right option. Options must all be different.
- Every answer must be genuinely derivable from the task. No trick items.
- Keep vocabulary and grammar inside the stated CEFR level.`;

/* ── prompts ──────────────────────────────────────────────────────── */
function generatePrompt(o) {
  const want = (o.kinds && o.kinds.length ? o.kinds : ['gapfill', 'mcq', 'match', 'writing']).join(', ');
  const variety = o.variety === 'American' ? 'American' : 'British';
  return [
    `You are an experienced English teacher writing a printable worksheet.`,
    ``,
    `WHO IT IS FOR`,
    `CEFR level: ${o.level || 'B1'}`,
    `Learners: ${o.age || 'adults'}`,
    `The worksheet is for: ${o.purpose || 'practising language the class has already met'}`,
    o.exam ? `It should follow the task formats and register of ${o.exam}.` : '',
    ``,
    `WHAT IT IS ABOUT`,
    `Topic: ${o.topic || 'everyday life'}`,
    o.grammar ? `Grammar the worksheet must practise: ${o.grammar}. Build the text and the exercises around it.` : '',
    o.vocab ? `Vocabulary that must appear: ${o.vocab}. Use each item at least once in the text or an exercise.` : '',
    o.avoid ? `Keep these out of it completely: ${o.avoid}.` : '',
    ``,
    `THE TEXT`,
    o.withText
      ? `Start with ${o.genre || 'a short informative article'} of about ${o.length || 130} words. Tone: ${o.tone || 'neutral and clear'}. Every exercise must be answerable from the text or practise its language.`
      : `Do not include a reading text; set "text" to null.`,
    ``,
    `THE EXERCISES`,
    `Exercise types to include, in this order: ${want}`,
    `Items per exercise: about ${o.n || 8}.`,
    `Use ${variety} spelling and ${variety} conventions for dates, money and measurements.`,
    `Age-appropriate throughout: the situations, names and examples must suit ${o.age || 'adults'}.`,
    o.notes ? `` : '',
    o.notes ? `ALSO FROM THE TEACHER` : '',
    o.notes ? String(o.notes) : '',
    '',
    SCHEMA
  ].filter(x => x !== '' || true).filter(Boolean).join('\n');
}

function checkPrompt(spec, issues, brief) {
  const b = brief || {};
  const variety = b.variety === 'American' ? 'American' : 'British';
  return [
    `You are proofreading a worksheet written for CEFR level ${spec.level || b.level || 'B1'}.`,
    `Check it for: wrong or missing answers; multiple-choice keys pointing at the wrong option;`,
    `options that are all wrong or two that are both right; gaps with more than one possible answer;`,
    `language above or below the stated level; unclear instructions; spelling that is not ${variety};`,
    `and any item that cannot actually be answered from what the student is given.`,
    ``,
    `It was written to this brief, so also check the brief was kept:`,
    `- learners: ${b.age || 'adults'} — nothing in it should be unsuitable for them`,
    `- the lesson is for: ${b.purpose || 'practice'}`,
    b.exam ? `- it should match the task formats of ${b.exam}` : '',
    b.grammar ? `- it must practise: ${b.grammar}` : '',
    b.vocab ? `- these words must appear: ${b.vocab}` : '',
    b.avoid ? `- these must NOT appear at all: ${b.avoid} — remove anything that does` : '',
    b.withText && b.length ? `- the reading text should be roughly ${b.length} words (within about 20%)` : '',
    ``,
    issues && issues.length ? `An automatic check already flagged these: ${issues.join(' | ')}` : '',
    '',
    `Return ONLY valid JSON in this shape:`,
    `{ "ok": true|false, "issues": ["short description", ...], "fixed": <the corrected worksheet, same shape as the input> }`,
    `If nothing is wrong, set ok to true, issues to [] and fixed to the worksheet unchanged.`,
    `Never drop an exercise — repair it.`,
    '',
    `The worksheet:`,
    JSON.stringify(spec)
  ].filter(Boolean).join('\n');
}

/* ── one call to Gemini ───────────────────────────────────────────── */
async function callGemini(prompt, temperature) {
  const res = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192
      }
    })
  });

  const raw = await res.text();
  if (!res.ok) {
    let msg = raw.slice(0, 400);
    try { msg = JSON.parse(raw).error?.message || msg; } catch (e) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) { throw new Error('Gemini sent something that was not JSON'); }

  const cand = data.candidates && data.candidates[0];
  if (!cand) {
    const blocked = data.promptFeedback?.blockReason;
    throw new Error(blocked ? `the request was blocked (${blocked})` : 'Gemini returned no answer');
  }
  const text = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty answer');

  return parseLoose(text);
}

/* Models occasionally wrap JSON in a fence even when asked not to. */
function parseLoose(t) {
  let s = String(t).trim();
  if (s.startsWith('```')) s = s.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {}
  }
  throw new Error('could not read the worksheet Gemini sent back');
}

/* ── deterministic validation, run on both sides of the AI check ──── */
export function validateSpec(spec) {
  const issues = [];
  if (!spec || typeof spec !== 'object') return ['the worksheet is not an object'];
  if (!Array.isArray(spec.exercises) || !spec.exercises.length) issues.push('there are no exercises');

  (spec.exercises || []).forEach((ex, i) => {
    const at = `exercise ${i + 1} (${ex && ex.type ? ex.type : 'unknown'})`;
    if (!ex || !ex.type) { issues.push(`${at}: no type`); return; }
    if (!ex.instruction) issues.push(`${at}: no instruction`);

    if (ex.type === 'gapfill' || ex.type === 'wordform') {
      const items = ex.items || [];
      if (items.length < 3) issues.push(`${at}: fewer than three items`);
      items.forEach((it, k) => {
        if (!it || !it.q) { issues.push(`${at} item ${k + 1}: no sentence`); return; }
        if (!/_{2,}/.test(it.q)) issues.push(`${at} item ${k + 1}: no gap in the sentence`);
        if (!it.a || !String(it.a).trim()) issues.push(`${at} item ${k + 1}: no answer`);
        if (ex.type === 'wordform' && !it.root) issues.push(`${at} item ${k + 1}: no root word`);
      });
    }

    if (ex.type === 'mcq') {
      const items = ex.items || [];
      if (items.length < 3) issues.push(`${at}: fewer than three questions`);
      items.forEach((it, k) => {
        const o = (it && it.options) || [];
        if (o.length < 3) { issues.push(`${at} item ${k + 1}: fewer than three options`); return; }
        if (new Set(o.map(x => String(x).trim().toLowerCase())).size !== o.length)
          issues.push(`${at} item ${k + 1}: two options are the same`);
        if (typeof it.correct !== 'number' || it.correct < 0 || it.correct >= o.length)
          issues.push(`${at} item ${k + 1}: the answer key points outside the options`);
      });
    }

    if (ex.type === 'match') {
      const p = ex.pairs || [];
      if (p.length < 3) issues.push(`${at}: fewer than three pairs`);
      p.forEach((pair, k) => {
        if (!Array.isArray(pair) || !pair[0] || !pair[1]) issues.push(`${at} pair ${k + 1}: one side is empty`);
      });
      const left = p.map(x => String(x && x[0]).trim().toLowerCase());
      if (new Set(left).size !== left.length) issues.push(`${at}: the same word appears twice on the left`);
    }

    if (ex.type === 'truefalse') {
      const items = ex.items || [];
      if (items.length < 3) issues.push(`${at}: fewer than three statements`);
      items.forEach((it, k) => {
        if (!it || !it.q) issues.push(`${at} item ${k + 1}: no statement`);
        if (typeof it.a !== 'boolean') issues.push(`${at} item ${k + 1}: the answer is not true or false`);
      });
      if (items.length && items.every(x => x && x.a === items[0].a))
        issues.push(`${at}: every statement has the same answer`);
    }

    if (ex.type === 'transform') {
      (ex.items || []).forEach((it, k) => {
        if (!it || !it.q) issues.push(`${at} item ${k + 1}: no original sentence`);
        if (!it || !it.a) issues.push(`${at} item ${k + 1}: no rewritten sentence`);
      });
    }

    if (ex.type === 'writing' || ex.type === 'speaking') {
      if (!(ex.prompts || []).filter(Boolean).length) issues.push(`${at}: no prompts`);
    }
  });

  return issues;
}

/* ── routing ──────────────────────────────────────────────────────── */
export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/ai\/?/, '').replace(/\/+$/, '');

  if (path === 'status') {
    return json(200, { configured: !!KEY, model: KEY ? MODEL : null });
  }

  if (!KEY) {
    return json(503, {
      error: 'not_configured',
      message: 'No Gemini key is set on the server. Add GEMINI_API_KEY in the Netlify environment variables.'
    });
  }

  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = await req.json(); } catch (e) { return json(400, { error: 'bad_json' }); }

  try {
    if (path === 'generate') {
      const spec = await callGemini(generatePrompt(body || {}), 0.8);
      return json(200, { spec, issues: validateSpec(spec), model: MODEL });
    }

    if (path === 'check') {
      const spec = body && body.spec;
      if (!spec) return json(400, { error: 'no_spec' });
      const local = validateSpec(spec);
      const out = await callGemini(checkPrompt(spec, local, body.brief), 0.2);
      const fixed = out && out.fixed ? out.fixed : spec;
      const after = validateSpec(fixed);
      return json(200, {
        ok: !!out.ok && after.length === 0,
        issues: [].concat(local, Array.isArray(out.issues) ? out.issues : []),
        remaining: after,
        fixed,
        model: MODEL
      });
    }

    return json(404, { error: 'unknown_route', path });
  } catch (err) {
    const status = err.status === 429 ? 429 : err.status === 403 ? 403 : 502;
    return json(status, {
      error: 'gemini_failed',
      message: String(err.message || err).slice(0, 400)
    });
  }
};
