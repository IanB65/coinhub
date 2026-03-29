# CoinHub — Changelog

All versions listed newest first. Git history begins at v1.6 (29 March 2026) — earlier versions reconstructed from handover documents.

---

## v1.6 — 29 March 2026
**Sync queue bug fixes + persistent audit log**

### Bug fixes
- `remove_instance` queue handler: fixed wrong field name (`instanceId` → `instId`) — archiving was silently failing
- `remove_instance`: fixed use of formula value (INS-N) as Notion page ID — now queries the instance DB by formula filter to get the real page UUID
- `edit_instance`: was falling through to "unknown type → left in queue forever" — now handled: queries instance by formula ID, updates Condition, Preservation Type, and Storage relations in Notion
- `variant_edit`: was never processed by anything — now handled: queries variant by code, updates Status and Collection in Notion

### New features
- `coinhub_changes.log`: server-side append-only log written every time the queue is processed — permanent record survives browser data clears
- `POST /api/save-audit-log`: new endpoint saves the full browser audit log to disk as JSON
- "Save to Server" button added to the Change Log modal
- Audit log auto-saved to server on "Approve All" sync and on "Process Now"
- `coinhub_changes.log` added to blocked files list (not served)

---

## v1.5 — 26 March 2026
**Edit/Delete UI + audit log (MASTER handover)**

### New features
- Edit instance: inline form in detail panel (Condition, Preservation Type, Storage 1/2/3)
- Remove instance: button with confirmation dialog; updates instCount and status
- Edit variant: inline form (Name, Collection, Status)
- Delete variant: button with confirmation; blocked if variant has instances
- Sync queue extended: `edit_instance`, `variant_edit`, `delete_variant` types added
- Audit log: in-browser localStorage log (max 200 entries) capturing all changes with before/after state
- Change Log modal: view history, reinstate any change in-memory, export to CSV
- `coinhub_deleted_variants` localStorage key: keeps deleted variants hidden across page reloads
- Master handover document (CoinHub_MASTER_Handover.md) consolidating all previous docs

---

## v1.4 — 24–26 March 2026
**Stats, stock check, and UI enhancements**

### New features
- Stats dashboard modal: Got/Need/List by collection, denomination breakdown
- Stock check modal: view all coins in a given storage location, printable
- Header stats bar: live Got / Need / List / Total counts
- Collection progress tracking in sidebar
- `process-queue` API endpoint: `GET /api/process-queue` and `POST /api/process-queue`
- MIGRATION.md created with full setup guide and file inventory

---

## v1.3 — 23 March 2026
**New VM migration**

- Moved entire project to new VirtualBox VM
- `.coinhub_config` created: Notion API token + all 6 database IDs
- `.coinhub_auth.example` and `.coinhub_config.example` created for fresh-machine setup
- Stale queue cleared: 6 invalid `delete_variant` entries with empty `variantCode` discarded
- CoinHub_NewVM_Handover.md created

---

## v1.2 — 20–22 March 2026
**Auth server + sync queue**

- `auth_server.py` created: email + PBKDF2-HMAC-SHA256 password + optional TOTP 2FA
- Sessions: 8-hour cookies, server-side dict
- Sync queue: `.coinhub_sync_queue.json` bridges UI changes to Notion
- Queue types: `add_instance`, `remove_instance`, `delete_variant`
- `delete_variant` handler: archives Notion page via API
- Blocked files: `.coinhub_auth`, `auth_server.py`, `.coinhub_sync_queue.json`, `.coinhub_config` — always 403
- `GET /api/queue` and `POST /api/queue` endpoints

---

## v1.1 — Early March 2026
**Claude Code integration + 2026 coins**

- Coin Collection Claude skill created (coin research, image lookup, Notion check)
- Westminster Collection added as image source (priority 2, after Royal Mint)
- 7 × 2026 coins added to RAW data and COTUK_MAP:
  - Grand Prix Centenary 50p (`UK-COMM-50P-2026-BRGP-`)
  - King's Trust 50th Anniversary 50p (`UK-COMM-50P-2026-KTRU-`)
  - ZSL London Zoo 200th £2 (`UK-COMM-£2-2026-ZSLL-`) — note double-L
  - HMS Beagle 200th £2 (`UK-COMM-£2-2026-BEAG-`)
  - QEII 100th Birthday £5 (`UK-COMM-£5-2026-QEII-`)
  - Winnie the Pooh Kindness 50p (`UK-D-50P-2026-WPKD-`)
  - Dennis the Menace 50p (`UK-D-50P-2026-DENN-`)
- CoinHub Inbox workflow: two-section Notion page for adding new coins and instances
- CoinHub_ClaudeCode_Handoff.md created

---

## v1.0 — February–March 2026
**MVP: single-file gallery with instance tracking**

- Single self-contained HTML file (~415 KB): COTUK_MAP + INSTANCE_DATA + RAW + all UI
- 1,430+ coin variants across 25 collections
- 1,496 physical instance records (which coins owned, where stored, condition)
- 646 COTUK_MAP image entries
- Parchment/antiquarian design system: Bodoni Moda + Cormorant Garamond + DM Mono
- Filterable/sortable table: denomination, status, year, monarch, collection, search
- Inline detail panel per row: metadata + all instances with storage/condition
- Colour-coded variant code display
- Status badges: Got (green) / Need (red) / List (gold)
- Image fallback chain: COTUK_MAP → Royal Mint → placeholder
- CSS design tokens: --ink, --paper, --gold, --got, --need
- Header stats: Got / Need / List / Total
- Critical bugs fixed:
  - `window.COTUK_MAP` → `COTUK_MAP` (const doesn't attach to window)
  - `coin.id` → `coin.variantCode` (no .id field exists)
  - `INSTANCE_DATA` moved to global script scope (was inside a function)
  - `onerror` attributes made single-line (multi-line broke HTML parsing)

---

*CoinHub is Ian's personal UK coin collection tracker. Not a commercial product.*
