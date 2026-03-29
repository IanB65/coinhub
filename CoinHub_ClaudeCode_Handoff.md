# 🪙 CoinHub — Claude Code Handoff Document
**Version:** March 2026  
**Source file:** `CoinHub.html` (~415 KB, single self-contained file)  
**Data source:** Notion (connected via MCP — second email account)

---

## 📋 HOW TO USE THIS DOCUMENT

This document gives you everything needed to continue developing CoinHub in Claude Code.  
The canonical source of truth is `CoinHub.html` — read it directly to see all current code.  
Do NOT regenerate the data from Notion unless specifically requested — it takes many API calls and the embedded data in the HTML is already current as of March 2026.

---

## 🗂️ PROJECT OVERVIEW

CoinHub is a **single-file HTML/CSS/JS gallery website** for a UK coin collection, generated from a Notion database. It has no server, no build step — everything is self-contained.

**What it does:**
- Displays 1,430+ coin variants across 25 collections
- Filterable/sortable table with status badges, thumbnails, variant codes
- Click any row → inline detail panel with coin metadata + all physical instances (storage location, condition, preservation type)
- Header stats bar: Got / Need / List counts
- Coin images loaded from coins-of-the-uk.co.uk and coinhunter.co.uk (no Royal Mint images)

---

## 🎨 DESIGN SYSTEM

```css
/* CSS Variables */
--ink:    #0C0C0A   /* dark ink text */
--paper:  #F5F2EB   /* primary parchment background */
--paper2: #EDE9DF   /* sidebar / alternate rows */
--paper3: #E4DFD2   /* borders / subtle backgrounds */
--gold:   #8B6914   /* primary gold accent */
--gold2:  #C49A2A   /* secondary gold */
--gold3:  #F0C84A   /* highlight gold */
--got:    #2D6      /* green — Got status */
--need:   #E55      /* red — Need status */
--list:   #8B6914   /* gold — List status */
```

**Google Fonts:** Bodoni Moda (headings), Cormorant Garamond (body), DM Mono (codes)

**Aesthetic:** Parchment / antiquarian / collector's catalogue — NOT modern/tech UI

---

## 📐 HTML STRUCTURE

```html
<body>
  <!-- Loading screen (hidden after init) -->
  <div id="loadScreen">...</div>

  <!-- Header with stats bar -->
  <header id="mainHeader" style="display:none">
    <div class="logo">Coin <span>Hub</span></div>
    <div class="header-stats">
      <b id="hGot">–</b> Got  |  <b id="hNeed">–</b> Need  |  <b id="hList">–</b> List  |  <b id="hTotalN">–</b> variants
    </div>
  </header>

  <!-- Main app (2-column grid: sidebar + table) -->
  <div class="app" id="mainApp" style="display:none">
    
    <!-- LEFT: filter sidebar -->
    <aside class="filters">
      <div id="denomGrid"><!-- denomination buttons injected by JS --></div>
      <!-- Status toggles: Got / Need / List -->
      <!-- Dropdowns: Year, Monarch, Collection -->
      <!-- Search input -->
    </aside>

    <!-- RIGHT: coin table -->
    <main>
      <!-- Table with sortable headers -->
      <table class="coin-table">
        <thead><!-- Status | Thumb | Name+Code+Collection | Year | Monarch --></thead>
        <tbody id="coinBody"><!-- rows injected by renderTable() --></tbody>
      </table>
    </main>
  </div>
</body>
```

---

## 🧠 JAVASCRIPT ARCHITECTURE

### Data Globals (declared at script level — NEVER via `window.`)

```js
// ── IMAGE MAP ──────────────────────────────────────────────────────────────
// 639 entries mapping variantCode → image URL
// Sources: coins-of-the-uk.co.uk (COTUK) + coinhunter.co.uk
const COTUK_MAP = {
  'UK-D-10P-2018-A-': 'https://coinhunter.co.uk/app/_images/coins/gbch-circ-a.jpg',
  'DEF-50P-2023':     'https://coins-of-the-uk.co.uk/pics/c3/50/C3_50_23.jpg',
  // ... 637 more entries
};

// ── INSTANCE DATA ──────────────────────────────────────────────────────────
// Keyed by variantCode (NOT by any numeric id — there is no coin.id field)
// Value: array of physical instance records
const INSTANCE_DATA = {
  'UK-PD-FART-1902-': [
    { id:'INS-16', loc:'Office', s1:'Box 1', s2:'Farthings Folder 1902-1936', s3:'', cond:'F', ptype:'Folder Collection' }
  ],
  // ... 1,496 instance records across 676 variant codes
};
```

