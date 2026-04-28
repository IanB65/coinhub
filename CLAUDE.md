# CoinHub — Claude Code Project Guide
**Last updated:** April 2026

> Read this file at the start of every session. It contains everything needed to work on CoinHub without asking Ian to repeat context.

---

## What CoinHub is

A **single-file HTML/CSS/JS gallery website** for Ian's UK coin collection.
- No framework, no build step
- Data lives in a **Google Sheet** (fetched at runtime via Vercel serverless functions)
- Hosted on **Vercel**, served at **coins.ghghome.co.uk**

---

## Working directory

**Always work here:** `C:/Users/ian/Documents/coinhub/`

### Key files
| File | Purpose |
|------|---------|
| `CoinHub_v2.html` | **THE LIVE APP** — this is what's served at coins.ghghome.co.uk |
| `CoinHub_GS.html` | Previous Google Sheets version (superseded by v2) |
| `CoinHub.html` | Legacy Notion-backed file — **do not edit** |
| `index.html` | Redirects `coins.ghghome.co.uk/` → `CoinHub_v2.html` |
| `api/` | Vercel serverless functions (Node.js) |
| `vercel.json` | Vercel routing config |
| `CLAUDE.md` | This file |

---

## Hosting architecture

```
User browser
    │
    ▼
coins.ghghome.co.uk  (Cloudflare DNS — DNS-only CNAME, no proxy)
    │
    ▼
Vercel  (project: ianb65s-projects/coinhub, hobby plan)
    │  auto-deploys on every push to main branch
    ▼
GitHub repo: IanB65/coinhub  (branch: main)
```

**To deploy:** `git add` → `git commit` → `git push` from `C:/Users/ian/Documents/coinhub/`  
Vercel auto-deploys within ~30 seconds. No manual deploy step needed.

**NOT used:** GitHub Pages, Netlify — ignore any related config files.

---

## Google Sheets backend

**Spreadsheet ID:** `1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4`  
**URL:** https://docs.google.com/spreadsheets/d/1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4/edit

### Tabs and columns

**Variants** — one row per coin variant
| Col | Name | Notes |
|-----|------|-------|
| A | variantCode | canonical ID, e.g. `UK-COMM-£2-2026-ZSLL-` |
| B | name | short descriptive name |
| C | denomination | e.g. `50p`, `£2`, `£5` |
| D | collection | e.g. `Commemorative`, `Definitives` |
| E | monarch | `King Charles III` / `Queen Elizabeth II` |
| F | year | 4-digit number |
| G | status | `Got` / `Need` / `List` |
| H | imageUrl | coin image URL |
| I | notes | free text |
| J | dateAdded | YYYY-MM-DD |
| K | lastModified | YYYY-MM-DD |

**Instances** — one row per physical coin owned  
**Images** — supplementary image records  
**Storage** — storage container/location data  
**NewCoinsInbox** — staging area for newly found coins pending approval (see workflow below)  
**ChangeLog, Config, Collections, Conditions, PreservationTypes** — reference/config tabs

### Variant code format
```
UK-{type}-{denom}-{year}-{id}-

UK-D-50P-2025-GRND-        Definitive 50p 2025
UK-COMM-£2-2026-ZSLL-      Commemorative £2 2026 (ZSL London Zoo)
UK-PD-FART-1922-           Pre-decimal Farthing 1922
```
Types: `D` (definitive), `PD` (pre-decimal), `COMM` (commemorative)  
Monarch rule: King Charles III for year ≥ 2023, Queen Elizabeth II for year ≤ 2022

---

## API endpoints (Vercel functions in `api/`)

All endpoints are available at `https://coins.ghghome.co.uk/api/...`

| File | Route | Auth | Purpose |
|------|-------|------|---------|
| `sheets-all.js` | `/api/sheets-all` | JWT | Read all sheet tabs (Variants, Instances, Images, Storage) |
| `sheets-write.js` | `/api/sheets-write` | JWT | Update instance lastStocktake dates in Instances tab |
| `sheets.js` | `/api/sheets` | JWT | General sheet read |
| `images-update.js` | `/api/images-update` | JWT | Update image URLs |
| `numista-sync.js` | `/api/numista-sync` | JWT | Sync coin values from Numista |
| `inbox-stage.js` | `/api/inbox-stage` | Service key | Append new coins to NewCoinsInbox tab (deduplicates against Variants + inbox) |
| `inbox-approve.js` | `/api/inbox-approve` | Service key | Move approved NewCoinsInbox rows → Variants tab, then delete them from inbox |
| `auth/` | `/api/auth/*` | — | Login, logout, guest access, whoami |

