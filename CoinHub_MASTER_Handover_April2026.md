# CoinHub — Master Handover Document
**Updated:** April 2026  
**Purpose:** Complete self-contained reference. Give this document to Claude to resume the project from this exact state.

---

## QUICK START FOR CLAUDE

Copy and paste this into a new Claude Code session:

> "I'm working on CoinHub, my UK coin collection website. Please read `CoinHub_MASTER_Handover_April2026.md` in the working directory `C:/Users/ian/Documents/coinhub/` and confirm you're up to speed before we start."

Then at the start of every session Claude should:
1. Read `.coinhub_sync_queue.json` — if it has items, process them via Notion MCP, then write `[]` to clear it
2. Read this document if not already loaded

---

## WHAT COINHUB IS

A **single-file HTML/CSS/JS gallery website** for Ian's personal UK coin collection. No framework, no build step, no server required. Everything self-contained in one HTML file.

- **1,430+ coin variants** across 25 collections
- **1,496+ physical instance records** (which coins are owned, where stored, condition)
- **646+ image map entries** (COTUK_MAP)
- **Parchment/antiquarian UI** — Bodoni Moda + Cormorant Garamond typography
- **Bidirectional Notion sync** — Claude processes a queue file via Notion MCP
- **Guest access system** — partially built (front-end done, backend not yet deployed)

---

## HOSTING ARCHITECTURE

```
User browser
    │
    ▼
coins.ghghome.co.uk  (Cloudflare DNS — DNS-only CNAME, no proxy)
    │
    ▼
Vercel  (project: ianb65s-projects/coinhub, hobby plan)
    │  auto-deploys on push to main
    ▼
GitHub repo: IanB65/coinhub  (branch: main)
    │
    Contains:
    ├── CoinHub.html          ← the entire app
    ├── admin.html            ← guest access manager (front-end only)
    └── index.html            ← redirect to CoinHub.html
```

**To deploy changes:** commit and push `CoinHub.html` to `main` branch of `IanB65/coinhub`. Vercel auto-deploys within ~30 seconds.

**Working directory on Ian's machine:** `C:/Users/ian/Documents/coinhub/`

**Important:**
- GitHub Pages is NOT used — do not add CNAME or GH Pages config
- Netlify is NOT used — ignore netlify.toml
- No server runs in production — CoinHub.html is served as a static file
- The old `auth_server.py` Python server is no longer used for production

---

## COINHUB.HTML — ARCHITECTURE

### File Structure
The single HTML file contains (in order):
1. `<head>` — Google Fonts links, no other external CSS
2. `<style>` — Complete CSS (design system + layout + all component styles)
3. `<script>` block:
   - `COTUK_MAP` — 646-entry `{ variantCode: imageUrl }` object
   - `INSTANCE_DATA` — 1,496+ instance records keyed by variantCode (global)
   - `buildCoinData()` — contains embedded `RAW` array of 1,430+ coin variants
   - All UI, filter, sync, modal, and utility functions
4. `<body>` — loading screen, header, sidebar, table, modals

### Design System
```css
--ink:    #0C0C0A   /* dark text */
--paper:  #F5F2EB   /* primary parchment background */
--paper2: #EDE9DF   /* sidebar / alternate rows */
--paper3: #E4DFD2   /* subtle borders */
--gold:   #8B6914   /* primary gold accent */
--gold2:  #C49A2A   /* secondary gold */
--gold3:  #F0C84A   /* highlight gold */
--got:    #2D6      /* green — Got status */
--need:   #E55      /* red — Need status */
--list:   #8B6914   /* gold — List status */
```
**Fonts:** Bodoni Moda (headings), Cormorant Garamond (body), DM Mono (codes/IDs)  
**Aesthetic:** Parchment / antiquarian / collector's catalogue — NOT modern/tech

---

## DATA STRUCTURES

### RAW Array (inside `buildCoinData()`)
```js
// Format: [variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount]
['UK-PD-FART-1902-', 'Farthing 1902', 'Farthing', 'Pre Decimal', 'King Edward VII', 1902, 'Got', '', 1]
```
- ~1,430+ rows, one per coin variant
- `variantCode` is the canonical ID — always use this, never `coin.id` (it does not exist)
- `instCount` = number of physical instances owned
- `status` = 'Got', 'Need', or 'List'
- `imgUrl` = Royal Mint URL (fallback only — COTUK_MAP takes priority)

### Variant Code Format
```
UK-{type}-{denom}-{year}-{id}-

UK-D-50P-2025-GRND-      Definitive 50p 2025 (Groundhog)
UK-PD-FART-1922-         Pre-decimal Farthing 1922
UK-COMM-£2-2026-ZSLL-    Commemorative £2 2026 (ZSL London Zoo)
```
Types: `D` (definitive), `PD` (pre-decimal), `COMM` (commemorative)