### State Object

```js
let ALL_COINS = [];   // built by buildCoinData()
let FILTERED = [];    // current filtered/sorted view

let STATE = {
  denom: null,        // '50p', '£2', null = All
  status: new Set(),  // Set of 'Got'/'Need'/'List' — empty = All
  year: '',
  monarch: '',
  collection: '',
  search: '',
  sort: 'year',
  sortDir: 1,         // 1 = asc, -1 = desc
  openId: null,
};
```

### RAW Data Format

Each coin variant is one row in the `RAW` array (defined inside `buildCoinData()`):

```js
// Index: [variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount]
//   [0] variantCode  — canonical ID, e.g. 'UK-PD-FART-1922-'
//   [1] name         — display name, e.g. 'Farthing 1922'
//   [2] denom        — display denomination, e.g. 'Farthing', '50p', '£2'
//   [3] collection   — e.g. 'Pre Decimal', 'London 2012 Olympics'
//   [4] monarch      — EXACT STRING from Notion (see casing note below)
//   [5] year         — numeric year, e.g. 1922
//   [6] status       — 'Got', 'Need', or 'List'
//   [7] imgUrl       — Royal Mint image URL (fallback only)
//   [8] instCount    — number of physical instances
const RAW = [
  ['UK-PD-FART-1902-','Farthing 1902','Farthing','Pre Decimal','King Edward VII',1902,'Got','',1],
  // ... 1,430+ entries
];
```

⚠️ **MONARCH NAME CASING BUG** — exact strings from Notion, note the lowercase 'i':
- `'Queen Victoria'`
- `'King Edward VII'`
- `'King George V'`
- `'King George Vi'`  ← lowercase 'i' — this is how it appears in Notion, keep it
- `'Queen Elizabeth II'`
- `'King Charles III'`

### buildCoinData() Function

```js
function buildCoinData() {
  return RAW.map(r => {
    const [variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount] = r;
    return { variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount,
             parsed: parseVariant(variantCode) };
  });
}
// NOTE: coin objects have .variantCode but NO .id field — it does not exist
```

### Variant Code Parser

```js
// UK-D-50P-2025-GRND- → {type:'D', denom:'50P', year:2025, id:'GRND'}
// UK-PD-SHIL-1967-    → {type:'PD', denom:'SHIL', year:1967, id:''}
function parseVariant(code) {
  if (!code) return null;
  const parts = code.replace(/^UK-/, '').split('-');
  const type = parts[0] || '';
  const denom = parts[1] || '';
  const yearRaw = parseInt(parts[2]);
  const year = isNaN(yearRaw) ? null : yearRaw;
  const id = year ? (parts[3] || '') : (parts[2] || '');
  return { type, denom, year, id };
}
```

### Image Resolution Chain

```js
// In renderTable() — for each coin c:
const cotukUrl = COTUK_MAP?.[c.variantCode] || null;  // PRIMARY
const rmUrl = c.imgUrl || null;                         // FALLBACK
const imgSrc = cotukUrl || rmUrl;

// img tag:
// <img src="${imgSrc}" data-cotuk="${cotukUrl||''}" data-rm="${rmUrl||''}" onerror="imgFallback(this)">

function imgFallback(el) {
  if (el.src === el.dataset.cotuk && el.dataset.rm) {
    el.src = el.dataset.rm;           // try Royal Mint URL
  } else {
    el.style.display = 'none';
    const ph = el.parentElement?.querySelector('.coin-thumb-ph');
    if (ph) ph.style.display = 'flex'; // show denom placeholder
  }
}
```

### Detail Panel (buildDetailHTML)

