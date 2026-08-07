# Worksheet Studio

A worksheet and lesson builder for English teachers — A4 printables, built block by block, exported as a clean vector PDF. Runs in the browser on a Mac, a PC or an iPad. No install, and once a teacher has signed in it keeps working without internet.

**Site:** https://sunny-figolla-4c9069.netlify.app
**Builder:** https://sunny-figolla-4c9069.netlify.app/app.html

## What is in the repository

| File | What it is |
| --- | --- |
| `index.html` | The landing page — Armenian, English and Russian, with the three plans |
| `app.html` | The builder itself: editor, exercise library, PDF export |
| `admin.html` | Private order ledger, and where you set a teacher's plan (`/admin.html`) |
| `netlify/functions/auth.mjs` | The accounts server — registration, sign-in, plans |
| `netlify.toml` | Caching, security headers and the `/app` short URL |
| `robots.txt` | Keeps the admin page out of search engines |

The three pages are plain HTML, CSS and JavaScript in single self-contained files — no build step, nothing to compile. The one moving part is the accounts function, which Netlify runs on the server.

## Features

- **Drag-and-build editor** — 42 block types: headers, instructions, reading texts, multiple choice, true/false, gap-fill, matching, odd-one-out, unscramble, key word transformation, error correction, tables, writing lines, handwriting practice and images.
- **Exercise library — 235 ready-made topics** (215 grammar, 20 vocabulary). Every topic carries a theory card (form · use · signal words) and a full sequence of exercises, ordered from recognition to free production. "Full worksheet" drops the whole sequence on a page with the answer key switched on.
  - A2 · 14 grammar topics — core tenses, articles, question forms
  - B1 · 35 grammar topics — perfect tenses, conditionals, the passive, verb patterns
  - B2 · 36 grammar topics — mixed conditionals, reported speech, modals of deduction
  - C1 · 130 grammar topics — the complete *Advanced Grammar in Use* syllabus, units 1–100, plus the studio's own advanced set
  - 20 vocabulary topics across the four levels — idioms, collocations and academic English
- **Built-in dictionary** — type words into a vocabulary list and definitions and translations fill in automatically, offline.
- **40 A4 designs**, adjustable accent colour, 11 header styles, page backgrounds and fonts.
- **Crossword and word search generators** that build the grid for you.
- **Answer key** generated from the exercises and appended as a final page, with marks totalled.
- **Vector PDF export** — selectable text, sharp at any zoom, no print dialog, no white margins. Long pages split across A4 sheets at block boundaries.
- Multi-page documents, undo/redo, autosave, and project files (`.wsp`) you can save and reopen.

## Publishing

The site is deployed by Netlify, which watches the `main` branch: any commit is live within seconds. To update, replace a file through **Add file → Upload files** on GitHub, or push to `main`.

HTML is served with `must-revalidate`, so a new version appears immediately instead of being masked by the browser cache.

## Plans

Three plans, enforced inside `app.html` by the `PLANS` table:

| | Basic | Pro | Max |
| --- | --- | --- | --- |
| Per month / per year | £5 / £50 | £9 / £90 | £19 / £190 |
| Library | A2 and B1 — 58 topics | all 235 topics | all 235 topics |
| A4 designs | first 8 | all 40 | all 40 |
| Pages per worksheet | 3 | unlimited | unlimited |
| Crossword and word search | — | ✓ | ✓ |
| Your own footer | — | ✓ | ✓ |
| Accounts | 1 | 1 | 5 |

Every new account starts on a seven-day trial with full access. The plan and the date it runs out live on the account, on the server.

Prices live in one object at the foot of `index.html`, and the same numbers are repeated in `admin.html` so the order form fills the amount in for you:

```js
var PRICES = { basic:{m:'£5',y:'£50'}, pro:{m:'£9',y:'£90'}, max:{m:'£19',y:'£190'} };
var PAY    = { basic:{m:'',y:''},     pro:{m:'',y:''},      max:{m:'',y:''} };
```

While the `PAY` links are empty the plan buttons lead to the registration form. Paste checkout URLs into `PAY` when a payment provider is connected.

## Accounts

Every teacher makes their own account: **full name, e-mail, password, repeat password**. Signing in afterwards takes the e-mail and the password, from any device — the account is not tied to one browser.

Registration is on the landing page under `#join` and again as the second tab of the builder's sign-in screen. Both do the same thing, and both drop the teacher straight into the builder: **a new account gets seven days of full access at once**, so nobody waits on you for anything.

| Where | What it does |
| --- | --- |
| `netlify/functions/auth.mjs` | The accounts server: hashes passwords, signs sessions, holds each teacher's plan |
| `package.json` | Only there so Netlify installs `@netlify/blobs` for that function |
| `netlify.toml` | Points `/api/*` at the function |

### The two settings you must add

In Netlify → your site → **Site configuration → Environment variables**:

| Name | Value |
| --- | --- |
| `AUTH_SECRET` | a long random string — it signs the session tokens |
| `ADMIN_PASSWORD` | the password `/admin.html` asks for, at least 8 characters |

Nothing works until both are set; the function says so plainly if they are missing. Changing `AUTH_SECRET` later signs everyone out (their passwords still work).

### How it is put together

Passwords are hashed with **scrypt** and a per-account salt, on the server. The hash never leaves it. A wrong password and an unknown e-mail get the same answer, so the form cannot be used to find out who has an account.

Signing in returns a **session token** — the e-mail and an expiry, signed with `AUTH_SECRET`. The browser keeps it and sends it back; a token edited by hand fails the signature and is refused.

Accounts live in **Netlify Blobs**, which is part of the site already. There is no database to sign up for and no third party involved.

### Offline

The builder opens from the stored session without waiting for the network, then asks the server who you are in the background — so a plan bought this morning appears on the next visit without signing in again. A stored session keeps working offline for **14 days** (`OFFLINE_GRACE_DAYS` in `app.html`); after that it needs one connection to carry on. So the classroom without Wi-Fi still works, and a shared password cannot be used forever without checking in.

When a plan runs out the sign-in screen returns with the date it ended.

### Giving somebody a plan

They register themselves; you decide what they get.

Open `/admin.html`, enter your `ADMIN_PASSWORD` — checked by the server, not by this page — then open the order, type their e-mail, and press **Проверить** to see the account and **Выдать план** to set it. It reaches them by itself.

If the server cannot be reached, the admin page still opens the local order ledger, but cannot grant anything.

### What is not built yet

There is **no "forgot my password" e-mail**, because the site has no mail service. If somebody forgets theirs, they will have to write to you — and today there is no way to reset it for them short of adding one. There is also no e-mail confirmation on sign-up, and no limit on how fast passwords can be guessed. Worth adding before this gets busy.

## A note on access control

Which plan a teacher is on is decided on the server, and the admin password is checked there too, so neither can be changed from the browser.

What is still soft is honesty about sharing: nothing stops two teachers using one login on two laptops. Counting sessions per account would fix that, and is not built.