### ALL_COINS Array
Built by `buildCoinData()` from RAW. Each object:
```js
{ variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount, parsed }
// parsed = { type, denom, year, id } from parseVariant(variantCode)
```

### INSTANCE_DATA (global, at script level)
```js
const INSTANCE_DATA = {
  'UK-PD-FART-1902-': [
    { id: 'INS-16', loc: 'Office', s1: 'Box 1', s2: 'Farthings Folder 1902-1936', s3: '', cond: 'F', ptype: 'Folder Collection' }
  ],
  // ... 1,496+ records across 676 variant codes
};
```
Fields: `id` (INS-N), `loc` (always 'Office'), `s1` (container), `s2` (page/section), `s3` (slot), `cond` (condition), `ptype` (preservation type), `desc`, `notes`, `lastStocktake`, `lastEdited`

### COTUK_MAP (global, at script level)
```js
const COTUK_MAP = {
  'UK-D-50P-2025-GRND-': 'https://coinhunter.co.uk/app/_images/coins/cm-2025-groundhog.jpg',
  // ... 646+ entries
};
```

### STATE Object
```js
let STATE = {
  denom: null,        // '50p', '£2', null = All
  status: new Set(),  // 'Got'/'Need'/'List' — empty = All
  year: '', monarch: '', collection: '', search: '',
  sort: 'year', sortDir: 1,  // 1=asc, -1=desc
  openId: null,              // expanded detail panel
};
```

### Condition Codes
`BUNC` (Brilliant Uncirculated), `BUNC.KC` (KC obverse), `BUNC.WM` (Westminster), `VF` (Very Fine), `F` (Fine), `G` (Good), `O` (Other), `P` (Poor)

### Preservation Types
Westminster, Folder Collection, Album, Coin Card, Loose, Other

---

## FEATURES — COMPLETE LIST

### Filter Sidebar (left)
- Denomination buttons (2-column grid) with Got/Total counts and progress bars
- Status toggles: Got / Need / List (multi-select)
- Year dropdown (auto-generated from data)
- Monarch dropdown (auto-generated)
- Collection dropdown (auto-generated)
- Text search (searches name, variant code, collection)
- Clear filters button

### Main Coin Table
- Sortable columns: Coin, Denom, Year, Collection, Monarch, Count (click to sort, click again to reverse)
- Status badge (Got/Need/List) per row
- Coin thumbnail with fallback chain
- Variant code colour-coded (type / denom / year / id each a different colour)
- Results count

### Detail Panel (click any row to expand)
- Coin metadata grid: variant code, type, denomination, year, monarch
- Physical instances list with all fields: Location, S1, S2, S3, Condition, Preservation, INS-ID
- Add Instance form (with all fields)
- Edit / Remove buttons per instance
- Instances auto-update Got/Need status when added/removed

### Header
- Stats bar: Got (green) / Need (red) / List (gold) / Total counts
- Toolbar buttons: Sync (with pending-items badge), Change Log, Stock Check, Admin (owner only)

### Sync Modal (Notion sync)
- **Push tab:** Lists all pending changes (add/edit/remove instances, variant edits, deletions)
  - Each item can be individually Approved or Dismissed
  - Approve All button for batch approval
- **Pull tab:** Pull updates from Notion (condition/storage changes made directly in Notion)
  - Pull Now button
  - Auto-pull interval: Off / 15min / 30min / 1hr
  - Stocktake Push button (push last-checked dates to Notion)

### Change Log Modal
- Full audit trail of all add/edit/remove actions
- Timestamp per entry
- Reinstate button (undo last change)
- Export to CSV button

### Stock Check Modal
- Mark coins as physically checked (records date)
- View check status (when each coin was last verified)
- Push check dates to Notion

### Statistics Modal
- Got/Need/List counts and percentages
- Pie charts
- Density heatmaps

### Guest Mode (triggered by `/api/whoami` returning role='guest')
- Read-only view — all write controls hidden
- Guest expiry banner shown with date/time
- Session re-checked every 60 seconds; redirects if expired
- Hidden in guest mode: Add Instance, Edit buttons, Remove buttons, Sync button, Stock Check, Change Log, Admin link, Status editing

---

## NOTION INTEGRATION

### Account
Claude Code uses Ian's **second Notion account** (not primary). Notion MCP must be connected to this workspace.

Verify connection with: `notion-search "coin collection"` — should return results from the Coin Hub workspace.