```js
function buildDetailHTML(coin) {
  // CRITICAL: look up by variantCode, NOT by coin.id (there is no coin.id)
  const instRecords = INSTANCE_DATA[coin.variantCode] || [];
  
  // Each instance record: { id, loc, s1, s2, s3, cond, ptype }
  // id    = 'INS-123'
  // loc   = 'Office' (always)
  // s1    = Storage 1 container, e.g. 'Box 1', 'Folder 7'
  // s2    = Storage 2 page, e.g. 'Page 1', 'Olympic Folder'
  // s3    = Storage 3 slot, e.g. '04', '' (blank)
  // cond  = Condition, e.g. 'BUNC.WM', 'VF', 'F'
  // ptype = Preservation Type, e.g. 'Westminster', 'Folder Collection'
  
  // Renders: coin metadata grid + instance list with all 6 fields
}
```

### UI Functions Summary

| Function | Purpose |
|---|---|
| `init()` | Entry point — builds ALL_COINS, populates filters, calls applyFilters() |
| `buildDenomFilter()` | Creates denomination buttons in sidebar |
| `buildYearFilter()` | Populates year dropdown |
| `buildMonarchFilter()` | Populates monarch dropdown |
| `buildCollectionFilter()` | Populates collection dropdown |
| `applyFilters()` | Reads STATE, filters ALL_COINS → FILTERED, calls renderTable() |
| `sortCoins()` | Sorts FILTERED by STATE.sort / STATE.sortDir |
| `renderTable()` | Injects rows into `#coinBody` |
| `toggleDetail(i)` | Opens/closes inline detail panel for row i |
| `buildDetailHTML(coin)` | Returns HTML string for detail panel |
| `variantCodeHTML(code)` | Returns colour-coded span for variant code |
| `toggleStatus(s)` | Toggles Got/Need/List filter |
| `setSort(s)` | Sets sort column, updates header icons |
| `clearFilters()` | Resets all STATE filters |
| `imgFallback(el)` | Image error handler — tries fallback URLs |

---

## 🐛 CRITICAL BUGS — FIXED, DO NOT REINTRODUCE

### Bug 1: `window.COTUK_MAP` always undefined

**Root cause:** `const COTUK_MAP = {...}` at script level does NOT attach to `window` in a regular `<script>` tag (only `var` does).

```js
// ❌ WRONG — was silently breaking ALL images
const imgSrc = window.COTUK_MAP?.[c.variantCode] || rmUrl;

// ✅ CORRECT
const imgSrc = COTUK_MAP?.[c.variantCode] || rmUrl;
```

Same applies to `INSTANCE_DATA` — always reference directly, never via `window.`.

### Bug 2: `coin.id` does not exist

```js
// ❌ WRONG — coin objects have no .id field, returns undefined
const instances = INSTANCE_DATA[coin.id] || [];

// ✅ CORRECT — always use variantCode
const instances = INSTANCE_DATA[coin.variantCode] || [];
```

### Bug 3: INSTANCE_DATA declared inside a function

```js
// ❌ WRONG — makes it inaccessible from buildDetailHTML()
function buildCoinData() {
  const INSTANCE_DATA = {...};  // scoped, invisible elsewhere
}

// ✅ CORRECT — must be a global at script level
const INSTANCE_DATA = {...};
function buildCoinData() { ... }
```

### Bug 4: Multi-line onerror attribute

```html
<!-- ❌ WRONG — breaks HTML parsing -->
<img onerror="
  imgFallback(this)
">

<!-- ✅ CORRECT — single line -->
<img onerror="imgFallback(this)">
```

---

## 🗃️ NOTION DATABASE ARCHITECTURE

### Database IDs

```
Coin Data (Variant): collection://1bf05769-e1ee-81c7-81dc-000b9d014020
Instance:            collection://1a605769-e1ee-80d2-b868-000b80373e62
Storage 1 (Container): collection://1d705769-e1ee-80e8-8821-000b783319c7
Storage 2 (Page):      collection://1d805769-e1ee-807a-9b01-000b22c54e0c
Storage 3 (Slot):      collection://1d805769-e1ee-801e-b1a4-000b9de0b849
Location:              collection://1d805769-e1ee-8042-b4dd-000b1393168e
```