### Auth types
- **JWT** — used by the CoinHub web app. Tokens signed with `COINHUB_JWT_SECRET`.
- **Service key** — used by scheduled tasks. Header: `x-service-key: <value>`. Env var: `COINHUB_SERVICE_KEY`.

### Environment variables (set in Vercel project settings)
| Var | Purpose |
|-----|---------|
| `GOOGLE_API_KEY` | Google Sheets read-only API key |
| `GOOGLE_SHEET_ID` | Sheet ID (same as above) |
| `GOOGLE_CLIENT_ID` | OAuth client ID (for write operations) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | OAuth refresh token |
| `COINHUB_JWT_SECRET` | Signs JWT tokens for web app auth |
| `COINHUB_SERVICE_KEY` | Simple shared secret for scheduled task auth |

---

## New coins workflow

New coins are found automatically each week and staged for Ian's review before being written to the sheet.

### Weekly scan (every Monday 9am)
Scheduled task: **`weekly-new-coins-check`** (in Claude Code sidebar → Routines)

What it does:
1. Fetches https://www.royalmint.com/new-coins/ and commemorative pages
2. Searches westminstercollection.co.uk for new UK releases
3. POSTs found coins to `/api/inbox-stage` — automatically skips coins already in Variants or the inbox
4. Reports how many were staged

### Review
Ian opens the Google Sheet → `NewCoinsInbox` tab, reviews staged coins, ticks the `approved` checkbox for any to add.

**NewCoinsInbox columns:** variantCode, name, denomination, collection, monarch, year, imageUrl, sourceUrl, price, approved (checkbox), dateFound

### Approval (manual trigger)
Scheduled task: **`coins-inbox-approve`** (run manually from sidebar)

What it does:
1. Reads all rows in `NewCoinsInbox` where `approved = TRUE`
2. Appends them to `Variants` tab (status = `Need`, dateAdded = today)
3. Deletes the approved rows from `NewCoinsInbox`

---

## Design system

### Fonts
| Font | Use |
|------|-----|
| `Bodoni Moda` | Logo, headings, quantity numbers |
| `Cormorant Garamond` | Body text, coin names |
| `DM Mono` | Codes, labels, UI chrome |

### CSS custom properties
```css
--ink:    #0C0C0A   /* primary text */
--paper:  #F5F2EB   /* page background */
--paper2: #EDE9DF   /* sidebar / alternate rows */
--paper3: #E4DFD2   /* subtle backgrounds */
--gold:   #8B6914   /* brand / primary accent */
--gold2:  #C49A2A   /* interactive gold */
--gold3:  #F0C84A   /* highlight gold */
--got:    #2D6A4F   /* Got — green */
--got-bg: #D8F3DC
--need:   #9B2335   /* Need — red */
--need-bg:#FFE4E8
--list:   #1A3A6B   /* List — blue */
--list-bg:#DBEAFE
--border: #C8BFA8
--muted:  #4A4438
--r:      3px
```

### Style rules
- Parchment / antiquarian aesthetic — warm off-whites, ink tones, gold accents
- No modern/tech UI — no gradients, no heavy shadows
- Grain overlay on `body::before` — do not remove
- Transitions: `0.12s` for most UI

---

## Cross-platform rules

Changes must work on: Windows desktop (Chrome/Edge/Firefox), iOS Safari, Android Chrome.

- Mobile breakpoint: `max-width: 767px`
- Minimum tap target: 44×44px
- `font-size` on `<input>` must be ≥ 16px (prevents iOS Safari zoom)
- Use `100dvh` not `100vh` for full-screen on iOS
- Pair `:hover` with `:active` for touch devices

---

## Critical rules — do not break

1. Use `COTUK_MAP` directly, never `window.COTUK_MAP`
2. Use `coin.variantCode`, never `coin.id` (coin.id does not exist)
3. `INSTANCE_DATA` must be at script level (global), not inside any function
4. `onerror` attributes must be single-line HTML
5. Do not edit `CoinHub.html` (legacy) unless Ian explicitly asks
6. Do not add Netlify/GitHub Pages config — hosting is Vercel only
7. Notion sync is disabled — do not process `.coinhub_sync_queue.json` on session start

---

## Notion (reference only — not actively used)

Notion MCP connects to Ian's **second** Notion account (not primary).  
Coin Variant database: `1bf05769-e1ee-81c7-81dc-000b9d014020`  
Instance database: `1a605769-e1ee-80d2-b868-000b80373e62`  
Parent page: `1a505769-e1ee-806a-883d-c8df0a47b311`  
The Notion sync workflow has been replaced by the Google Sheets backend.