### Database IDs
```
Coin Variant:        collection://1bf05769-e1ee-81c7-81dc-000b9d014020
Instance:            collection://1a605769-e1ee-80d2-b868-000b80373e62
Storage 1 (Container): collection://1d705769-e1ee-80e8-8821-000b783319c7
Storage 2 (Page):      collection://1d805769-e1ee-807a-9b01-000b22c54e0c
Storage 3 (Slot):      collection://1d805769-e1ee-801e-b1a4-000b9de0b849
Condition:             collection://1d805769-e1ee-80f2-b71b-000b9932007f
Preservation Type:     collection://1d905769-e1ee-804e-8473-000b2f0e2f2f
```

### Key Page IDs
```
Workspace parent page:  1a505769-e1ee-806a-883d-c8df0a47b311
CoinHub Inbox page:     32205769-e1ee-818a-8ea8-e45f1efcbdca
Recovery/context page:  32105769-e1ee-81f3-af73-d74c48d5e86b
```

### 3-Step Record Creation (CRITICAL WORKAROUND)
Direct creation to `data_source_id` fails with "Property ID not found". Always:
```
Step 1: notion-create-pages → parent: { type: "page_id", page_id: "1a505769-e1ee-806a-883d-c8df0a47b311" }
Step 2: notion-move-pages   → new_parent: { type: "data_source_id", data_source_id: "<target DB>" }
Step 3: notion-update-page  → set all properties (update_properties call)
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
| Name | title | Auto-generated |
| Coin Variant | relation | → Coin Data |
| Condition | text | e.g. 'BUNC.WM', 'VF', 'F' |
| Preservation Type | select | e.g. 'Westminster', 'Folder Collection' |
| Storage 1 | relation | → Storage 1 (Container) |
| Storage 2 | relation | → Storage 2 (Page) |
| Storage 3 | relation | → Storage 3 (Slot) |
| ID | formula | Auto-increments as 'INS-N' |

### 3-Tier Storage System
```
Storage 1 (Container) = Box 1, Box 2, Box 3, Folder 1–10  — all in: Office
Storage 2 (Page)      = Named section within container
                        e.g. 'Olympic Folder', 'Page 1', 'Farthings Folder 1902-1936'
Storage 3 (Slot)      = Slot number within page e.g. '04', '' (blank if not slotted)
Location              = Always 'Office'
```

---

## SYNC QUEUE

### How It Works
When Ian makes changes in CoinHub (add/edit/remove instances), changes are:
1. Applied immediately to the in-memory `INSTANCE_DATA` (reflected in UI instantly)
2. Saved to browser `localStorage` as pending items
3. When Ian approves them in the Sync modal → they were previously POSTed to `/api/queue` (old Python server) → now written to `.coinhub_sync_queue.json` on disk

Claude processes the queue at the start of every session, or on demand ("process the sync queue").

### Queue File
**Path:** `C:/Users/ian/OneDrive/Desktop/Closed/Coins/.coinhub_sync_queue.json`

### Queue Item Types
```jsonc
// add_instance — user got a new coin
{
  "type": "add_instance",
  "variantCode": "UK-D-50P-2025-GRND-",
  "inst": {
    "id": "INS-1520",
    "loc": "Office",
    "s1": "Box 1", "s2": "Page 3", "s3": "04",
    "cond": "BUNC.WM", "ptype": "Westminster", "desc": ""
  },
  "newStatus": "Got"
}

// edit_instance — update existing
{
  "type": "edit_instance",
  "variantCode": "UK-D-50P-2025-GRND-",
  "inst": { "id": "INS-1234", "s1": "Box 2", "cond": "VF" }
}