**Parent page** (Coin Hub workspace): `1a505769-e1ee-806a-883d-c8df0a47b311`  
**Recovery/context page**: `32105769-e1ee-81f3-af73-d74c48d5e86b`  
**CoinHub Inbox page**: `32205769-e1ee-818a-8ea8-e45f1efcbdca`

### Coin Data (Variant) Fields

| Field | Type | Notes |
|---|---|---|
| userDefined:ID | title | Variant Code e.g. `UK-D-50P-2023-GRND-` |
| Code | text | Short code |
| Denomination | select | e.g. '50p', '£2' |
| Collection | select | e.g. 'London 2012 Olympics' |
| Monarch | select | e.g. 'King Charles III' |
| Status | select | 'Got', 'Need', 'List' |
| Year of Issue2025 | number | Year |
| Description | select | |
| Image Link | url | Royal Mint image URL |
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
Storage 1 (Container) = Box 1, Box 2, Folder 1–10  — all physically in: Office
Storage 2 (Page)      = Named sections within container
                        e.g. 'Olympic Folder', 'Page 1', 'Farthings Folder 1902-1936'
Storage 3 (Slot)      = Slot number within page, e.g. '04', '' (blank if not slotted)
Location              = Always 'Office' (all containers are in the office)
```

### Notion Record Creation Pattern (3-step workaround)

Direct `data_source_id` creation fails with "Property ID not found". Use this pattern:

```
Step 1: notion-create-pages
  parent: { type: "page_id", page_id: "1a505769-e1ee-806a-883d-c8df0a47b311" }
  (placeholder title only)

Step 2: notion-move-pages
  new_parent: { type: "data_source_id", data_source_id: "1bf05769-e1ee-81c7-81dc-000b9d014020" }

Step 3: notion-update-page (update_properties)
  Set all fields including userDefined:ID
```

Same 3-step pattern for Instance records (move to Instance data_source_id).

---

## 🖼️ IMAGE SOURCES

### COTUK URL Patterns

```
KC3 definitives:
  https://coins-of-the-uk.co.uk/pics/c3/{denom}/C3_{DENOM}_{YY}.jpg
  e.g. C3_50_23.jpg, C3_100_23.jpg, C3_200_24ng.jpg
  Denom codes: 01, 02, 05, 10, 20, 50, 100, 200

50p commemoratives 1998-2022:
  https://coins-of-the-uk.co.uk/pics/dec/50/50_{yr}{code}.jpg
  e.g. 50_98eu.jpg (1998 EU Presidency), 50_12pc.jpg (2012 PC)

London 2012 Olympics 50p (29 coins):
  https://coins-of-the-uk.co.uk/pics/dec/50/50_11{sport}.jpg

Pre-decimal coins:
  https://coins-of-the-uk.co.uk/pics/{monarch}/{denom}/{filename}.jpg
  Monarch dirs: qv, e7, g5, g6, qe
  Denom dirs: fa (farthing), ha (halfpenny), 1d (penny), 3d, 6d, 1s, 2s, hc (halfcrown)
```

### Coinhunter URL Patterns

```
10p Alphabet 2018:
  https://coinhunter.co.uk/app/_images/coins/gbch-circ-{letter}.jpg

10p Alphabet 2019:
  https://coinhunter.co.uk/app/_images/coins/cm-2019-{letter}-10p-rev-obv.jpg

Recent 50p commemoratives 2024-25:
  https://coinhunter.co.uk/app/_images/coins/cm-{year}-{slug}.jpg
