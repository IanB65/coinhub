# CoinHub — Migration & Setup Guide

> **Last updated:** 24 March 2026
> **Project state:** MVP complete — 1,430+ variants, 1,496 physical instances, 25 collections

---

## What Is This Project?

CoinHub is Ian's personal UK coin collection management tool. It is a **single self-contained HTML file** (`CoinHub.html`) served by a **lightweight Python auth server** (`auth_server.py`). There is no framework, no build step, and no database engine — everything runs with Python's standard library only.

### What it does:
- Displays a searchable, filterable, sortable gallery of 1,430+ UK coin variants
- Tracks 1,496 physical coin instances (which coins Ian owns, where they are stored, condition, etc.)
- Authenticates access with email + password (PBKDF2-HMAC-SHA256) + optional TOTP 2FA
- Syncs changes back to Ian's Notion database via a queue mechanism
- Has an antiquarian parchment UI with Bodoni Moda / Cormorant Garamond typography

---

## Files In This Project

| File | Purpose | Secret? |
|---|---|---|
| `CoinHub.html` | Main app — all UI, data, logic | No |
| `auth_server.py` | Auth + HTTP file server | No |
| `.coinhub_auth` | Login credentials (email, pw hash, TOTP secret) | **YES** |
| `.coinhub_config` | Notion API token + database IDs | **YES** |
| `.coinhub_sync_queue.json` | Pending Notion sync operations (runtime state) | No |
| `.coinhub_auth.example` | Template for `.coinhub_auth` | No |
| `.coinhub_config.example` | Template for `.coinhub_config` | No |

> `.coinhub_auth` and `.coinhub_config` are in `.gitignore` and must **never** be committed or shared.
> They must be **manually copied** to the new machine.

---

## Setting Up on a Fresh Machine

### Requirements
- **Python 3.9 or later** (no pip packages required — stdlib only)
- A web browser (Chrome/Firefox recommended)
- The Notion API integration already set up (see §Notion below)

### Step 1 — Copy the files

Copy these 6 files to a folder on the new machine (e.g. `~/coinhub/`):

```
CoinHub.html
auth_server.py
.coinhub_auth          ← copy manually (secret)
.coinhub_config        ← copy manually (secret)
.coinhub_sync_queue.json
```

The `.claude/` folder is only needed if continuing development with Claude Code.
`.coinhub_*.example` files are reference only — not needed at runtime.
`*.md` files are documentation only — not needed at runtime.

### Step 2 — Verify Python version

```bash
python --version
# Must be 3.9+
```

### Step 3 — Start the server

```bash
cd ~/coinhub
python auth_server.py
# Output: [CoinHub] http://localhost:8090  |  Ready
```

### Step 4 — Open in browser

Navigate to: `http://localhost:8090`

You will see the CoinHub login page. Log in with:
- Email from `.coinhub_auth`
- Your password (the `pw_hash` field was created during first-time setup)
- TOTP code if `totp_enabled: true` (use Google Authenticator / Authy with the `totp_secret`)

### Step 5 — Check the sync queue

On first launch, check `.coinhub_sync_queue.json`. If it contains items, the server will process them against Notion on the next authenticated request. If there are stale/empty entries (variantCode is `""`), clear the file to `[]` manually.

---

## Notion Integration

CoinHub syncs to Ian's Notion workspace. The Notion integration is connected via Claude Code's MCP server — this is used during **development sessions**, not at runtime.

At runtime, `auth_server.py` makes direct Notion API calls using the token in `.coinhub_config`.

**If starting fresh with a new Notion workspace:**
1. Create a Notion integration at `https://www.notion.so/my-integrations`
2. Share the relevant databases with the integration
3. Update `.coinhub_config` with the new token and database UUIDs
4. See `.coinhub_config.example` for the required JSON structure

**Existing Notion databases (as of March 2026):**
- `variant` — coin variant records (one per design)
- `instance` — physical coin records (one per coin Ian owns)
- `storage_container` — box/binder level
- `storage_page` — page within a container
- `storage_slot` — slot within a page
- `location` — physical location (room/shelf)

---

## Architecture Notes

### CoinHub.html — key structure

The HTML file has three global data sections near the top of the `<script>` block:

1. **`COTUK_MAP`** — `{ variantCode: imageUrl }` — 646 image mappings
2. **`INSTANCE_DATA`** — `{ variantCode: [instances...] }` — 1,496 physical coin records
3. **`RAW`** — array of coin variant rows, built inside `buildCoinData()`

