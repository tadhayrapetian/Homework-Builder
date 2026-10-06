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

   To make new teachers confirm their e-mail with a six-digit code, set
   one of these as well. Without either, registration works as it always
   did and no code is asked for, so nothing breaks before you set it up.

     RESEND_API_KEY  a key from resend.com, or
     BREVO_API_KEY   a key from brevo.com (free, and a single sender
                     address can be verified without owning a domain)
     MAIL_FROM       the address the code is sent from, e.g.
                     "Worksheet Studio <hello@yourdomain.com>"

   Routes (see the /api/* redirect in netlify.toml):

     POST /api/register      {name, email, password}   → code sent, or
                                                       session + account
     POST /api/verify        {email, code}             → session + account
     POST /api/resend        {email}                   → code sent again
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
const CODE_MINUTES = 15;   // how long a confirmation code stays good for
const CODE_TRIES = 5;      // wrong guesses before the code is burned
const RESEND_WAIT = 60;    // seconds between two e-mails to one address

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

/* ── the confirmation code ───────────────────────────────────────────
   The code itself is never stored — only an HMAC of it, the same way a
   password is never stored. A stolen copy of the database therefore
   gives nobody a working code. */

const sixDigits = () => String(randomBytes(4).readUInt32BE(0) % 1e6).padStart(6, '0');
const codeMac = (email, code, secret) =>
  createHmac('sha256', secret).update(email + ':' + code).digest('base64url');

function mailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  return null;
}

function codeEmail(name, code) {
  const who = name ? name.split(/\s+/)[0] : 'there';
  return {
    subject: code + ' is your Worksheet Studio code',
    text: `Hello ${who},\n\nYour confirmation code is ${code}\n\n`
        + `Type it on the sign-up page to finish creating your account. `
        + `It stops working in ${CODE_MINUTES} minutes.\n\n`
        + `If you did not ask for an account, you can ignore this e-mail.\n`,
    html: `<div style="font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;padding:28px 24px;color:#241a12">
      <p style="margin:0 0 18px;font-size:15px">Hello ${esc(who)},</p>
      <p style="margin:0 0 10px;font-size:15px">Your confirmation code is</p>
      <p style="margin:0 0 18px;font-size:34px;font-weight:700;letter-spacing:.18em;color:#a5661f">${code}</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6">Type it on the sign-up page to finish creating your account. It stops working in ${CODE_MINUTES} minutes.</p>
      <p style="margin:0;font-size:13px;color:#7a6a5c">If you did not ask for an account, you can ignore this e-mail.</p>
    </div>`
  };
}

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sendCode(to, name, code) {
  const from = process.env.MAIL_FROM || 'Worksheet Studio <onboarding@resend.dev>';
  const mail = codeEmail(name, code);
  const provider = mailProvider();

  if (provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json',
                 authorization: 'Bearer ' + process.env.RESEND_API_KEY },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text, html: mail.html })
    });
    if (!r.ok) throw new Error('mail: ' + (await r.text()).slice(0, 180));
    return;
  }

  if (provider === 'brevo') {
    /* MAIL_FROM may be "Name <address>" or just the address. */
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    const sender = m ? { name: m[1] || 'Worksheet Studio', email: m[2] } : { name: 'Worksheet Studio', email: from };
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json',
                 'api-key': process.env.BREVO_API_KEY },
      body: JSON.stringify({ sender, to: [{ email: to, name }], subject: mail.subject,
                             textContent: mail.text, htmlContent: mail.html })
    });
    if (!r.ok) throw new Error('mail: ' + (await r.text()).slice(0, 180));
    return;
  }

  throw new Error('no mail provider');
}

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
  const waiting = getStore({ name: 'ws-pending', consistency: 'strong' });

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
    const draft = { name, email, salt, hash: await hash(password, salt) };

    /* No mail provider on the site yet: make the account straight away,
       exactly as before, rather than locking people out of signing up. */
    if (!mailProvider()) {
      const account = { ...draft, plan: 'trial', until: addDays(TRIAL_DAYS),
                        created: new Date().toISOString() };
      await users.setJSON(email, account);
      return json(201, { token: session(email), account: publicAccount(account) });
    }

    const code = sixDigits();
    try {
      await sendCode(email, name, code);
    } catch (e) {
      return json(502, { error: 'mail',
        message: 'We could not send the confirmation code to that address. Check it is spelt right, or try again in a minute.' });
    }

    await waiting.setJSON(email, {
      ...draft,
      code: codeMac(email, code, SECRET),
      expires: Date.now() + CODE_MINUTES * 60000,
      tries: 0,
      sent: Date.now()
    });
    return json(202, { pending: true, email, minutes: CODE_MINUTES });
  }

  /* ── confirm the code ─────────────────────────────────────────────── */
  if (route === 'verify' && request.method === 'POST') {
    const email = cleanEmail(body.email);
    const code = String(body.code || '').replace(/\D/g, '');
    const draft = await waiting.get(email, { type: 'json' });

    if (!draft) return json(410, { error: 'expired',
      message: 'That code has run out. Start the sign-up again and we will send a new one.' });

    if (draft.expires < Date.now()) {
      await waiting.delete(email);
      return json(410, { error: 'expired',
        message: 'That code has run out. Start the sign-up again and we will send a new one.' });
    }

    const want = Buffer.from(draft.code), got = Buffer.from(codeMac(email, code, SECRET));
    if (code.length !== 6 || want.length !== got.length || !timingSafeEqual(want, got)) {
      draft.tries = (draft.tries || 0) + 1;
      if (draft.tries >= CODE_TRIES) {
        await waiting.delete(email);
        return json(429, { error: 'burned',
          message: 'Too many wrong codes. Start the sign-up again and we will send a new one.' });
      }
      await waiting.setJSON(email, draft);
      const left = CODE_TRIES - draft.tries;
      return json(401, { error: 'code',
        message: 'That code is not right. ' + left + ' ' + (left === 1 ? 'try' : 'tries') + ' left.' });
    }

    /* Somebody may have registered this address while the code sat unused. */
    if (await users.get(email)) {
      await waiting.delete(email);
      return json(409, { error: 'exists', message: 'There is already an account on this e-mail. Sign in instead.' });
    }

    const account = {
      name: draft.name, email, salt: draft.salt, hash: draft.hash,
      plan: 'trial', until: addDays(TRIAL_DAYS),
      created: new Date().toISOString(), verified: true
    };
    await users.setJSON(email, account);
    await waiting.delete(email);
    return json(201, { token: session(email), account: publicAccount(account) });
  }

  /* ── send the code again ──────────────────────────────────────────── */
  if (route === 'resend' && request.method === 'POST') {
    const email = cleanEmail(body.email);
    const draft = await waiting.get(email, { type: 'json' });
    if (!draft) return json(410, { error: 'expired',
      message: 'There is nothing waiting on that address. Start the sign-up again.' });

    const wait = Math.ceil((draft.sent + RESEND_WAIT * 1000 - Date.now()) / 1000);
    if (wait > 0) return json(429, { error: 'slow',
      message: 'One e-mail a minute, please. Try again in ' + wait + ' seconds.' });

    const code = sixDigits();
    try {
      await sendCode(email, draft.name, code);
    } catch (e) {
      return json(502, { error: 'mail', message: 'We could not send that e-mail. Try again in a minute.' });
    }
    draft.code = codeMac(email, code, SECRET);
    draft.expires = Date.now() + CODE_MINUTES * 60000;
    draft.tries = 0;
    draft.sent = Date.now();
    await waiting.setJSON(email, draft);
    return json(200, { pending: true, email, minutes: CODE_MINUTES });
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