```

### COTUK_MAP Coverage (639 entries)

- All 10p Alphabet A-Z (2018 + 2019)
- All KC3 definitives 1p–£2 (2023-2025)
- All London 2012 Olympics 50p
- All Beatrix Potter, Harry Potter, Star Wars, Dinosaurs, etc.
- Pre-decimal: Queen Victoria, Edward VII, George V, George VI, QE2
  (Farthing, Halfpenny, Penny, Threepence, Sixpence, Shilling, Florin, Halfcrown)
- Most commemorative 50p 1998–2022
- Recent 2024-2025 commemoratives via coinhunter

---

## 📊 COLLECTION DATA (March 2026)

| Collection | Got | Total | Notes |
|---|---|---|---|
| Definitives (KCIII) | 27 | 35 | Multi-year 2023–2025 incl proofs |
| Shield | 8 | 16 | Got: 2008, 2012–2015, 2017, 2019–2020 ONLY |
| London 2012 Olympics | 30 | 30 | All Got |
| 10p Alphabet | 0 | 52 | None Got — no instances in Notion |
| Beatrix Potter | 15 | 15 | All Got |
| Winnie the Pooh | 9 | 9 | All Got |
| Paddington Bear | 4 | 4 | All Got |
| Harry Potter | 8 | 8 | Incl Winged Keys 2024, Flying Car 2025 |
| Star Wars | 8 | 8 | Incl X-Wing, Death Star II 2024 |
| Snowman | 8 | 8 | All Got |
| Disney | 1 | 1 | Mary Poppins 2025 |
| Dinosaurs | 12 | 12 | All Got — 2020×3, 2021×3, 2024×6 |
| Monopoly | 1 | 1 | Got (2025) |
| Sports | 5 | 8 | Roger Bannister ×2, Glasgow 2014, Team GB 2021, Birmingham 2022 |
| EU | 2 | 5 | 1998 EU Presidency + Brexit 2020 |
| Military | 13 | 14 | VE Day 2025 = Need |
| UK Anniversary | 24 | 27 | |
| Science | 6 | 6 | All Got |
| Characters | 5 | 6 | Gruffalo & Mouse 2019 = Need |
| Peter Pan | 6 | 6 | All Got (Isle of Man coins) |
| Commemorative | 4 | 5 | Incl Concorde 2026 Got, Tolkien £2, Flying Scotsman £2 |
| 2007 Proof Set | 12 | 12 | All Got |
| Britannia | 13 | 43 | Only those with instances shown |
| Old Size 50p | 0 | 1 | EEC Presidency 1992 — no instance |
| Pre Decimal | 454 | 1095 | ~454 Got shown in website |

**Key corrections (do not revert):**
- Shield: only 8/16 Got — older versions wrongly showed all 16
- 10p Alphabet: 0 Got — older versions wrongly showed A-J + P as Got
- Concorde 2026: Is Got (INS record exists)
- Monopoly 2025: Is Got

---

## 🔮 2026 COINS — IN RAW + IMAGES IN COTUK_MAP ✅

These coins are in the RAW array (Status=List) and have images in COTUK_MAP as of March 2026.

⚠️ **Note:** ZSL variant code is `UK-COMM-£2-2026-ZSLL-` (double-L) — not `ZSL-`.

### 2026 Commemoratives (annual set, sourced from coinhunter.co.uk)

| Variant Code | Denom | Description | Image source |
|---|---|---|---|
| `UK-COMM-50P-2026-BRGP-` | 50p | Grand Prix Centenary | coinhunter.co.uk |
| `UK-COMM-50P-2026-KTRU-` | 50p | King's Trust 50th anniversary | coinhunter.co.uk |
| `UK-COMM-£2-2026-ZSLL-` | £2 | ZSL London Zoo 200th anniversary | coinhunter.co.uk |
| `UK-COMM-£2-2026-BEAG-` | £2 | HMS Beagle 200th anniversary | coinhunter.co.uk |
| `UK-COMM-£5-2026-QEII-` | £5 | QEII 100th birthday | coinhunter.co.uk |

### 2026 Limited Editions (sourced from royalmint.com globalassets)

| Variant Code | Denom | Description |
|---|---|---|
| `UK-D-50P-2026-WPKD-` | 50p | Winnie the Pooh — Kindness (100 years) |
| `UK-D-50P-2026-DENN-` | 50p | Dennis the Menace (75 years) |

---

## 📥 COINHUB INBOX — WORKFLOW PAGE

**Notion URL:** https://www.notion.so/32205769e1ee818a8ea8e45f1efcbdca

Two-section workflow:
- **New Coins Spotted** — user adds rows; Claude creates Coin Variant records (Status=List) and moves to Processed
- **I've Got It** — user adds rows with storage/condition; Claude creates Instance records and moves to Processed

**Trigger phrase:** *"Please process the CoinHub Inbox page"*

---

## ✅ FEATURES — IMPLEMENTED

- [x] Single-file HTML website, no build step, no server
- [x] Parchment/antiquarian design system
- [x] Left sidebar with denomination filter buttons (with counts)
- [x] Status filter toggles: Got / Need / List
- [x] Year / Monarch / Collection dropdowns
- [x] Text search (searches name, variant code, collection)
- [x] Sortable table columns (click header to sort, click again to reverse)
- [x] Colour-coded variant code display (type / denom / year / id each a different colour)
- [x] Status badges (Got = green, Need = red, List = gold)
- [x] Coin thumbnails from COTUK and coinhunter with graceful fallback
- [x] Inline detail panel (click row to expand)
- [x] Detail panel: coin metadata grid (variant code, type, denomination, year, monarch)
- [x] Detail panel: Physical Instances section with all 6 fields (Location, S1, S2, S3, Condition, Preservation)
- [x] INS-xxx ID shown under instance counter
- [x] Stats bar: Got / Need / List / Total counts
- [x] COTUK_MAP with 646 entries covering all major collections (incl. 7 x 2026 coins)
- [x] imgFallback: COTUK → Royal Mint → placeholder
- [x] Notion Inbox page for new coin entry workflow
- [x] 3-step Notion record creation workaround

---

## 🚧 FEATURES — PLANNED / IN PROGRESS

### High Priority
- [x] **Add 2026 coins to RAW data** — 5 commemoratives + 2 limited editions added with images (March 2026)
- [ ] **Collection progress bars** — visual % Got per collection in sidebar or dedicated view
- [ ] **Collection overview page** — card grid showing each collection with Got/Total and a representative image

### Medium Priority
- [ ] **Image for D-Day 1994 50p** — URL `coinhunter.co.uk/_images/shop1/cc/cc-dday-50p.jpg` unverified
- [ ] **4 unknown-collection coins** — have instances but collection=Unknown, need classifying
- [ ] **Mobile responsive improvements** — hide more columns on narrow screens, larger touch targets
- [ ] **Export to CSV** — button to download current filtered view as CSV

### Future Ideas
- [ ] **Statistics dashboard** — charts: Got by denomination, Got by decade, completion by collection
- [ ] **Condition histogram** — show distribution of condition grades across collection
- [ ] **Want list print view** — printable page of all Need coins for reference at coin fairs
- [ ] **Value tracking** — add approximate market value per coin, show total collection value
- [ ] **Acquisition date filtering** — show what was added recently
- [ ] **Pre-decimal date range filter** — dedicated slider for pre-decimal year range
- [ ] **Image lightbox** — click thumbnail to see larger image
- [ ] **Variant code copy button** — one-click copy to clipboard

---

## 🔧 DEVELOPMENT NOTES FOR CLAUDE CODE

### Working with the large data sections

The HTML is 415KB — the data is all embedded. When making changes:

1. **For UI/logic changes only:** Edit the CSS, HTML structure, or JS functions in the BUILD UI section (last ~12KB of the script). Don't touch the data sections.

2. **For adding new coins to RAW:** Find the appropriate collection section (e.g. `// ── COMMEMORATIVE ──`) and insert the new row in the correct position.