// remove_instance — coin removed
{
  "type": "remove_instance",
  "variantCode": "UK-D-50P-2025-GRND-",
  "inst": { "id": "INS-1234" },
  "newInstCount": 0
}
```

### Processing Rules
- `add_instance` → 3-step Notion create (Instance record) + update Variant status to "Got"
- `edit_instance` → update existing Instance record fields in Notion
- `remove_instance` → archive Instance in Notion + if `newInstCount === 0`, revert Variant status to "Need"
- After processing all items: write `[]` back to the queue file

### Scheduled Task (DISABLED as of April 2026)
The 5-minute auto-sync scheduled task (`coinhub-notion-sync`) has been disabled.
Queue is now processed:
- Automatically at the start of every Claude Code session (per MEMORY instructions)
- On demand: tell Claude "process the sync queue"

---

## BULK INSTANCE IMPORT — SPREADSHEET TEMPLATE

For importing many coin instances at once (e.g. a box of pre-decimal coins), use the Excel template rather than the Notion Inbox.

**Template location:** `I:\My Drive\Coins\coin_import_template.xlsx`  
(Google Drive mapped as I: on Ian's machine — also at `I:\Coins\coin_import_template.xlsx`)

### Sheets
- **Coin Import** — data entry sheet (17 columns)
- **Instructions** — reference guide with all valid values

### Column Layout (Coin Import sheet)

| Col | Header | Notes |
|---|---|---|
| A | `calc` | Auto-formula: concatenates B–E into a variantCode like `UK-PD-HALF-1936-` |
| B | *(country)* | Always `UK` |
| C | *(type)* | `PD`, `D`, `COMM` |
| D | *(denom)* | e.g. `HALF`, `50P`, `£2` |
| E | `year calc` | e.g. `1936` |
| F–H | *(year split / suffix)* | Century, last 2 digits, variant suffix |
| I | **Coin Variant Name** | Either a human-readable name OR the full variantCode |
| J | **Year** | Year on the coin |
| K | **Storage 1** | Container — dropdown validated |
| L | **Storage 2** | Page/section within container |
| M | **Storage 3** | Slot number within page |
| N | **Condition** | Grade — dropdown validated |
| O | **Preservation Type** | Packaging — dropdown validated |
| P | **Date Acquired** | DD/MM/YYYY format |
| Q | **Notes** | Free text |

### Two Input Styles

**Style 1 — Human-readable name** (simpler, for one-offs):
- Fill in column I with the exact Notion coin name (e.g. `50p Britannia 2023`)
- Fill in columns J–Q as needed

**Style 2 — VariantCode components** (for bulk pre-decimal entries):
- Fill in columns B–E with the code parts (`UK`, `PD`, `HALF`, `1936`)
- Column A auto-builds the full variantCode `UK-PD-HALF-1936-`
- Fill in columns K–Q for storage/condition

### Dropdown Valid Values

**Condition (col N):** `F`, `G`, `VF`, `P`, `O`, `BUNC`, `BUNC.WM`, `BUNC.KC`

**Storage 1 (col K):** `Folder 1`–`Folder 10`, `Box 1`, `Box 2`, `Box 3`, `Blank`

**Preservation Type (col O):** `Folder Collection`, `Westminster`, `Set`, `Capsule`, `Sleeve`, `Koin Club`, `Royal Mint`, `IOM Carded`, `Proof`, `Date Stamp Coin`

### Required vs Optional Fields
- **Required:** Coin Variant Name (col I), Year (col J), Storage 1 (col K), Condition (col N)
- **Optional:** Storage 2, Storage 3, Preservation Type, Date Acquired, Notes

### How to Use
1. Fill in the template (add rows below existing data, or use a fresh copy)
2. Upload the file to Claude and say: **"Import these instances to Notion"**
3. **Claude runs validation first (see below) — do NOT import until Ian approves**
4. Claude creates Instance records in Notion (3-step pattern) and updates Variant status to Got
5. After import, Claude updates `INSTANCE_DATA` in `CoinHub.html` and regenerates the file

### Validation — Run Before Every Import

**Claude must validate ALL rows and report a full error summary to Ian before importing anything. Do not import a single row until Ian confirms he wants to proceed.**

For each row, check:

#### 1. Required Fields Missing
Flag any row where Coin Variant Name (col I), Year (col J), Storage 1 (col K), or Condition (col N) is blank.

#### 2. Invalid Dropdown Values
Flag any row where:
- **Condition** is not one of: `F`, `G`, `VF`, `P`, `O`, `BUNC`, `BUNC.WM`, `BUNC.KC`
- **Storage 1** is not one of: `Folder 1`–`Folder 10`, `Box 1`, `Box 2`, `Box 3`, `Blank`
- **Preservation Type** (if filled) is not one of: `Folder Collection`, `Westminster`, `Set`, `Capsule`, `Sleeve`, `Koin Club`, `Royal Mint`, `IOM Carded`, `Proof`, `Date Stamp Coin`

#### 3. Variant Must Exist in Notion (BLOCKING — most important check)
Every row must resolve to a real Coin Variant record in Notion before it can be imported. No exceptions.

**For variantCode-style rows** (col A formula result, or col I starting with `UK-`):
- Query Notion Coin Variant database: filter `userDefined:ID` equals the variantCode
- If zero results → flag as error: `"variantCode UK-PD-HALF-1936- not found in Notion — cannot import"`
- If multiple results → flag as error: `"variantCode matched more than one record — data issue in Notion"`

**For human-readable name rows** (col I contains a plain name like `50p Britannia 2023`):
- Search Notion Coin Variant database by name (title contains the value)
- If zero results → flag as error: `"Coin name '50p Britannia 2023' not found in Notion — check spelling or use variantCode instead"`
- If multiple results → list the matches and ask Ian to confirm which one to use
- If exactly one result → use it, but show Ian the resolved variantCode so he can confirm it's correct

**Also cross-check against CoinHub.html RAW data:**
- Confirm the variantCode exists in the embedded RAW array in `CoinHub.html`
- If it's in Notion but not in RAW → warn Ian (data may be out of sync)
- If it's in RAW but not in Notion → flag as error (Notion is the import target)

This check must complete for every row before any import begins.

#### 4. Duplicate Rows in the Import File
Flag any variantCode that appears more than once in the same import batch (may be intentional for multiple instances of the same coin — flag it but don't block, just confirm with Ian).

#### 5. Coin Already Has Instances in Notion
For each variantCode, check if Notion already has Instance records linked to it.
- If yes: flag it with the existing count — Ian may want duplicates or may have made an error

#### 6. Year Looks Wrong
Flag any Year (col J) that is:
- Not a number
- Before 1600 or after 2030
- Doesn't match the year component of the variantCode (if variantCode style)

#### 7. Date Acquired Format
If Date Acquired (col P) is filled, flag any value that is not a valid DD/MM/YYYY date.

#### 8. VariantCode Format Invalid
For col A formula results or col I variantCode entries, flag any code that doesn't match the pattern: `UK-{TYPE}-{DENOM}-{YEAR}-{ID}-` (e.g. missing trailing dash, wrong separator, non-numeric year segment).

### Validation Report Format

Claude must show the status of **every row** — not just the failures — so Ian can see exactly what will and won't be imported before confirming. Present it as a table:

```
VALIDATION REPORT — 45 rows checked
════════════════════════════════════════════════════════════════

