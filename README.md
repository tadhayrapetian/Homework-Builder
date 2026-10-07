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

Three plans, enforced inside `app.html` by the `PLANS` table. **Every plan opens all four levels** — A2, B1, B2 and C1 are all there on Basic. What grows with the plan is how many topics inside each level are unlocked, set by `share` (0.34 · 0.68 · 1). The share is taken from the front of each level, so a teacher always sees the same topics rather than a set that shuffles between visits.

| | Basic | Pro | Max |
| --- | --- | --- | --- |
| Per month / per year | £5 / £50 | £9 / £90 | £19 / £190 |
| Library | all four levels, 85 topics | all four levels, 165 topics | all 235 topics |
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

### A site with no accounts server

Until `AUTH_SECRET` is set — or if the function is not deployed at all — **the builder simply opens with everything unlocked**. The lock exists to protect a subscription, and there is no subscription to protect while the server is not answering, so there is nothing to sign in to.

The moment the server does answer, the lock comes back. A device that has met a working accounts server records that fact (`ws_server` in its browser storage) and keeps asking for a password from then on, so a subscriber cannot get free access by cutting their internet.

The registration form on the landing page does the same: if accounts are not switched on, it says so and sends the visitor into the builder instead of failing.

### The two settings you must add

In Netlify → your site → **Site configuration → Environment variables**:

| Name | Value |
| --- | --- |
| `AUTH_SECRET` | a long random string — it signs the session tokens |
| `ADMIN_PASSWORD` | the password `/admin.html` asks for, at least 8 characters |

Nothing works until both are set; the function says so plainly if they are missing. Changing `AUTH_SECRET` later signs everyone out (their passwords still work).

### Confirming the e-mail address