3. **For adding new instance data:** Add to the `INSTANCE_DATA` object — key is variantCode, value is array of `{id, loc, s1, s2, s3, cond, ptype}`.

4. **For adding new COTUK images:** Add to `COTUK_MAP` object — key is variantCode, value is full image URL.

### File output paths
- Main file: `CoinHub.html` (present this to user for download)
- Recovery prompt: `CoinHub_Recovery_Prompt.md`

### Testing
After any change, verify:
1. No `window.COTUK_MAP` references anywhere (always use `COTUK_MAP` directly)
2. No `coin.id` references in detail panel (always use `coin.variantCode`)  
3. `const INSTANCE_DATA` is at script level, not inside any function
4. All `onerror` attributes are single-line

### Key Notion API integration notes
- Notion uses the **second email account** (not the primary)
- Always fetch a database before writing to it (to get current schema)
- `update_properties` and `replace_content` are **two separate calls** to notion-update-page
- Pages outside databases: only `title` property is allowed
- Use bare UUID for page IDs (no `collection://` prefix)

---

## 🔄 SESSION CHANGELOG (March 2026)

### Changes made in this session — re-apply if needed

**1. Coin Collection Skill — Westminster Collection added**

Edit the coin-collection skill (`SKILL.md`) to add Westminster Collection as a source:
- Description: add "the Westminster Collection" and "what's new on Westminster Collection" as triggers
- §1 New Coins: add `https://www.westminstercollection.co.uk/new-coins/` as secondary source (UK coins only — filter out international issues)
- §2 Coin Images: add Westminster Collection as Step 2 (after Royal Mint, before Coins of the UK), shifting old Steps 2–5 to Steps 3–6
- General Tips: update "five approved sources" → "six approved sources" to include Westminster Collection