ROW  VARIANT CODE              NAME                        STATUS
───  ────────────────────────  ──────────────────────────  ──────────────────────────────────────
  8  UK-PD-HALF-1936-          Halfpenny 1936              ⚠️  Already has 1 instance in Notion
  9  UK-PD-HALF-1917-          Halfpenny 1917              ✅ Ready
 10  UK-PD-HALF-1917-          Halfpenny 1917              ⚠️  Duplicate of row 9 — 2nd instance?
 11  UK-PD-PENN-1910-          Penny 1910                  ✅ Ready
 12  UK-PD-PENN-1921-          Penny 1921                  ❌ Missing Condition
 13  UK-PD-PENN-1925-          Penny 1925                  ✅ Ready
 14  —                         50p Britannia 2023          ❌ Name not found in Notion
 15  UK-PD-PENN-1930-          Penny 1930                  ❌ Storage 1 "Bx1" is invalid
 16  UK-PD-PENN-1945-          Penny 1945                  ✅ Ready
 17  UK-COMM-50P-2026-BRGP-    Grand Prix 50p 2026         ✅ Ready (currently Status=List — will change to Got)
 ...

════════════════════════════════════════════════════════════════
SUMMARY
  ✅ Ready to import:   40 rows
  ⚠️  Warnings:          3 rows (will import unless you say skip)
  ❌ Blocked:            5 rows (will NOT import — fix and re-run, or skip)

