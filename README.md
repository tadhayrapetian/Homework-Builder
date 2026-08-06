# Worksheet Studio

A worksheet and lesson builder for English teachers — A4 printables, built block by block, exported as a clean vector PDF. Runs in the browser on a Mac, a PC or an iPad. No install, no account, no internet required once the page has loaded.

**Site:** https://sunny-figolla-4c9069.netlify.app
**Builder:** https://sunny-figolla-4c9069.netlify.app/app.html

## What is in the repository

| File | What it is |
| --- | --- |
| `index.html` | The landing page — Armenian, English and Russian, with pricing |
| `app.html` | The builder itself: editor, exercise library, PDF export |
| `admin.html` | Private order ledger (`/admin.html`, password in the script) |
| `netlify.toml` | Caching, security headers and the `/app` short URL |
| `robots.txt` | Keeps the admin page out of search engines |

Everything is plain HTML, CSS and JavaScript in single self-contained files. There is no build step and no external dependency: upload the files and they are live.

## Features

- **Drag-and-build editor** — 42 block types: headers, instructions, reading texts, multiple choice, true/false, gap-fill, matching, odd-one-out, unscramble, key word transformation, error correction, tables, writing lines, handwriting practice and images.
- **Exercise library — 235 ready-made topics.** Grammar from A2 to C1 plus topic vocabulary, idioms and academic English. Every topic carries a theory card (form · use · signal words) and a full sequence of exercises, ordered from recognition to free production. "Full worksheet" drops the whole sequence on a page with the answer key switched on.
  - A2 · 14 topics — core tenses, articles, question forms
  - B1 · 35 topics — perfect tenses, conditionals, the passive, verb patterns
  - B2 · 36 topics — mixed conditionals, reported speech, modals of deduction
  - C1 · 130 topics — the complete *Advanced Grammar in Use* syllabus, units 1–100, plus the studio's own advanced set
- **Built-in dictionary** — type words into a vocabulary list and definitions and translations fill in automatically, offline.
- **40 A4 designs**, adjustable accent colour, 11 header styles, page backgrounds and fonts.
- **Crossword and word search generators** that build the grid for you.
- **Answer key** generated from the exercises and appended as a final page, with marks totalled.
- **Vector PDF export** — selectable text, sharp at any zoom, no print dialog, no white margins. Long pages split across A4 sheets at block boundaries.
- Multi-page documents, undo/redo, autosave, and project files (`.wsp`) you can save and reopen.

## Publishing

The site is deployed by Netlify, which watches the `main` branch: any commit is live within seconds. To update, replace a file through **Add file → Upload files** on GitHub, or push to `main`.

HTML is served with `must-revalidate`, so a new version appears immediately instead of being masked by the browser cache.

## Pricing and payment links

Prices and checkout URLs are five constants at the foot of `index.html`:

```js
var PRICE_MONTHLY = '£6',  PRICE_YEARLY = '£60';
var PAY_MONTHLY   = '',    PAY_YEARLY   = '';
```

While the payment links are empty the subscribe button simply opens the builder.

## A note on access control

The access code in `app.html` and the password in `admin.html` live in the page source, so anyone who opens the developer tools can read them. They are a convenience, not security. Real subscription enforcement needs a server-side check — a licence-key API or serverless function — which is not part of this repository yet.