**Critical rules (bugs previously fixed — never reintroduce):**
- Always reference `COTUK_MAP` directly — never `window.COTUK_MAP` (const doesn't attach to window)
- Always use `coin.variantCode` — never `coin.id` (coin objects have no `.id` property)
- `INSTANCE_DATA` must be declared at global script scope — never inside a function
- `onerror` attributes in HTML must be single-line — never multi-line

### Variant code format

```
UK-[TYPE]-[DENOM]-[YEAR]-[DESIGN]-
e.g. UK-D-50P-2025-GRND-
     UK-COMM-£2-2026-ZSLL-
     UK-PREDEC-SHIL-1954-GVI-ASHIL-
```

### Monarch name casing (intentional, matches Notion)

```
'King Charles Iii'   ← lowercase 'i' — intentional
'King George Vi'     ← lowercase 'i' — intentional
```

### Image fallback chain

1. `COTUK_MAP[variantCode]` (coins-of-the-uk.co.uk or coinhunter.co.uk)
2. Royal Mint CDN (constructed URL)
3. Grey placeholder

---

## Notion Record Creation — 3-Step Pattern

Creating new records in Notion **requires three separate steps** due to API constraints. Do not try to do this in fewer steps:

1. **Create page** — `notion-create-pages` with title only (in parent page, not data source)
2. **Move to data source** — `notion-move-pages` with `collection://` prefix for `data_source_id`
3. **Update properties** — `notion-update-page` to set all other fields

Attempting to set non-title properties at creation, or skipping the move step, will fail silently or error.

---

## Work In Progress

### Known stale state
- The sync queue had 6 stale `delete_variant` entries with empty `variantCode` (from 20–22 March 2026). These have been cleared to `[]` as part of this migration prep.

### TODO / Pending Features (in priority order)

These features were planned but not yet built as of 24 March 2026:

1. **Collection progress bars** — show `% Got` per collection in a summary section
2. **Collection overview page** — card grid showing one coin per collection, counts, completion %
3. **Mobile responsive layout** — sidebar collapse to drawer, responsive table/cards
4. **CSV export** — download filtered/all coins as CSV
5. **Statistics dashboard** — charts: by denomination, by year, by condition, completion heatmap
6. **Condition histogram** — bar chart of coins by grade (P/F/VG/F/VF/EF/UNC/BU/PF)
7. **Want list print view** — printable A4 want list for coin fairs
8. **Value tracking** — add market value field, track collection total value
9. **Pre-decimal year range slider** — filter pre-decimal by year range (large date span)
10. **Image lightbox** — click thumbnail to open full-size overlay
11. **Variant code copy button** — click to copy `variantCode` to clipboard in detail panel

### In-progress / incomplete areas
- The `10p Alphabet` collection has 0/52 instances — the data is tracked in Notion but no physical coins are owned yet
- The `Shield` collection shows 8/16 — this is correct (not a data error)
- The `Pre Decimal` collection has 454 owned of 1,095 tracked — many variants have no image in COTUK_MAP yet

---

## Development Workflow (Claude Code)

When continuing development with Claude Code:

1. **Start of session**: check `.coinhub_sync_queue.json` — process any valid items, clear the file
2. **Editing CoinHub.html**: always read the file first. Key sections:
   - CSS design tokens: near top of `<style>` block
   - `COTUK_MAP`: large object near top of `<script>`
   - `INSTANCE_DATA`: large object after COTUK_MAP
   - `RAW` array: inside `buildCoinData()` function
   - UI logic: last ~12 KB of `<script>` block
3. **Adding a new coin variant**: insert a row in `RAW` under the correct `// ── COLLECTION ──` comment
4. **Adding a coin image**: add entry to `COTUK_MAP`
5. **Adding a physical instance**: add entry to `INSTANCE_DATA`
6. **Notion operations**: always use the second email account, not the primary

### Claude Code MCP setup (required for development)
- Notion MCP server must be configured with the integration token from `.coinhub_config`
- The `coin-collection` skill must be installed (in `~/.claude/` skills folder)

---

## Final Notes

- The server binds to `localhost:8090` — it is **not** exposed to the network by default
- Sessions are stored in-memory and expire after 8 hours; they reset on server restart
- The TOTP secret in `.coinhub_auth` is the seed for Google Authenticator/Authy — keep it safe; if lost, you must run the `/setup` endpoint again to reset credentials
- There is no database migration to run — all app data lives inside `CoinHub.html` itself
- All documentation (`.md` files) can be regenerated from the codebase; the source of truth is the HTML file and the two config files