Blocked rows will be skipped. Warning rows will be imported unless you say otherwise.
Ready to proceed? Say YES to import the 40 clean + 3 warning rows, or tell me which to skip.
```

**Rules for the report:**
- Show every row — don't hide passing rows
- ✅ Ready = all checks pass, will be imported
- ⚠️ Warning = will import by default but flagging for awareness (already has instances, is a duplicate in this batch, status will change from List→Got)
- ❌ Blocked = will NOT be imported under any circumstances until the data is fixed (missing required field, variant not found in Notion, invalid dropdown value)
- Always show the resolved variantCode even for name-style rows, so Ian can confirm it matched the right coin
- After Ian confirms, report which rows were successfully created in Notion and which (if any) failed during import

### Current Data in Template (April 2026)
The template already contains **606 real coin instance records** — predominantly pre-decimal half pennies and pennies stored in Box 3. These may be awaiting import or are a historical snapshot.

---

## COINHUB INBOX WORKFLOW

**Trigger phrase:** *"Please process the CoinHub Inbox page"*  
**Notion URL:** https://www.notion.so/32205769e1ee818a8ea8e45f1efcbdca

Two sections in the Notion page:
- **New Coins Spotted** — Ian adds a row when he spots a coin to track. Claude creates a Coin Variant record (Status=List) and moves the row to Processed.
- **I've Got It** — Ian adds a row with storage/condition details when he acquires a coin. Claude creates an Instance record, sets Variant to Got, and moves the row to Processed.

---

## GUEST ACCESS SYSTEM (PARTIALLY BUILT)

### Current State (April 2026)
The front-end is **fully built**:
- `admin.html` — complete Guest Access Manager UI with full styling
  - Create guest links with label + duration (1hr to 1 year)
  - View active links, see expiry, revoke any link
- `CoinHub.html` — complete guest mode implementation
  - `_applyGuestMode()` function detects guest vs owner
  - All write controls hidden in guest mode
  - Access expiry banner displayed
  - Session re-checked every 60 seconds

**What is NOT built:** the backend API. `admin.html` and `CoinHub.html` call these server-side endpoints that don't exist yet:
- `GET /api/whoami` — returns `{ role: 'owner' | 'guest', guestExpires: timestamp }`
- `GET /api/auth/guest` — list all guest tokens
- `POST /api/auth/guest` — create a new guest token
- `DELETE /api/auth/guest/:id` — revoke a guest token
- `POST /api/auth/logout` — sign out
- `/login` — login page (owner authentication)
- `/admin` — currently 404 (needs `vercel.json` rewrite)

### What's Needed to Complete It

**1. Vercel KV** (free tier key-value store for token storage)
- Create at vercel.com → Storage → KV
- Link to the coinhub project

**2. Vercel Serverless Functions** — 4 files in `/api/` directory:
```
api/whoami.js          — checks cookie/token, returns role
api/auth/guest.js      — GET: list tokens; POST: create token; DELETE: revoke
api/auth/login.js      — POST: owner login, set session cookie
api/auth/logout.js     — POST: clear session cookie
```

**3. Owner authentication**
- A password (hashed) stored as a Vercel environment variable
- Session cookie issued on successful login
- Owner can access `/admin` and generate guest links

**4. `vercel.json`** — rewrite `/admin` to `/admin.html`
```json
{
  "rewrites": [
    { "source": "/admin", "destination": "/admin.html" }
  ]
}
```

**5. Guest token format**
- Random token stored in Vercel KV with: label, createdAt, expiresAt, revoked flag
- Guest visits `coins.ghghome.co.uk?token=xxx` or a dedicated URL
- Server sets a short-lived cookie; `/api/whoami` reads it

**Estimated implementation time:** 2–3 hours. All front-end work is done — only the 4 serverless functions + KV setup needed.

---

## IMAGE SOURCES

### Resolution Chain (per coin)
1. `COTUK_MAP[variantCode]` — primary (coins-of-the-uk.co.uk + coinhunter.co.uk)
2. `coin.imgUrl` — Royal Mint fallback (embedded in RAW)
3. Grey placeholder div — if both fail

### COTUK URL Patterns
```
KC3 definitives:
  https://coins-of-the-uk.co.uk/pics/c3/{denom}/C3_{DENOM}_{YY}.jpg
  Denom codes: 01, 02, 05, 10, 20, 50, 100, 200

50p commemoratives 1998-2022:
  https://coins-of-the-uk.co.uk/pics/dec/50/50_{yr}{code}.jpg

London 2012 Olympics 50p:
  https://coins-of-the-uk.co.uk/pics/dec/50/50_11{sport}.jpg

Pre-decimal:
  https://coins-of-the-uk.co.uk/pics/{monarch}/{denom}/{filename}.jpg
  Monarch dirs: qv, e7, g5, g6, qe
  Denom dirs: fa (farthing), ha (halfpenny), 1d, 3d, 6d, 1s, 2s, hc
```

### Coinhunter URL Patterns
```
10p Alphabet 2018: https://coinhunter.co.uk/app/_images/coins/gbch-circ-{letter}.jpg
10p Alphabet 2019: https://coinhunter.co.uk/app/_images/coins/cm-2019-{letter}-10p-rev-obv.jpg
Recent 50p 2024-26: https://coinhunter.co.uk/app/_images/coins/cm-{year}-{slug}.jpg
2026 annual set:   https://coinhunter.co.uk/_images/royalmint/2026-coin-set-{slug}.jpg
```

### Coin Collection Skill — Image Source Priority
1. Royal Mint — royalmint.com
2. Westminster Collection — westminstercollection.co.uk (UK coins only)
3. Coins of the UK — coins-of-the-uk.co.uk
4. UK Coin Hunt — ukcoinhunt.com
5. Coin Checker — coinchecker.co.uk
6. Fifty Pence — fiftypence.co.uk

---

## MONARCH NAME CASING

Exact strings from Notion — do NOT "fix" the lowercase letters:
```
'Queen Victoria'
'King Edward VII'
'King George V'
'King George Vi'   ← lowercase 'i' — intentional, matches Notion
'King George Vi'   ← same for all George VI entries
'Queen Elizabeth II'
'King Charles III'
```

---

## CRITICAL RULES — NEVER BREAK THESE

```js
// 1. Always use COTUK_MAP directly — NEVER window.COTUK_MAP
const url = COTUK_MAP[c.variantCode];          // ✅
const url = window.COTUK_MAP[c.variantCode];   // ❌ always undefined

// 2. Always use coin.variantCode — coin.id DOES NOT EXIST
const insts = INSTANCE_DATA[coin.variantCode]; // ✅
const insts = INSTANCE_DATA[coin.id];          // ❌ undefined

