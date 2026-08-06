# Worksheet Studio

A worksheet and lesson builder for English teachers — A4 printables, built block by block, exported as a clean vector PDF. Runs in the browser on a Mac, a PC or an iPad. No install, no account, no internet required once the page has loaded.

**Site:** https://sunny-figolla-4c9069.netlify.app
**Builder:** https://sunny-figolla-4c9069.netlify.app/app.html

## What is in the repository

| File | What it is |
| --- | --- |
| `index.html` | The landing page — Armenian, English and Russian, with the three plans |
| `app.html` | The builder itself: editor, exercise library, PDF export |
| `admin.html` | Private order ledger and licence-key generator (`/admin.html`, password in the script) |
| `netlify.toml` | Caching, security headers and the `/app` short URL |
| `robots.txt` | Keeps the admin page out of search engines |

Everything is plain HTML, CSS and JavaScript in single self-contained files. There is no build step and no external dependency: upload the files and they are live.

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
| Licence keys | 1 | 1 | 5 |

Every plan starts with a free seven-day trial, taken from the lock screen; the trial has Pro access and its start date is kept in the browser.

Prices live in one object at the foot of `index.html`, and the same numbers are repeated in `admin.html` so the order form fills the amount in for you:

```js
var PRICES = { basic:{m:'£5',y:'£50'}, pro:{m:'£9',y:'£90'}, max:{m:'£19',y:'£190'} };
var PAY    = { basic:{m:'',y:''},     pro:{m:'',y:''},      max:{m:'',y:''} };
```

While the `PAY` links are empty the plan buttons simply open the builder, where the licence key is entered. Paste checkout URLs into `PAY` when a payment provider is connected.

## Licence keys

Access is granted by hand: you issue a key from `admin.html` and send it to the teacher.

A key looks like `WS-P3DD-X9BY` — eight characters carrying the plan letter (`B`, `P`, `M`), the expiry date and a two-character checksum. `app.html` verifies it arithmetically, so there is no server and no account: the teacher types the key once and it is remembered in that browser. **The key stops working on its own the day it expires** — nothing to revoke by hand.

To issue one: open `/admin.html` → **＋ Заказ** → choose the plan and period → **Создать** → **Скопировать письмо**. The message comes out in the buyer's language, with the link and the key in it.

Both files must keep the same three constants — `KA`, `KSALT` and `KEPOCH`. Changing `KSALT` invalidates every key already issued.

## A note on access control

The key checksum in `app.html` and the password in `admin.html` live in the page source, so anyone who opens the developer tools can read them and mint their own key. They stop casual sharing between colleagues, which is what most of this is for — they are not security. Real enforcement needs a server-side check (a licence API or a Netlify Function), which is not part of this repository yet.
