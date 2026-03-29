# CoinHub — Full Migration & Handover Document
**Version:** March 2026
**Purpose:** Complete handover for migrating CoinHub to a new home server, and full context for any future Claude Code session.

---

## WHAT THIS PROJECT IS

CoinHub is a **personal UK coin collection gallery** — a single self-contained HTML file (~415 KB, 3,043 lines) served by a lightweight Python auth server. No framework, no build step, no database engine. Everything runs offline from a folder of files.

- 1,430+ coin variants across 25 collections
- 1,496 physical instance records (which coins Ian actually owns, and where they're stored)
- Filterable, sortable table UI with inline detail panels
- Images from coins-of-the-uk.co.uk and coinhunter.co.uk (646 image map entries)
- Master data lives in Notion (second email account), synced manually

---

## FILE INVENTORY — COPY ALL OF THESE

```
CoinHub.html                        ← THE APP (415 KB, self-contained)
auth_server.py                      ← Python server (auth + file serving)
.coinhub_auth                       ← Hashed credentials (email + pw + TOTP secret)
.coinhub_sync_queue.json            ← Notion sync queue (may be empty)
CoinHub_ClaudeCode_Handoff.md       ← Original architecture doc (still valid)
CoinHub_Migration_Handover.md       ← This document
```

**Do NOT need to copy:**
- `.claude/` folder — that's Claude Code's local config for the old machine
- `CoinHub.xlsx` — Excel version, not used by the app

---

## NEW SERVER SETUP — STEP BY STEP

### Requirements
- Python 3.9+ (stdlib only — no pip installs needed)
- Port 8090 available (or change `PORT = 8090` in auth_server.py)

### Step 1 — Copy Files

Copy the 4 essential files to any folder on the new server:
```
CoinHub.html
auth_server.py
.coinhub_auth        ← credentials carry over — no re-setup needed
.coinhub_sync_queue.json
```

### Step 2 — Run the Server

```bash
python auth_server.py
```

Output:
```
[CoinHub] http://localhost:8090  |  Ready
```

### Step 3 — Access

Open a browser to `http://localhost:8090` (or the server's LAN IP if accessing from another device).
Login with the same email + password (+ TOTP if enabled) as before.

### If You Don't Copy `.coinhub_auth` (fresh setup)

Visit `http://localhost:8090` — it will show a first-time setup page.
Enter email, password, optionally enable TOTP 2FA.

### Remote Access (LAN / Internet)

By default the server binds to `localhost` only. To allow LAN access, change line 322 in auth_server.py:
```python
# Change 'localhost' → '' (empty string = all interfaces)
with socketserver.TCPServer(('', PORT), Handler) as srv:
```
Then access via `http://YOUR_SERVER_IP:8090`.

For internet access, put behind a reverse proxy (nginx/Caddy) with HTTPS.

---

## AUTH SERVER — HOW IT WORKS

`auth_server.py` is a custom Python `http.server` subclass. **No external dependencies.**

| Feature | Detail |
|---|---|
| Auth method | Email + PBKDF2-HMAC-SHA256 password (200k iterations) |
| 2FA | Optional TOTP (RFC 6238, compatible with Google Authenticator / Authy) |
| Sessions | 8-hour cookie (`chsid`), server-side `_SESSIONS` dict (in-memory, lost on restart) |
| Blocked files | `.coinhub_auth`, `auth_server.py`, `.coinhub_sync_queue.json` — always 403 |
| API endpoints | `GET /api/queue` and `POST /api/queue` for the Notion sync queue |
| Default port | 8090 |

**Flow:**
1. GET `/` → login page (or setup page if no `.coinhub_auth`)
2. POST `/login` → validates email + password (+ TOTP) → sets `chsid` cookie → redirects to `/CoinHub.html`
3. All other GET requests check cookie — if valid, serves the file; else redirect to login

The `.coinhub_auth` file format:
```json
{
  "email": "user@example.com",
  "pw_hash": "<base64 salt+key>",
  "totp_secret": "<base32 secret or null>",
  "totp_enabled": true
}
```

---

## SYNC QUEUE — WHAT IT IS AND HOW IT WORKS

`.coinhub_sync_queue.json` is the bridge between the CoinHub website and Notion.

When Ian marks a coin as "Got" (or edits/removes an instance) **inside the CoinHub.html UI**, the change is:
1. Written immediately to the local in-memory JS state (so the UI updates instantly)
2. POSTed to `POST /api/queue` → appended to `.coinhub_sync_queue.json`

Then, at the **start of every Claude Code session**, Claude reads this file and processes the queue items against Notion via MCP.

### Queue Item Types

```jsonc
// add_instance — user got a new coin
{
  "type": "add_instance",
  "variantCode": "UK-D-50P-2025-GRND-",
  "storage1": "Box 1",
  "storage2": "Page 3",
  "storage3": "04",
  "condition": "BUNC.WM",
  "preservationType": "Westminster",
  "newInstCount": 1,
  "queuedAt": "2026-03-20T14:00:00Z"
}

// edit_instance — update an existing instance record
{
  "type": "edit_instance",
  "instanceId": "INS-42",
  "variantCode": "UK-D-50P-2025-GRND-",
  "storage1": "Box 2",
  "storage2": "Page 1",
  "storage3": "",
  "condition": "VF",
  "preservationType": "Folder Collection",
  "queuedAt": "2026-03-20T14:00:00Z"
}

// remove_instance — coin removed
{
  "type": "remove_instance",
  "instanceId": "INS-42",
  "variantCode": "UK-D-50P-2025-GRND-",
  "newInstCount": 0,
  "queuedAt": "2026-03-20T14:00:00Z"
}
```

### Claude's Processing Rules
- `add_instance` → create Instance record in Notion (3-step pattern) + update Variant status to "Got"
- `edit_instance` → update existing Instance record's fields
- `remove_instance` → archive Instance + if `newInstCount === 0`, revert Variant status to "Need" or "List"
- After processing all items, write `[]` back to the queue file

---

## NOTION DATABASE ARCHITECTURE

All master data lives in Notion (Ian's **second** email account — not primary).

### Key IDs

```
Parent workspace page:   1a505769-e1ee-806a-883d-c8df0a47b311
CoinHub Inbox page:      32205769-e1ee-818a-8ea8-e45f1efcbdca
Recovery/context page:   32105769-e1ee-81f3-af73-d74c48d5e86b

Coin Variant data_source: 1bf05769-e1ee-81c7-81dc-000b9d014020
Instance data_source:     1a605769-e1ee-80d2-b868-000b80373e62
Storage 1 (Container):   1d705769-e1ee-80e8-8821-000b783319c7
Storage 2 (Page):        1d805769-e1ee-807a-9b01-000b22c54e0c
Storage 3 (Slot):        1d805769-e1ee-801e-b1a4-000b9de0b849
Condition:               1d805769-e1ee-80f2-b71b-000b9932007f
Preservation Type:       1d905769-e1ee-804e-8473-000b2f0e2f2f
```

### 3-Step Notion Record Creation (CRITICAL WORKAROUND)

Direct creation to a `data_source_id` fails with "Property ID not found". Always use this 3-step pattern:

```
Step 1: notion-create-pages
  parent: { type: "page_id", page_id: "1a505769-e1ee-806a-883d-c8df0a47b311" }

Step 2: notion-move-pages
  new_parent: { type: "data_source_id", data_source_id: "<target data source>" }

Step 3: notion-update-page (update_properties)
  Set all fields
```

### Coin Variant Fields

| Field | Type | Notes |
|---|---|---|
| userDefined:ID | title | Variant Code e.g. `UK-D-50P-2023-GRND-` |
| Status | select | 'Got' / 'Need' / 'List' |
| Denomination | select | '50p', '£2', etc. |
| Collection | select | e.g. 'London 2012 Olympics' |
| Monarch | select | e.g. 'King Charles III' |
| Year of Issue2025 | number | Year |
| Image Link | url | Royal Mint image URL (fallback) |
| Instance 1 | relation | Links to Instance database |

### Instance Fields

| Field | Type | Notes |
|---|---|---|
| Coin Variant | relation | → Coin Data |
| Condition | text | e.g. 'BUNC.WM', 'VF', 'F' |
| Preservation Type | select | e.g. 'Westminster', 'Folder Collection' |
| Storage 1 | relation | → Storage 1 (Container) |
| Storage 2 | relation | → Storage 2 (Page) |
| Storage 3 | relation | → Storage 3 (Slot) |
| ID | formula | Auto-increments as 'INS-N' |

### Storage System

```
Storage 1 (Container) = Box 1, Box 2, Folder 1–10
Storage 2 (Page)      = Named sections e.g. 'Olympic Folder', 'Page 1'
Storage 3 (Slot)      = Slot number within page e.g. '04' (blank if not slotted)
Location              = Always 'Office'
```

---

## COINHUB.HTML — ARCHITECTURE

### The Single File Contains:
1. `<style>` — complete CSS (parchment/antiquarian design)
2. `<script>` block with all of:
   - `COTUK_MAP` — 646-entry object: variantCode → image URL
   - `INSTANCE_DATA` — 1,496 instance records keyed by variantCode
   - `RAW` array — 1,430+ coin variant rows (inside `buildCoinData()`)
   - All UI functions
3. `<body>` — loading screen, header, sidebar, table

### Critical Data Rules

```js
// ✅ ALWAYS reference globals directly — NEVER via window.
const url = COTUK_MAP[c.variantCode];      // NOT window.COTUK_MAP[...]
const insts = INSTANCE_DATA[coin.variantCode]; // NOT INSTANCE_DATA[coin.id]

// ✅ Use variantCode as the key everywhere
// ❌ coin.id does NOT EXIST — there is no .id field on coin objects

// ✅ INSTANCE_DATA must be at script level (global)
// ❌ NEVER declare it inside a function
```

### RAW Array Format

```js
// [variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount]
['UK-PD-FART-1902-', 'Farthing 1902', 'Farthing', 'Pre Decimal', 'King Edward VII', 1902, 'Got', '', 1]
```

### Monarch Name Casing (exact from Notion — do not "fix")
- `'King George Vi'` ← lowercase 'i' — intentional, matches Notion

### Design Tokens

```css
--ink:    #0C0C0A   /* text */
--paper:  #F5F2EB   /* primary background */
--paper2: #EDE9DF   /* sidebar/alt rows */
--paper3: #E4DFD2   /* borders */
--gold:   #8B6914   /* primary gold */
--gold2:  #C49A2A   /* secondary gold */
--gold3:  #F0C84A   /* highlight gold */
--got:    #2D6      /* green status */
--need:   #E55      /* red status */
```

Fonts: Bodoni Moda (headings), Cormorant Garamond (body), DM Mono (codes)

### Image Resolution Chain

```
1. COTUK_MAP[variantCode]     ← primary (coins-of-the-uk.co.uk + coinhunter.co.uk)
2. coin.imgUrl                ← Royal Mint fallback
3. Denom placeholder div      ← if both fail
```

### Key UI Functions

| Function | Purpose |
|---|---|
| `init()` | Entry — builds ALL_COINS, populates filters, calls applyFilters() |
| `buildCoinData()` | Maps RAW array → coin objects |
| `applyFilters()` | Filters ALL_COINS by STATE → FILTERED → renderTable() |
| `renderTable()` | Injects rows into `#coinBody` |
| `toggleDetail(i)` | Opens/closes inline detail panel |
| `buildDetailHTML(coin)` | HTML for detail panel (uses INSTANCE_DATA[coin.variantCode]) |
| `imgFallback(el)` | Image error handler |

---

## DATA SUMMARY (March 2026)

| Metric | Count |
|---|---|
| RAW coin variants | 1,430+ |
| COTUK_MAP image entries | 646 |
| Instance records | 1,496 |
| Variant codes with instances | 676 |
| Collections | 25 |

### Collections & Status

| Collection | Got | Total |
|---|---|---|
| Pre Decimal | ~454 | 1,095 |
| London 2012 Olympics 50p | 30 | 30 |
| Beatrix Potter | 15 | 15 |
| Winnie the Pooh | 9 | 9 |
| Harry Potter | 8 | 8 |
| Star Wars | 8 | 8 |
| Snowman | 8 | 8 |
| Dinosaurs | 12 | 12 |
| Definitives (KCIII) | 27 | 35 |
| Shield | 8 | 16 |
| 10p Alphabet | 0 | 52 |
| Paddington Bear | 4 | 4 |
| 2007 Proof Set | 12 | 12 |
| Britannia | 13 | 43 |
| Military | 13 | 14 |
| UK Anniversary | 24 | 27 |
| Science | 6 | 6 |
| Peter Pan | 6 | 6 |
| Characters | 5 | 6 |
| Sports | 5 | 8 |
| EU | 2 | 5 |
| Commemorative | 4 | 5 |
| Disney | 1 | 1 |
| Monopoly | 1 | 1 |
| Old Size 50p | 0 | 1 |

### 2026 Coins (Already in RAW + COTUK_MAP)

| Variant Code | Description | Status |
|---|---|---|
| `UK-COMM-50P-2026-BRGP-` | Grand Prix Centenary | List |
| `UK-COMM-50P-2026-KTRU-` | King's Trust 50th | List |
| `UK-COMM-£2-2026-ZSLL-` | ZSL London Zoo (DOUBLE-L) | List |
| `UK-COMM-£2-2026-BEAG-` | HMS Beagle | List |
| `UK-COMM-£5-2026-QEII-` | QEII 100th Birthday | List |
| `UK-D-50P-2026-WPKD-` | Winnie the Pooh Kindness | List |
| `UK-D-50P-2026-DENN-` | Dennis the Menace | List |

---

## BUGS — FIXED, NEVER REINTRODUCE

1. **`window.COTUK_MAP`** — always `COTUK_MAP` directly (const doesn't attach to window)
2. **`coin.id`** — doesn't exist; always use `coin.variantCode`
3. **`INSTANCE_DATA` inside a function** — must be global at script level
4. **Multi-line `onerror` attribute** — must be a single-line HTML attribute

---

## FEATURES — IMPLEMENTED ✅

- Single-file HTML, no build step
- Parchment/antiquarian design system
- Left sidebar: denomination buttons with counts
- Status filter toggles: Got / Need / List
- Year / Monarch / Collection dropdowns
- Text search (name, variant code, collection)
- Sortable columns (click header to sort/reverse)
- Colour-coded variant code spans
- Status badges (Got=green, Need=red, List=gold)
- Coin thumbnails with COTUK → Royal Mint → placeholder fallback
- Inline detail panel per row
- Detail panel: metadata grid + Physical Instances section (Location/S1/S2/S3/Condition/Preservation/INS-ID)
- Stats bar: Got / Need / List / Total counts
- Notion Inbox workflow page
- Auth server with email + password + optional TOTP 2FA
- Sync queue: UI changes posted to server, Claude processes via Notion MCP

---

## FEATURES — PENDING 🚧

### High Priority
- [ ] Collection progress bars (% Got per collection, sidebar or dedicated view)
- [ ] Collection overview page (card grid: each collection, Got/Total, representative image)

### Medium Priority
- [ ] Mobile responsive improvements (hide columns, larger touch targets)
- [ ] Export to CSV (download current filtered view)
- [ ] 4 coins with collection="Unknown" — need classifying
- [ ] D-Day 1994 50p image URL verification

### Future
- [ ] Statistics dashboard (charts by denomination/decade/collection)
- [ ] Condition histogram
- [ ] Want list print view (for coin fairs)
- [ ] Value tracking
- [ ] Pre-decimal year range slider
- [ ] Image lightbox
- [ ] Variant code copy button

---

## FOR FUTURE CLAUDE CODE SESSIONS

### AT SESSION START — ALWAYS DO THIS FIRST

1. Read `.coinhub_sync_queue.json`
2. If it has items, process them via Notion MCP (add/edit/remove instances)
3. Clear the file to `[]`

### When Making Code Changes

- **UI/logic only:** Edit CSS, HTML, or JS functions in the last ~12 KB of the `<script>` block
- **New coin:** Find the collection section in RAW (e.g. `// ── COMMEMORATIVE ──`) and insert the new row
- **New instance:** Add to `INSTANCE_DATA` object — key=variantCode, value=array of `{id,loc,s1,s2,s3,cond,ptype}`
- **New image:** Add to `COTUK_MAP` — key=variantCode, value=full URL

### After Every Change — Verify

```
grep "window.COTUK_MAP" CoinHub.html  → should return nothing
grep "coin\.id" CoinHub.html          → should return nothing
grep "INSTANCE_DATA" CoinHub.html     → first occurrence should be at script/global level
```

### Running the Preview Server (Windows)

```bash
python auth_server.py
# Serves at http://localhost:8090
```

`launch.json` uses `python` (not `python3`) with explicit `--directory` arg on Windows.

### Notion API Notes

- Always use the **second email account** (not Ian's primary)
- Fetch the database before writing (to get current schema)
- `update_properties` and `replace_content` are **two separate calls** to `notion-update-page`
- Pages outside databases: only `title` property allowed in updates
- Use bare UUID for page IDs (no `collection://` prefix)
- Use `collection://` prefix only for `data_source_id` in move operations

---

## TRIGGER PHRASE — INBOX WORKFLOW

*"Please process the CoinHub Inbox page"*

Notion URL: https://www.notion.so/32205769e1ee818a8ea8e45f1efcbdca

Two sections:
- **New Coins Spotted** — Claude creates Coin Variant records (Status=List)
- **I've Got It** — Claude creates Instance records (Status=Got), marks variant accordingly

---

*Generated March 2026. CoinHub is a personal project for tracking Ian's UK coin collection.*
