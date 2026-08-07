/* ════════════════════════════════════════════════════════════════════════
   Worksheet Studio — accounts

   A Netlify Function, so this code runs on the server and not in the
   teacher's browser. That is the whole point: passwords are hashed here
   and never leave here, and the plan a teacher is on is decided here
   too, where nobody can edit it with the developer tools.

   Storage is Netlify Blobs — part of the site already, no database to
   sign up for.

   Two environment variables have to be set in the Netlify dashboard
   (Site configuration → Environment variables):

     AUTH_SECRET     a long random string; it signs the session tokens
     ADMIN_PASSWORD  the password the admin page asks for

   Routes (see the /api/* redirect in netlify.toml):

     POST /api/register      {name, email, password}   → session + account
     POST /api/login         {email, password}         → session + account
     GET  /api/me            Authorization: Bearer …   → account
     POST /api/password      Bearer + {current, next}  → ok
     GET  /api/admin/users   x-admin-password          → every account
     POST /api/admin/plan    x-admin-password + {email, plan, until} → account
   ════════════════════════════════════════════════════════════════════════ */

import { getStore } from '@netlify/blobs';
import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30;
const TRIAL_DAYS = 7;
const PLANS = ['trial', 'basic', 'pro', 'max'];

/* ── helpers ─────────────────────────────────────────────────────────── */

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const hash = (password, salt) => new Promise((resolve, reject) => {
  scrypt(password, salt, SCRYPT.keylen, SCRYPT, (err, key) =>
    err ? reject(err) : resolve(key.toString('base64')));
});

function samePassword(a, b) {
  const x = Buffer.from(a, 'base64'), y = Buffer.from(b, 'base64');
  return x.length === y.length && timingSafeEqual(x, y);
}

const b64url = s => Buffer.from(s).toString('base64url');

function sign(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}

function verify(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = createHmac('sha256', secret).update(body).digest('base64url');
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

const cleanEmail = e => String(e || '').trim().toLowerCase();
const looksLikeEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e);
const addDays = (days, from = Date.now()) => new Date(from + days * 864e5).toISOString().slice(0, 10);

/* What the browser is allowed to know about an account. Never the hash. */
const publicAccount = u => ({
  name: u.name, email: u.email, plan: u.plan, until: u.until, created: u.created
});

/* ── handler ─────────────────────────────────────────────────────────── */

export default async (request) => {
  const SECRET = process.env.AUTH_SECRET;
  if (!SECRET || SECRET.length < 16) {
    return json(500, { error: 'server_not_configured',
      message: 'AUTH_SECRET is not set on this site. Add it in Netlify → Site configuration → Environment variables.' });
  }

  const url = new URL(request.url);
  const route = url.pathname.replace(/^.*\/api\//, '').replace(/\/+$/, '');
  const users = getStore({ name: 'ws-users', consistency: 'strong' });

  let body = {};
  if (request.method === 'POST') {
    try { body = await request.json(); } catch { body = {}; }
  }

  const bearer = () => {
    const h = request.headers.get('authorization') || '';
    return h.startsWith('Bearer ') ? verify(h.slice(7), SECRET) : null;
  };
  const session = email => sign({ e: email, exp: Date.now() + SESSION_DAYS * 864e5 }, SECRET);

  /* ── register ─────────────────────────────────────────────────────── */
  if (route === 'register' && request.method === 'POST') {
    const name = String(body.name || '').trim();
    const email = cleanEmail(body.email);
    const password = String(body.password || '');

    if (name.length < 2) return json(400, { error: 'name', message: 'Please tell us your name.' });
    if (!looksLikeEmail(email)) return json(400, { error: 'email', message: 'That e-mail address does not look right.' });
    if (password.length < 8) return json(400, { error: 'password', message: 'A password needs at least 8 characters.' });

    if (await users.get(email)) {
      return json(409, { error: 'exists', message: 'There is already an account on this e-mail. Sign in instead.' });
    }

    const salt = randomBytes(16).toString('base64');
    const account = {
      name, email,
      salt, hash: await hash(password, salt),
      plan: 'trial',
      until: addDays(TRIAL_DAYS),
      created: new Date().toISOString()
    };
    await users.setJSON(email, account);
    return json(201, { token: session(email), account: publicAccount(account) });
  }

  /* ── log in ───────────────────────────────────────────────────────── */
  if (route === 'login' && request.method === 'POST') {
    const email = cleanEmail(body.email);
    const password = String(body.password || '');
    const account = await users.get(email, { type: 'json' });

    /* One message for both cases, so this cannot be used to find out
       which addresses have accounts. */
    const wrong = { error: 'credentials', message: 'Wrong e-mail or password.' };
    if (!account) { await hash(password, 'decoy'); return json(401, wrong); }
    if (!samePassword(await hash(password, account.salt), account.hash)) return json(401, wrong);

    return json(200, { token: session(email), account: publicAccount(account) });
  }

  /* ── who am I ─────────────────────────────────────────────────────── */
  if (route === 'me' && request.method === 'GET') {
    const s = bearer();
    if (!s) return json(401, { error: 'session', message: 'Please sign in again.' });
    const account = await users.get(s.e, { type: 'json' });
    if (!account) return json(401, { error: 'session', message: 'Please sign in again.' });
    return json(200, { account: publicAccount(account) });
  }

  /* ── change password ──────────────────────────────────────────────── */
  if (route === 'password' && request.method === 'POST') {
    const s = bearer();
    if (!s) return json(401, { error: 'session', message: 'Please sign in again.' });
    const account = await users.get(s.e, { type: 'json' });
    if (!account) return json(401, { error: 'session', message: 'Please sign in again.' });

    const next = String(body.next || '');
    if (next.length < 8) return json(400, { error: 'password', message: 'A password needs at least 8 characters.' });
    if (!samePassword(await hash(String(body.current || ''), account.salt), account.hash)) {
      return json(401, { error: 'credentials', message: 'That is not your current password.' });
    }
    account.salt = randomBytes(16).toString('base64');
    account.hash = await hash(next, account.salt);
    await users.setJSON(account.email, account);
    return json(200, { ok: true });
  }

  /* ── admin ────────────────────────────────────────────────────────── */
  if (route.startsWith('admin/')) {
    const want = process.env.ADMIN_PASSWORD || '';
    const got = request.headers.get('x-admin-password') || '';
    if (!want || want.length < 8) {
      return json(500, { error: 'server_not_configured',
        message: 'ADMIN_PASSWORD is not set on this site (it must be at least 8 characters).' });
    }
    if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
      return json(401, { error: 'admin', message: 'Wrong admin password.' });
    }

    if (route === 'admin/users' && request.method === 'GET') {
      const { blobs } = await users.list();
      const all = await Promise.all(blobs.map(b => users.get(b.key, { type: 'json' })));
      return json(200, { users: all.filter(Boolean).map(publicAccount) });
    }

    if (route === 'admin/plan' && request.method === 'POST') {
      const email = cleanEmail(body.email);
      const plan = String(body.plan || '');
      if (!PLANS.includes(plan)) return json(400, { error: 'plan', message: 'Unknown plan.' });
      const account = await users.get(email, { type: 'json' });
      if (!account) return json(404, { error: 'nobody', message: 'No account on that e-mail.' });
      account.plan = plan;
      account.until = String(body.until || '').slice(0, 10) || account.until;
      await users.setJSON(email, account);
      return json(200, { account: publicAccount(account) });
    }
  }

  return json(404, { error: 'route', message: 'Unknown request.' });
};