New teachers can be made to confirm their address with a six-digit code before the account exists. To switch that on, add **one** mail provider and the address the code is sent from:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | a key from [resend.com](https://resend.com) — needs a domain you own |
| `BREVO_API_KEY` | or a key from [brevo.com](https://www.brevo.com) — free, and a single sender address can be verified without owning a domain |
| `MAIL_FROM` | who the e-mail is from, e.g. `Worksheet Studio <hello@yourdomain.com>` |

**Until one of those keys is set, sign-up works exactly as it did** and no code is asked for. Nothing breaks while you are still deciding on a provider.

How it behaves once it is on:

1. The sign-up form posts to `/api/register`. No account is made — the name, address and password hash wait in a separate store, together with an **HMAC of the code**. The code itself is never written down, so a stolen copy of the store contains no working code.
2. The teacher types the six digits. The field accepts digits only and sends itself as soon as the sixth one lands.
3. `/api/verify` creates the real account and signs them in.
4. A code lasts **15 minutes** and survives **five** wrong guesses. After that it is destroyed and the sign-up starts again.
5. **Send the code again** is allowed once a minute, on the server as well as in the page.

The same two-step flow is on the landing page and on the builder's own lock screen.

## The AI generator

The **Generate** button has three tabs. Two of them — a bank of graded texts, and your own pasted text — work offline and need nothing. The third writes a worksheet with **Gemini**, then sends it back to Gemini to be proof-read, and repairs what the check finds.

To switch that third tab on, add one more environment variable:

| Variable | What it is |
|---|---|
| `GEMINI_API_KEY` | a key from [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | optional; defaults to `gemini-3.8-flash` |

The key lives on the server only. The page never sees it: the browser calls `/api/ai/…`, that function calls Google. Putting the key in the page instead would publish it to anyone who opens the site.

**It is an edge function, not an ordinary one** (`netlify/edge-functions/ai.js`). An ordinary Netlify function is killed after ten seconds, and Gemini regularly needs longer once the brief asks for a three-hundred-word text — what reached the browser then was a bare `502` from the platform with nothing in it to explain itself. An edge function is given forty seconds to answer, and time spent waiting for Google does not count against its CPU budget, which is exactly this job. It gives up by itself at thirty-four seconds so the teacher gets a sentence rather than a gateway error.

Edge functions are claimed before redirects, so `/api/ai/*` is **not** in the redirect list in `netlify.toml`; it is declared in `[[edge_functions]]` and in the function's own `config`. Everything else under `/api/` still goes to the ordinary accounts function.

Without the key, the AI tab says so and stays disabled; nothing else changes.

**What you can ask it for**

The AI tab is a brief, not a text box. Everything on it reaches the model and the proof-reader alike:

| | |
|---|---|
| Level | A2 · B1 · B2 · C1 |
| Age group | 7–10 · 11–13 · 14–17 · adults · university · professionals · older adults |
| What the lesson is for | presenting · practice · revision · test · homework · warm-up · cover lesson |
| Exam focus | none · A2 Key · B1 Preliminary · B2 First · C1 Advanced · IELTS · TOEFL |
| Kind of text | article · story · dialogue · email · blog · review · interview · report · advert |
| Text length | **any number of words you type** — no ceiling |
| Tone | neutral · friendly · formal · light · serious |
| Spelling | British or American |
| Grammar to practise | free text — the text and the exercises are built around it |
| Vocabulary to include | free text — each item must appear at least once |
| Keep out of it | free text — removed if the model slips it in |

The second pass is given the same brief, so it checks the worksheet against what was asked for and not only against itself.

**How a worksheet is made**

While it runs, the panel shows which step it is on, how long it has taken and what it is doing.

The passage is asked for **on its own**, and the exercises are asked for afterwards against that passage. That is what makes the length free: a thousand-word text is two ordinary requests rather than one enormous one, and each gets a whole budget to itself. The passage the teacher asked for is also put back into the worksheet verbatim, so neither the second pass nor the proof-reader can quietly shorten it.

1. Gemini writes a worksheet as structured JSON — reading text, exercises, answers.
2. The app checks it with its own rules: every gap has an answer, every multiple-choice key points at a real option, no two options identical, no exercise with fewer than three items, true/false not all the same.
3. Gemini is asked to proof-read its own work, and is given whatever the automatic check flagged.
4. The repaired version is checked again. Anything still wrong is **left out** and named on screen, rather than printed as a broken exercise.

That last step matters: the model is not trusted to mark its own homework. The deterministic check runs on both sides of it.

**If it says it is not working**, the panel says which of the three things went wrong rather than making you guess:

- *"The AI endpoint is not on this site"* — the edge function did not deploy and the request fell through to the accounts function. Redeploy, and check `netlify.toml` still has the `[[edge_functions]]` entry.
- *"no key reached it (running as the edge function)"* — `GEMINI_API_KEY` must be scoped to Functions, and must **not** be marked as a secret: a secret value is not handed to an edge function. Redeploy after changing it.
- *"[generate · 502] …"* — the key is fine and Google answered with that. The step and the status are in the brackets.

Gemini 3.x Flash thinks before it answers and pays for the thinking out of the same budget as the answer, so too small a budget comes back empty or cut off mid-JSON. The floor is 16384 tokens, it grows with the length asked for, and a reply that still runs out is simply asked for again with twice as much.

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

## Printing and PDF

A page in the builder grows as you fill it. A sheet of paper does not, and that difference is where worksheets used to break: whatever did not fit was simply cut off — half an exercise at the foot of a sheet, its first questions gone, and the footer printed across whatever was still underneath.

Now a block that will not fit is **cut between its own rows** — between the sentences of a gap-fill, the paragraphs of a reading text, and, for a wall of text with nothing else to break between, its lines. Nothing is clipped and nothing is lost. The rules it follows:

- An instruction card never ends up alone at the foot of a page; it travels with the exercise it introduces.
- A block is kept whole when moving it down costs little. If keeping it whole would leave more than a third of the sheet empty, it is broken instead and carries on overleaf, the way a document does.
- The footer gets its own strip; content stops above it.
- The reading text is never shortened to make something fit.

The same splitter serves the PDF export (both the vector and the image mode), the **Print** button and the **Pages** panel, which says how many A4 sheets the worksheet will actually come out as. They cannot disagree, because there is only one of it.

## A note on access control

Which plan a teacher is on is decided on the server, and the admin password is checked there too, so neither can be changed from the browser.

What is still soft is honesty about sharing: nothing stops two teachers using one login on two laptops. Counting sessions per account would fix that, and is not built.