// 3. INSTANCE_DATA must be at script level (global)
const INSTANCE_DATA = {...};                   // ✅ top level
function buildCoinData() {
  const INSTANCE_DATA = {...};                 // ❌ scoped, invisible elsewhere
}

// 4. onerror attributes must be single-line
<img onerror="imgFallback(this)">              // ✅
<img onerror="                                 // ❌ breaks HTML parsing
  imgFallback(this)
">

// 5. Guard against empty variantCode in RAW filter
// RAW entries with empty variantCode must be skipped
```

---

## LOCALSTORAGE KEYS

| Key | Purpose |
|---|---|
| `coinhub_pending_instances` | New instances awaiting sync approval |
| `coinhub_pending_inst_edits` | Edited instances awaiting approval |
| `coinhub_pending_inst_removals` | Removed instances awaiting approval |
| `coinhub_pending_variant_edits` | Variant metadata changes awaiting approval |
| `coinhub_pending_deletions` | Variant deletions awaiting approval |
| `coinhub_notion_overrides` | Cached condition/storage updates pulled from Notion |
| `coinhub_notion_new_instances` | New instances pulled from Notion |
| `coinhub_last_notion_pull` | ISO timestamp of last successful pull |
| `coinhub_sync_interval` | Auto-pull interval in minutes (0/15/30/60) |
| `coinhub_last_pull_display` | Human-readable time of last pull |
| `coinhub_stockcheck` | Map of INS-ID → ISO date of last stocktake |
| `coinhub_deleted_variants` | Variant codes permanently hidden from UI |
| `coinhub_audit_log` | Array of last 200 audit entries |

---

## KEY FUNCTIONS REFERENCE

| Function | Purpose |
|---|---|
| `init()` | Entry point — builds ALL_COINS, populates filters, calls applyFilters() |
| `buildCoinData()` | Maps RAW array → ALL_COINS coin objects |
| `applyFilters()` | Filters ALL_COINS by STATE → FILTERED → renderTable() |
| `renderTable()` | Injects rows into `#coinBody` |
| `toggleDetail(i)` | Opens/closes inline detail panel |
| `buildDetailHTML(coin)` | HTML for detail panel (instances + add form) |
| `saveInstance(variantCode)` | Creates new instance, queues to localStorage |
| `editInstance(variantCode, instId)` | Saves edits, queues to localStorage |
| `removeInstance(variantCode, instId)` | Removes instance, queues removal |
| `showSyncQueue()` | Opens sync modal (blocked in guest mode) |
| `approveAllSync()` | Mass-approves all pending items |
| `_syncPullNow()` | Pulls updates from Notion (`/api/notion-pull`) |
| `_applyGuestMode()` | Checks `/api/whoami`, applies guest mode if applicable |
| `showStockCheck()` | Opens stock check modal |
| `showChangeLog()` | Opens change log modal |
| `showStats()` | Opens statistics modal |
| `imgFallback(el)` | Image error handler (COTUK → Royal Mint → placeholder) |
| `parseVariant(code)` | Parses variant code → `{type, denom, year, id}` |
| `resolveImage(coin)` | Returns best available image URL |
| `getNextInstId()` | Returns next INS-N ID |

---

## COLLECTION DATA (April 2026)

| Collection | Got | Total | Notes |
|---|---|---|---|
| Pre Decimal | ~454 | 1,095 | Farthing → Halfcrown, VQ → QEII |
| London 2012 Olympics 50p | 30 | 30 | Complete |
| Beatrix Potter | 15 | 15 | Complete |
| Winnie the Pooh | 9 | 9 | Complete |
| Harry Potter | 8 | 8 | Incl Winged Keys 2024, Flying Car 2025 |
| Star Wars | 8 | 8 | Incl X-Wing, Death Star II 2024 |
| Snowman | 8 | 8 | Complete |
| Dinosaurs | 12 | 12 | Complete (2020×3, 2021×3, 2024×6) |
| Definitives (KCIII) | 27 | 35 | Multi-year 2023–2025 incl proofs |
| Shield | 8 | 16 | Only 8 Got — do NOT change this |
| 10p Alphabet | 0 | 52 | None owned — do NOT change this |
| Paddington Bear | 4 | 4 | Complete |
| 2007 Proof Set | 12 | 12 | Complete |
| Britannia | 13 | 43 | |
| Military | 13 | 14 | VE Day 2025 = Need |
| UK Anniversary | 24 | 27 | |
| Science | 6 | 6 | Complete |
| Peter Pan | 6 | 6 | Complete (Isle of Man) |
| Characters | 5 | 6 | Gruffalo & Mouse 2019 = Need |
| Sports | 5 | 8 | |
| EU | 2 | 5 | |
| Commemorative | 4 | 5 | Incl Concorde 2026 Got |
| Disney | 1 | 1 | Mary Poppins 2025 |
| Monopoly | 1 | 1 | Monopoly 2025 Got |
| Old Size 50p | 0 | 1 | EEC 1992 — no instance |