**2. CoinHub.html — COTUK_MAP image entries added**

Add these entries to the `COTUK_MAP` object (before the closing `};`):

```js
// ── 2026 LIMITED EDITIONS ──
'UK-D-50P-2026-WPKD-': 'https://www.royalmint.com/globalassets/_ecommerce/commemorative/launches/2026-launches/winnie-the-pooh/coin-1---kindness/product-images/uk26wp1bu---100-years-of-winnie-the-pooh---kindness-2026-uk-50p-brilliant-uncirculated-coin-reverse-pack-front.jpg',
'UK-D-50P-2026-DENN-': 'https://www.royalmint.com/globalassets/_ecommerce/commemorative/launches/2026-launches/denis-the-menace/product-images/uk26dmbu-75-years-of-dennis-the-menace-2026-uk-50p-brilliant-uncirculated-coin-reverse-pack-front.jpg',
// ── 2026 COMMEMORATIVES ──
'UK-COMM-50P-2026-BRGP-': 'https://coinhunter.co.uk/_images/royalmint/2026-coin-set-grand-prix-centenary-50p.jpg',
'UK-COMM-50P-2026-KTRU-': 'https://coinhunter.co.uk/_images/royalmint/2026-coin-set-the-kings-trust-50p.jpg',
'UK-COMM-£2-2026-ZSLL-': 'https://coinhunter.co.uk/_images/royalmint/2026-coin-set-200-years-zoological-society-2.jpg',
'UK-COMM-£2-2026-BEAG-': 'https://coinhunter.co.uk/_images/royalmint/2026-coin-set-hms-beagle-2.jpg',
'UK-COMM-£5-2026-QEII-': 'https://coinhunter.co.uk/_images/royalmint/5-2026-100th-anniversary-of-the-birth-of-queen-elizabeth-ii.jpg',
```

**3. launch.json — fixed for Windows**

`runtimeExecutable` must be `"python"` (not `"python3"`), and `runtimeArgs` must include explicit `--directory` path. Current working config:
```json
{
  "runtimeExecutable": "python",
  "runtimeArgs": ["-m", "http.server", "8090", "--directory", "C:\\Users\\ian\\OneDrive\\Desktop\\Closed\\Coins"],
  "port": 8090
}
```

---

## 📁 SOURCE FILES

```
CoinHub.html                    — Main deliverable, single-file website (~415KB)
CoinHub_Recovery_Prompt.md      — Recovery prompt for claude.ai sessions
CoinHub_ClaudeCode_Handoff.md   — This document
CoinHub.xlsx                    — Excel spreadsheet version (3 sheets)

Notion Export (source of truth):
  ExportBlock-29dfba75-449f-4ccc-8cdb-25d135cfd2e5-Part-1.zip
  (Contains CSVs: Coin Data ~1430 rows, Instance ~1496 rows)
```

---

*Generated March 2026 from claude.ai sessions. CoinHub is a personal project tracking a UK coin collection — not a commercial product.*
