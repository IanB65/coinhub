# CoinHub GS — Rebuild Handover

Last updated: April 2026  
Live URL: https://coins.ghghome.co.uk/CoinHub_GS.html

---

## What This Is

A single-file HTML/CSS/JS coin collection gallery for a UK coin collection.  
Backend is **Google Sheets** (no database, no framework, no build step).  
Hosted on **Vercel**, deployed automatically on every push to `main`.

---

## Repository & Working Directory

- **GitHub repo:** `IanB65/coinhub`
- **Local working directory:** `C:/Users/ian/Documents/coinhub/`
- **Primary file:** `CoinHub_GS.html` ← all work goes here
- **Legacy file:** `CoinHub.html` (old Notion-backed version, do not edit)
- **Deploy:** `git add`, `git commit`, `git push` from `C:/Users/ian/Documents/coinhub/`
- Vercel auto-deploys on every push to `main` → live within ~30 seconds

---

## Hosting

| Layer | Detail |
|-------|--------|
| Host | Vercel (project: `ianb65s-projects/coinhub`, hobby plan) |
| Domain | `coins.ghghome.co.uk` |
| DNS | Cloudflare (DNS-only CNAME → Vercel) |
| Deploy trigger | Push to `main` branch of `IanB65/coinhub` |

---

## Architecture

```
Google Sheets (source of truth)
    ↓  read via /api/sheets-all  (API key, read-only)
    ↓  write via /api/sheets-write  (OAuth refresh token, write)
CoinHub_GS.html  (single file, all JS/CSS embedded)
    ↓  served as static file by Vercel
    ↓  API routes: /api/*.js  (Vercel serverless functions)
Browser (localStorage used for cache + stock check state)
```

---

## Google Sheets Structure

**Sheet ID** is in Vercel env var `GOOGLE_SHEET_ID`.

Three tabs:

### Variants tab
| Col | Index | Field |
|-----|-------|-------|
| A | 0 | variantCode (e.g. `UK-D-50P-2023-DORMP-`) |
| B | 1 | name |
| C | 2 | denomination |
| D | 3 | collection |
| E | 4 | monarch |
| F | 5 | year |
| G | 6 | status (Got/Need/List) |
| H | 7 | imageUrl |

### Instances tab
| Col | Index | Field |
|-----|-------|-------|
| A | 0 | instanceId (e.g. `INS-1158`) |
| B | 1 | variantCode |
| C | 2 | location |
| D | 3 | storage1 |
| E | 4 | storage2 |
| F | 5 | storage3 |
| G | 6 | condition |
| H | 7 | preservationType |
| I | 8 | description |
| J | 9 | notes |
| K | 10 | (unused) |
| L | 11 | lastStocktake (YYYY-MM-DD) ← written by sheets-write API |
| M | 12 | (unused) |
| N | 13 | lastEdited |

### Images tab
| Col | Index | Field |
|-----|-------|-------|
| A | 0 | variantCode |
| B | 1 | imageUrl |

---

## API Endpoints

### `/api/sheets-all` (GET)
- Fetches all three tabs in one request
- Uses `GOOGLE_API_KEY` (read-only)
- Returns `{ variants: [], instances: [], images: [] }`
- Results cached in localStorage for performance (`GS_CACHE_KEY`)

### `/api/sheets-write` (POST)
- Writes stock check dates back to Instances tab column L
- Uses OAuth refresh token (see env vars below)
- Body: `{ updates: [{ insId: "INS-1158", date: "2026-04-22" }] }`
- Returns `{ updated: N }`

### `/api/sheets` (GET, legacy)
- Single-tab CSV reader, not used by GS version

---

## Vercel Environment Variables

All set in Vercel dashboard → Settings → Environment Variables.

| Variable | Purpose |
|----------|---------|
| `GOOGLE_SHEET_ID` | ID of the Google Sheet (from its URL) |
| `GOOGLE_API_KEY` | API key for read-only access |
| `GOOGLE_CLIENT_ID` | OAuth client ID for write access |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret for write access |
| `GOOGLE_REFRESH_TOKEN` | OAuth refresh token for write access |

### How OAuth credentials were obtained
1. Google Cloud Console → project `coinhub` (ID: `coinhub-493708`)
2. Google Auth Platform → Clients → OAuth client `coinhub` (Web application)
3. Authorized redirect URI: `https://developers.google.com/oauthplayground`
4. Refresh token obtained via [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) with own credentials checked
5. Scope used: `https://www.googleapis.com/auth/spreadsheets`
6. Consent screen type: **Internal** (org account: `ian@ghghome.co.uk`)

**If the refresh token expires or stops working:**
1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Click ⚙ gear → check "Use your own OAuth credentials"
3. Enter Client ID and Secret from Vercel env vars
4. Select scope `https://www.googleapis.com/auth/spreadsheets` → Authorise APIs
5. Sign in as `ian@ghghome.co.uk`
6. Exchange code for tokens → copy new refresh token
7. Update `GOOGLE_REFRESH_TOKEN` in Vercel → Redeploy

---

## Design System

- **Aesthetic:** Parchment/antiquarian (NOT modern/tech)
- **Fonts:** Bodoni Moda (headings), Cormorant Garamond (body), DM Mono (codes/dates)
- **Colors:**
  - `--ink: #0C0C0A`
  - `--paper: #F5F2EB`
  - `--gold: #8B6914`
  - `--got: #2D6` (green, owned)
  - `--need: #E55` (red, wanted)

---

## Key Data Structures (in-memory)

```js
COTUK_MAP        // { variantCode: imageUrl } — built from Images tab
INSTANCE_DATA    // { variantCode: [{ id, loc, s1, s2, s3, cond, ptype, desc, notes, lastStocktake, lastEdited }] }
ALL_COINS        // Array of variant objects built from Variants tab
_scChecked       // { instanceId: "YYYY-MM-DD" } — stock check dates (localStorage + seeded from sheet)
```

---

## Stock Check Feature

- **Modal:** opened via ⊙ button in header
- **Per-device storage:** `_scChecked` in `localStorage` key `coinhub_stockcheck`
- **Cross-device sync:** on page load, `_seedScCheckedFromInstances()` seeds `_scChecked` from `lastStocktake` (column L) for any instance not already checked locally
- **Write-back:** `_scSyncToSheets(updates)` POSTs to `/api/sheets-write` on every toggle, Check All, and Clear All
- **Instance detail view:** Stock Check date shown under Preservation in the variant detail panel

---

## Critical Rules (do not break)

1. Always edit `CoinHub_GS.html`, never `CoinHub.html`
2. Working directory is `C:/Users/ian/Documents/coinhub/` — NOT the Desktop copy
3. Deploy by pushing to `main` — Vercel does the rest
4. Use `coin.variantCode` not `coin.id` (coin.id does not exist)
5. `INSTANCE_DATA` must be global (script-level), not inside a function
6. `onerror` attributes in HTML must be single-line
7. Monarch name casing: `'King George Vi'` — lowercase `i` is intentional

---

## Pending Features (not yet built)

- Collection progress bars (sidebar)
- Collection overview page (card grid)
- Mobile responsive improvements
- Export to CSV
