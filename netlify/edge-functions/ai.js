/* Worksheet Studio — Gemini proxy.
 *
 * The API key never reaches the browser. The page talks to this function,
 * the function talks to Google. Routes:
 *
 *   GET  /api/ai/status     → is a key configured, and which model
 *   POST /api/ai/generate   → the brief → a worksheet spec
 *   POST /api/ai/check      → {spec, brief} → {ok, issues, fixed}
 *
 * This is an EDGE function, not an ordinary one, and that is deliberate.
 * An ordinary Netlify function is killed after ten seconds, which Gemini
 * regularly exceeds once the brief asks for a long text — the browser
 * then gets a bare 502 from the platform with nothing in it to explain
 * itself. An edge function is allowed forty seconds to answer, and time
 * spent waiting for Google does not count against its CPU budget, which
 * is exactly the shape of this job: wait, then hand the answer on.
 *
 * Required environment variable: GEMINI_API_KEY
 * Optional:                      GEMINI_MODEL (default gemini-3.8-flash)
 */

/* Deno at the edge, Node in the tests. */
function env(name) {
  try { if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get(name) || ''; } catch (e) {}
  try { if (typeof process !== 'undefined' && process.env) return process.env[name] || ''; } catch (e) {}
  return '';
}

/* Read once per request, in the handler, so a key added in the Netlify
   dashboard takes effect without a redeploy. */
let MODEL = 'gemini-3.8-flash';
let KEY = '';

/* We stop waiting a little before the platform would, so the teacher
   gets a sentence instead of a bare gateway error. */
const GIVE_UP_AFTER = 34000;
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
/* Writing a long passage and a dozen exercises in one answer is what used
   to run out of time. The passage is asked for on its own, so a text of
   any length gets a whole budget to itself, and the exercises get
   another. Nobody has to be told how long their text may be. */
function textPrompt(o) {
  const words = o.length || 130;
  const variety = o.variety === 'American' ? 'American' : 'British';
  return [
    `You are an experienced English teacher writing a reading text for a worksheet.`,
    ``,
    `CEFR level: ${o.level || 'B1'}`,
    `Learners: ${o.age || 'adults'}`,
    `Topic: ${o.topic || 'everyday life'}`,
    `Write ${o.genre || 'a short informative article'}.`,
    `Tone: ${o.tone || 'neutral and clear'}.`,
    `Length: about ${words} words. This matters — come within 10% of it.`,
    words > 450 ? `It is a long piece, so give it a clear shape: paragraphs of three to six sentences, one idea each, and a line of white space between them.` : '',
    o.exam ? `The register should suit ${o.exam}.` : '',
    o.grammar ? `Use ${o.grammar} naturally and often — the exercises will practise it.` : '',
    o.vocab ? `Work these in: ${o.vocab}.` : '',
    o.avoid ? `Keep these out of it completely: ${o.avoid}.` : '',
    `Use ${variety} spelling and ${variety} conventions for dates, money and measurements.`,
    `Nothing in it should be unsuitable for ${o.age || 'adults'}.`,
    o.notes ? `Also from the teacher: ${o.notes}` : '',
    ``,
    `Return ONLY valid JSON, no markdown fence:`,
    `{ "title": "a short title for the worksheet", "text": "the passage, with \\n\\n between paragraphs" }`
  ].filter(Boolean).join('\n');
}

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
    o.givenText
      ? `The reading text is ALREADY WRITTEN and is printed at the end of this message. Do not write another one and do not rewrite it — set "text" to null. Every exercise must be answerable from that text or practise its language, and every word you quote from it must be quoted exactly.`
      : o.withText
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
    SCHEMA,
    o.givenText ? `\nTHE TEXT THE EXERCISES MUST BE BUILT FROM:\n${o.givenText}` : ''
  ].filter(Boolean).join('\n');
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
    b.givenText ? `- the reading text was written separately and is already approved: return it UNCHANGED, word for word, and do not shorten it`
      : b.withText && b.length ? `- the reading text should be roughly ${b.length} words (within about 20%)` : '',
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
/* Gemini 3.x Flash thinks before it answers, and the thinking is paid
   for out of the same budget as the answer. Give it too small a budget
   and it spends the lot before writing a word: the reply comes back
   empty, or cut off mid-JSON, with finishReason MAX_TOKENS. So the
   floor here is generous — tokens are only charged if they are used —
   and if it still runs out, the call is made once more with twice as
   much rather than reported as a failure. */