### 2026 Coins (in RAW + COTUK_MAP, Status=List unless noted)
| Variant Code | Denom | Description |
|---|---|---|
| `UK-COMM-50P-2026-BRGP-` | 50p | Grand Prix Centenary |
| `UK-COMM-50P-2026-KTRU-` | 50p | King's Trust 50th Anniversary |
| `UK-COMM-£2-2026-ZSLL-` | £2 | ZSL London Zoo 200th Anniversary (**DOUBLE-L**) |
| `UK-COMM-£2-2026-BEAG-` | £2 | HMS Beagle 200th Anniversary |
| `UK-COMM-£5-2026-QEII-` | £5 | QEII 100th Birthday |
| `UK-D-50P-2026-WPKD-` | 50p | Winnie the Pooh — Kindness |
| `UK-D-50P-2026-DENN-` | 50p | Dennis the Menace |

---

## PENDING FEATURES

### High Priority
- [ ] **Collection progress bars** — visual % Got per collection in sidebar or overview
- [ ] **Collection overview page** — card grid: each collection with Got/Total and representative image

### Medium Priority
- [ ] **Mobile responsive improvements** — hide columns on narrow screens, larger touch targets
- [ ] **Export to CSV** — download current filtered view as CSV
- [ ] **4 coins with collection="Unknown"** — need classifying
- [ ] **D-Day 1994 50p image** — URL `coinhunter.co.uk/_images/shop1/cc/cc-dday-50p.jpg` unverified

### Guest Access (Future — see section above for full spec)
- [ ] **Vercel KV setup**
- [ ] **4 serverless API functions** (`/api/whoami`, `/api/auth/guest`, `/api/auth/login`, `/api/auth/logout`)
- [ ] **`vercel.json`** with `/admin` → `/admin.html` rewrite
- [ ] **Owner login page** (`/login`)

### Long-Term Ideas
- [ ] Statistics dashboard (charts: Got by denomination/decade/collection)
- [ ] Condition histogram
- [ ] Want list print view (for coin fairs)
- [ ] Value tracking
- [ ] Pre-decimal year range slider
- [ ] Image lightbox
- [ ] Variant code copy button
- [ ] Acquisition date tracking

---

## DEVELOPMENT WORKFLOW

### Making Code Changes
- **UI/logic only:** Edit CSS, HTML, or JS functions in the last ~12 KB of the `<script>` block
- **New coin:** Find `// ── COLLECTION NAME ──` section in RAW array, insert new row
- **New instance:** Add to `INSTANCE_DATA` object — key=variantCode, value=array of `{id,loc,s1,s2,s3,cond,ptype}`
- **New image:** Add to `COTUK_MAP` — key=variantCode, value=full URL

### After Every Change — Verify
```bash
grep "window.COTUK_MAP" CoinHub.html    # must return nothing
grep "coin\.id" CoinHub.html            # must return nothing (false positives OK for 'variantCode' etc)
```

### Deploying
```bash
# From C:/Users/ian/Documents/coinhub/
git add CoinHub.html
git commit -m "describe change"
git push origin main
# Vercel auto-deploys in ~30 seconds
# Live at: https://coins.ghghome.co.uk
```

---

## FILES IN C:/Users/ian/Documents/coinhub/

```
CoinHub.html                         ← THE APP (single file, ~530KB)
admin.html                           ← Guest Access Manager (front-end only)
index.html                           ← Redirect to CoinHub.html
CoinHub_MASTER_Handover_April2026.md ← This document
CoinHub_MASTER_Handover.md           ← Previous handover (March 2026, now superseded)
CoinHub_ClaudeCode_Handoff.md        ← Older handoff doc
build_lookups.py                     ← Script for building lookup tables
start_coinhub.bat                    ← Old batch file for running Python server (no longer used)
auth_server.py                       ← Old Python auth server (no longer used in production)
.coinhub_sync_queue.json             ← Sync queue (processed by Claude at session start)
```

**Note:** The old Python `auth_server.py` and `.coinhub_auth`/`.coinhub_config` files are no longer used for production hosting. CoinHub is now a static Vercel deployment. The auth server may still exist locally for reference but is not part of the live system.

---

## SCHEDULED TASKS (Claude Code)

| Task ID | Schedule | Status | Purpose |
|---|---|---|---|
| `new-coins-inbox` | Every Monday 09:08 | **Enabled** | Weekly scan for new UK coins + process approved inbox entries |
| `coinhub-notion-sync` | Every 5 min | **Disabled** | Was: process sync queue automatically. Now: manual only |

---

*Generated April 2026. CoinHub is Ian's personal UK coin collection tracker — not a commercial product.*