const ROOM = 16384;
const roomFor = words => Math.min(65536, Math.max(ROOM, Math.round(words * 3) + 8192));

async function callGemini(prompt, temperature, maxTokens, retried) {
  let res;
  try {
    res = await fetch(`${ENDPOINT(MODEL)}?key=${encodeURIComponent(KEY)}`, {
    signal: AbortSignal.timeout(GIVE_UP_AFTER),
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        responseMimeType: 'application/json',
        maxOutputTokens: maxTokens || ROOM
      }
    })
    });
  } catch (e) {
    const err = new Error(e && e.name === 'TimeoutError'
      ? 'Gemini took longer than 34 seconds. Ask for a shorter text or fewer exercises and try again.'
      : 'Could not reach Gemini: ' + String(e && e.message || e));
    err.status = 504;
    throw err;
  }

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
  const why = cand.finishReason || '';
  const again = () => callGemini(prompt, temperature, Math.min(65536, (maxTokens || ROOM) * 2), true);

  if (!text) {
    if (why === 'MAX_TOKENS' && !retried) return again();
    throw new Error(why === 'MAX_TOKENS'
      ? 'Gemini spent its whole answer budget before writing anything. Ask for a shorter text or fewer exercises.'
      : 'Gemini returned an empty answer' + (why ? ' (' + why + ')' : ''));
  }

  try {
    return parseLoose(text);
  } catch (e) {
    /* a reply cut off mid-JSON reads exactly like one that was never
       valid, so the finish reason is what tells them apart */
    if (why === 'MAX_TOKENS' && !retried) return again();
    throw new Error(why === 'MAX_TOKENS'
      ? 'Gemini ran out of room and the worksheet came back half-written. Ask for a shorter text or fewer exercises.'
      : String(e.message || e));
  }
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
  MODEL = env('GEMINI_MODEL') || 'gemini-3.8-flash';
  KEY = env('GEMINI_API_KEY');

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/ai\/?/, '').replace(/\/+$/, '');

  if (path === 'status') {
    /* Enough to tell the three ways this can be broken apart without
       anybody having to read a log: no key reached the runtime, the key
       reached it but Google refuses it, or this function was never
       asked in the first place (in which case the answer below is not
       the one that arrives). The key itself is never sent — only
       whether there is one, and how long it is. */
    return json(200, {
      configured: !!KEY,
      model: KEY ? MODEL : null,
      runtime: (typeof Netlify !== 'undefined' && Netlify.env) ? 'edge' : 'node',
      keyLength: KEY ? KEY.length : 0,
      served: 'ai'
    });
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
    if (path === 'text') {
      const o = body || {};
      const words = Math.max(20, Math.round(Number(o.length) || 130));
      /* Room for the answer, with a floor for short ones and a ceiling
         the model will still accept. */
      const out = await callGemini(textPrompt({ ...o, length: words }), 0.85, roomFor(words));
      const text = String(out && out.text || '').trim();
      if (!text) throw new Error('Gemini sent back an empty text');
      return json(200, { title: String(out.title || o.topic || 'Reading'), text,
                         words: text.split(/\s+/).filter(Boolean).length, model: MODEL });
    }

    if (path === 'generate') {
      const o = body || {};
      const spec = await callGemini(generatePrompt(o), 0.8,
        roomFor((o.givenText ? 0 : (Number(o.length) || 0)) + (Number(o.n) || 8) * (o.kinds || []).length * 40));
      /* The passage goes back in exactly as it was written, so nothing
         the model does to it on the way through can shorten it. */
      if (o.givenText) spec.text = o.givenText;
      return json(200, { spec, issues: validateSpec(spec), model: MODEL });
    }

    if (path === 'check') {
      const spec = body && body.spec;
      if (!spec) return json(400, { error: 'no_spec' });
      const local = validateSpec(spec);
      /* the proof-reader hands the whole worksheet back, so it needs
         room for everything it was given, and then some */
      const out = await callGemini(checkPrompt(spec, local, body.brief), 0.2,
        roomFor(JSON.stringify(spec).length / 3));
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
    const status = [429, 403, 504].includes(err.status) ? err.status : 502;
    return json(status, {
      error: 'gemini_failed',
      message: String(err.message || err).slice(0, 400)
    });
  }
};

export const config = { path: '/api/ai/*' };
