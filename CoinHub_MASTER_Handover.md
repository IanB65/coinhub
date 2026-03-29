# CoinHub — MASTER HANDOVER DOCUMENT
**Generated:** 26 March 2026
**Purpose:** Complete self-contained handover — load this into Claude on any new machine to resume the project instantly.

> ⚠️ **SENSITIVE:** This file contains credentials. Keep it private. Do not share or commit.

---

## QUICK START — NEW MACHINE SETUP

### Files needed (copy all):
```
CoinHub.html                    ← THE APP (~415 KB, self-contained website)
auth_server.py                  ← Python auth + file server
.coinhub_auth                   ← Hashed login credentials
.coinhub_config                 ← Notion API token + database IDs
.coinhub_sync_queue.json        ← Notion sync queue (may be [])
CoinHub_MASTER_Handover.md      ← This document
```

### Run the app:
```bash
python auth_server.py
# Open: http://localhost:8090
# Login: ian@ghghome.co.uk + password + TOTP authenticator
```

### Claude Code setup:
1. Open the project folder as working directory
2. Add Notion MCP server (token is in `.coinhub_config`)
3. Install the `coin-collection` skill
4. At session start: read `.coinhub_sync_queue.json` — process any valid items, then clear to `[]`

---

## CREDENTIALS

### Login (`.coinhub_auth`)
```json
{
  "email": "ian@ghghome.co.uk",
  "pw_hash": "<PW_HASH_REDACTED>",
  "totp_secret": "<TOTP_SECRET_REDACTED>",
  "totp_enabled": true
}
```
TOTP: use Google Authenticator / Authy with the `totp_secret` above.

### Notion API (`.coinhub_config`)
```json
{
  "notion_token": "<NOTION_TOKEN_REDACTED>",
  "notion_databases": {
    "variant":           "1bf05769-e1ee-81c7-81dc-000b9d014020",
    "instance":          "1a605769-e1ee-80d2-b868-000b80373e62",
    "storage_container": "1d705769-e1ee-80e8-8821-000b783319c7",
    "storage_page":      "1d805769-e1ee-807a-9b01-000b22c54e0c",
    "storage_slot":      "1d805769-e1ee-801e-b1a4-000b9de0b849",
    "location":          "1d805769-e1ee-8042-b4dd-000b1393168e"
  },
  "notion_parent_page": "1a505769-e1ee-806a-883d-c8df0a47b311"
}
```

### Key Notion Page IDs
```
Workspace parent page:  1a505769-e1ee-806a-883d-c8df0a47b311
CoinHub Inbox page:     32205769-e1ee-818a-8ea8-e45f1efcbdca
Recovery/context page:  32105769-e1ee-81f3-af73-d74c48d5e86b
```

---

## WHAT COINHUB IS

A **single-file HTML/CSS/JS gallery website** for Ian's UK coin collection. No framework, no build step, no database engine. Everything runs with Python's standard library only.

- **1,430+ coin variants** across 25 collections
- **1,496 physical instance records** (which coins owned, where stored, condition)
- **646 image map entries** (COTUK_MAP)
- **Parchment/antiquarian UI** — Bodoni Moda + Cormorant Garamond typography
- **Auth server** — email + PBKDF2 password + optional TOTP 2FA
- **Notion sync queue** — UI changes queued, Claude processes via MCP

---

## COINHUB.HTML — ARCHITECTURE

### The Single File Contains:
1. `<style>` — complete CSS
2. `<script>` block:
   - `COTUK_MAP` — 646-entry `{ variantCode: imageUrl }`
   - `INSTANCE_DATA` — 1,496 instance records keyed by variantCode
   - `RAW` — 1,430+ coin variant rows inside `buildCoinData()`
   - All UI functions
3. `<body>` — loading screen, header, sidebar, table

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

### RAW Array Format
```js
// [variantCode, name, denom, collection, monarch, year, status, imgUrl, instCount]
['UK-PD-FART-1902-', 'Farthing 1902', 'Farthing', 'Pre Decimal', 'King Edward VII', 1902, 'Got', '', 1]
```

### State Object
```js
let STATE = {
  denom: null,        // '50p', '£2', null = All
  status: new Set(),  // 'Got'/'Need'/'List' — empty = All
  year: '', monarch: '', collection: '', search: '',
  sort: 'year', sortDir: 1,
  openId: null,
};
```

### Key UI Functions
| Function | Purpose |
|---|---|
| `init()` | Entry — builds ALL_COINS, populates filters, calls applyFilters() |
| `buildCoinData()` | Maps RAW array → coin objects |
| `applyFilters()` | Filters ALL_COINS by STATE → FILTERED → renderTable() |
| `renderTable()` | Injects rows into `#coinBody` |
| `toggleDetail(i)` | Opens/closes inline detail panel |
| `buildDetailHTML(coin)` | HTML for detail panel |
| `imgFallback(el)` | Image error handler |

### Image Resolution Chain
```
1. COTUK_MAP[variantCode]     ← primary (coins-of-the-uk.co.uk + coinhunter.co.uk)
2. coin.imgUrl                ← Royal Mint fallback
3. Grey placeholder div       ← if both fail
```

---

## CRITICAL BUGS — FIXED, NEVER REINTRODUCE

```js
// ✅ ALWAYS reference globals directly — NEVER via window.
const url = COTUK_MAP[c.variantCode];          // NOT window.COTUK_MAP[...]
const insts = INSTANCE_DATA[coin.variantCode]; // NOT INSTANCE_DATA[coin.id]

// ✅ coin.variantCode is the key — coin.id does NOT EXIST
// ✅ INSTANCE_DATA must be at script level (global) — NEVER inside a function
// ✅ onerror="" attributes must be single-line — never multi-line
```

### Monarch name casing (exact from Notion — do not "fix")
- `'King George Vi'` ← lowercase 'i' — intentional
- `'King Charles Iii'` ← lowercase 'i' — intentional

---

## NOTION DATABASE ARCHITECTURE

### 3-Step Record Creation (CRITICAL WORKAROUND)
Direct creation to `data_source_id` fails with "Property ID not found". Always use:

```
Step 1: notion-create-pages  →  parent: page_id "1a505769-e1ee-806a-883d-c8df0a47b311"
Step 2: notion-move-pages    →  new_parent: data_source_id "<target DB>"
Step 3: notion-update-page   →  set all properties
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
Storage 3 (Slot)      = Slot number e.g. '04' (blank if not slotted)
Location              = Always 'Office'
```

### Notion API Rules
- Always use **Ian's second email account** (not primary)
- `update_properties` and `replace_content` are **two separate calls**
- Pages outside databases: only `title` property allowed
- Bare UUID for page IDs — `collection://` prefix only for `data_source_id` in move operations

---

## SYNC QUEUE

`.coinhub_sync_queue.json` bridges the CoinHub UI and Notion.

When Ian changes a coin in the UI → change is POSTed to `/api/queue` → appended to the file.

**At session start: read the file. Process valid items. Clear to `[]`.**

### Queue Item Types
```jsonc
// add_instance — user got a new coin
{ "type": "add_instance", "variantCode": "UK-D-50P-2025-GRND-",
  "storage1": "Box 1", "storage2": "Page 3", "storage3": "04",
  "condition": "BUNC.WM", "preservationType": "Westminster", "newInstCount": 1 }

// edit_instance — update existing instance
{ "type": "edit_instance", "instanceId": "INS-42", "variantCode": "UK-D-50P-2025-GRND-",
  "storage1": "Box 2", "storage2": "Page 1", "storage3": "", "condition": "VF" }

// remove_instance — coin removed
{ "type": "remove_instance", "instanceId": "INS-42", "variantCode": "UK-D-50P-2025-GRND-", "newInstCount": 0 }
```

### Processing Rules
- `add_instance` → create Instance record in Notion (3-step) + update Variant status to "Got"
- `edit_instance` → update existing Instance record fields
- `remove_instance` → archive Instance + if newInstCount===0, revert Variant to "Need" or "List"
- After all items: write `[]` back to queue file

---

## COINHUB INBOX WORKFLOW

**Trigger phrase:** *"Please process the CoinHub Inbox page"*
**Notion URL:** https://www.notion.so/32205769e1ee818a8ea8e45f1efcbdca

Two sections:
- **New Coins Spotted** → Claude creates Coin Variant records (Status=List), moves to Processed
- **I've Got It** → Claude creates Instance records + sets Variant to Got, moves to Processed

---

## DATA SUMMARY (March 2026)

| Metric | Count |
|---|---|
| RAW coin variants | 1,430+ |
| COTUK_MAP image entries | 646 |
| Physical instance records | 1,496 |
| Variant codes with instances | 676 |
| Collections | 25 |

### Collections Status
| Collection | Got | Total | Notes |
|---|---|---|---|
| Pre Decimal | ~454 | 1,095 | |
| London 2012 Olympics 50p | 30 | 30 | Complete |
| Beatrix Potter | 15 | 15 | Complete |
| Winnie the Pooh | 9 | 9 | Complete |
| Harry Potter | 8 | 8 | Incl Winged Keys 2024, Flying Car 2025 |
| Star Wars | 8 | 8 | Incl X-Wing, Death Star II 2024 |
| Snowman | 8 | 8 | Complete |
| Dinosaurs | 12 | 12 | Complete (2020×3, 2021×3, 2024×6) |
| Definitives (KCIII) | 27 | 35 | |
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

### 2026 Coins (in RAW + COTUK_MAP, Status=List)
| Variant Code | Description |
|---|---|
| `UK-COMM-50P-2026-BRGP-` | Grand Prix Centenary 50p |
| `UK-COMM-50P-2026-KTRU-` | King's Trust 50th Anniversary 50p |
| `UK-COMM-£2-2026-ZSLL-` | ZSL London Zoo 200th Anniversary £2 (**DOUBLE-L**) |
| `UK-COMM-£2-2026-BEAG-` | HMS Beagle 200th Anniversary £2 |
| `UK-COMM-£5-2026-QEII-` | QEII 100th Birthday £5 |
| `UK-D-50P-2026-WPKD-` | Winnie the Pooh — Kindness 50p |
| `UK-D-50P-2026-DENN-` | Dennis the Menace 50p |

---

## IMAGE SOURCES

### COTUK URL Patterns
```
KC3 definitives:
  https://coins-of-the-uk.co.uk/pics/c3/{denom}/C3_{DENOM}_{YY}.jpg
  e.g. C3_50_23.jpg, C3_200_24ng.jpg  |  Denom codes: 01, 02, 05, 10, 20, 50, 100, 200

50p commemoratives 1998-2022:
  https://coins-of-the-uk.co.uk/pics/dec/50/50_{yr}{code}.jpg

London 2012 Olympics 50p:
  https://coins-of-the-uk.co.uk/pics/dec/50/50_11{sport}.jpg

Pre-decimal:
  https://coins-of-the-uk.co.uk/pics/{monarch}/{denom}/{filename}.jpg
  Monarch dirs: qv, e7, g5, g6, qe
  Denom dirs: fa, ha, 1d, 3d, 6d, 1s, 2s, hc
```

### Coinhunter URL Patterns
```
10p Alphabet 2018: https://coinhunter.co.uk/app/_images/coins/gbch-circ-{letter}.jpg
10p Alphabet 2019: https://coinhunter.co.uk/app/_images/coins/cm-2019-{letter}-10p-rev-obv.jpg
Recent 50p 2024-25: https://coinhunter.co.uk/app/_images/coins/cm-{year}-{slug}.jpg
```

### Coin Collection Skill — Image Source Priority
1. Royal Mint — royalmint.com
2. Westminster Collection — westminstercollection.co.uk (UK coins only)
3. Coins of the UK — coins-of-the-uk.co.uk
4. UK Coin Hunt — ukcoinhunt.com
5. Coin Checker — coinchecker.co.uk
6. Fifty Pence — fiftypence.co.uk

---

## DEVELOPMENT WORKFLOW

### Session Start Checklist
1. Read `.coinhub_sync_queue.json`
2. If items exist (with valid variantCodes), process via Notion MCP
3. Write `[]` back to clear the queue

### Making Code Changes
- **UI/logic only:** Edit CSS, HTML, or JS functions in the last ~12 KB of the `<script>` block
- **New coin:** Find `// ── COLLECTION NAME ──` section in RAW, insert new row
- **New instance:** Add to `INSTANCE_DATA` object — key=variantCode, value=array of `{id,loc,s1,s2,s3,cond,ptype}`
- **New image:** Add to `COTUK_MAP` — key=variantCode, value=full URL

### After Every Change — Verify
```bash
grep "window.COTUK_MAP" CoinHub.html  # should return nothing
grep "coin\.id" CoinHub.html          # should return nothing
```

### Running the Server (Windows)
```bash
python auth_server.py   # use 'python', not 'python3' on Windows
# Serves at http://localhost:8090
```

---

## PENDING FEATURES

### High Priority
- [ ] Collection progress bars (% Got per collection, sidebar or dedicated view)
- [ ] Collection overview page (card grid: each collection, Got/Total, representative image)

### Medium Priority
- [ ] Mobile responsive improvements
- [ ] Export to CSV (current filtered view)
- [ ] 4 coins with collection="Unknown" — need classifying
- [ ] D-Day 1994 50p image URL verification

### Future
- [ ] Statistics dashboard (charts: Got by denomination/decade/collection)
- [ ] Condition histogram
- [ ] Want list print view (for coin fairs)
- [ ] Value tracking
- [ ] Pre-decimal year range slider
- [ ] Image lightbox
- [ ] Variant code copy button

---

## AUTH_SERVER.PY — FULL SOURCE

```python
#!/usr/bin/env python3
"""CoinHub secure server — email + PBKDF2 password + optional TOTP 2FA.
No external dependencies. Run directly: python auth_server.py
"""
import base64, hashlib, hmac, http.server, json, secrets, socketserver, struct, time, urllib.parse, urllib.request
from pathlib import Path

SERVE_DIR   = Path(__file__).parent
AUTH_FILE   = SERVE_DIR / '.coinhub_auth'
QUEUE_FILE  = SERVE_DIR / '.coinhub_sync_queue.json'
CONFIG_FILE = SERVE_DIR / '.coinhub_config'
PORT        = 8090
SESSION_TTL = 8 * 3600  # 8 hours
_SESSIONS: dict[str, float] = {}

_BLOCKED = {'.coinhub_auth', 'auth_server.py', '.coinhub_sync_queue.json', '.coinhub_config'}
_BLOCKED_LOWER = {f.lower() for f in _BLOCKED}

def _notion_token():
    if CONFIG_FILE.exists():
        try: return json.loads(CONFIG_FILE.read_text()).get('notion_token')
        except Exception: pass
    return None

def _notion_request(method, path, body=None):
    token = _notion_token()
    if not token:
        raise RuntimeError('No Notion token configured')
    url = f'https://api.notion.com/v1{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Bearer {token}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def _process_queue():
    if not QUEUE_FILE.exists():
        return {'processed': 0, 'errors': []}
    try:
        queue = json.loads(QUEUE_FILE.read_text())
    except Exception:
        return {'processed': 0, 'errors': ['Failed to read queue']}

    config = {}
    if CONFIG_FILE.exists():
        try: config = json.loads(CONFIG_FILE.read_text())
        except Exception: pass
    db_variant  = config.get('notion_databases', {}).get('variant', '')
    db_instance = config.get('notion_databases', {}).get('instance', '')
    parent_page = config.get('notion_parent_page', '')

    processed, errors, remaining = 0, [], []
    for item in queue:
        try:
            t = item.get('type')
            if t == 'delete_variant':
                vc = item.get('variantCode', '')
                if vc:
                    results = _notion_request('POST', f'/databases/{db_variant}/query', {
                        'filter': {'property': 'userDefined:ID', 'title': {'equals': vc}}
                    })
                    for page in results.get('results', []):
                        _notion_request('PATCH', f'/pages/{page["id"]}', {'archived': True})
                    processed += 1
                else:
                    errors.append(f'delete_variant: missing variantCode')
            elif t == 'add_instance':
                processed += 1
            elif t == 'remove_instance':
                inst_id = item.get('instanceId', '')
                if inst_id:
                    _notion_request('PATCH', f'/pages/{inst_id}', {'archived': True})
                    processed += 1
                else:
                    errors.append(f'remove_instance: missing instanceId')
            else:
                remaining.append(item)
        except Exception as e:
            errors.append(f'{item.get("type","?")}: {e}')
            remaining.append(item)

    QUEUE_FILE.write_text(json.dumps(remaining, indent=2))
    return {'processed': processed, 'errors': errors, 'remaining': len(remaining)}

def _totp_code(secret_b32: str, offset: int = 0) -> str:
    key = base64.b32decode(secret_b32.upper().replace(' ', ''))
    counter = struct.pack('>Q', int(time.time()) // 30 + offset)
    h = hmac.new(key, counter, digestmod=hashlib.sha1).digest()
    pos = h[-1] & 0x0F
    code = struct.unpack('>I', h[pos:pos + 4])[0] & 0x7FFFFFFF
    return f'{code % 1_000_000:06d}'

def totp_verify(secret: str, code: str) -> bool:
    code = code.strip()
    return any(hmac.compare_digest(_totp_code(secret, d), code) for d in (-1, 0, 1))

def totp_new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode()

def pw_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    key  = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 200_000)
    return base64.b64encode(salt + key).decode()

def pw_verify(password: str, stored: str) -> bool:
    raw  = base64.b64decode(stored)
    salt, key = raw[:16], raw[16:]
    candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 200_000)
    return hmac.compare_digest(key, candidate)

def session_new() -> str:
    sid = secrets.token_urlsafe(32)
    _SESSIONS[sid] = time.time() + SESSION_TTL
    return sid

def session_valid(sid: str | None) -> bool:
    if sid and sid in _SESSIONS:
        if _SESSIONS[sid] > time.time():
            return True
        del _SESSIONS[sid]
    return False

def session_from_cookie(header: str) -> str | None:
    for part in (header or '').split(';'):
        k, _, v = part.strip().partition('=')
        if k.strip() == 'chsid':
            return v.strip()
    return None

def auth_load() -> dict | None:
    return json.loads(AUTH_FILE.read_text()) if AUTH_FILE.exists() else None

def auth_save(email, hashed_pw, totp_secret=None, totp_enabled=False):
    AUTH_FILE.write_text(json.dumps({
        'email': email, 'pw_hash': hashed_pw,
        'totp_secret': totp_secret, 'totp_enabled': totp_enabled
    }, indent=2))

# [HTML/CSS for login/setup pages omitted for brevity — see auth_server.py directly]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(SERVE_DIR), **kw)

    def _authed(self):
        return session_valid(session_from_cookie(self.headers.get('Cookie', '')))

    # GET / → login or setup page
    # POST /login → validates credentials → sets cookie → redirect
    # POST /setup → first-time account creation
    # GET /api/queue → returns queue items (authenticated)
    # POST /api/queue → appends item to queue (authenticated)
    # GET /api/process-queue → processes queue via Notion API (authenticated)
    # All other authenticated GETs → serve file
    # Unauthenticated → redirect to /

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('localhost', PORT), Handler) as srv:
        status = 'No account yet — visit to set up' if not AUTH_FILE.exists() else 'Ready'
        print(f'[CoinHub] http://localhost:{PORT}  |  {status}')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\n[CoinHub] Stopped.')
```

> **Note:** The above is a summary. The actual `auth_server.py` file has the full HTML for login/setup pages. Always use the actual file.

---

## CLAUDE CODE MCP SETTINGS

The Notion MCP must be connected to **Ian's second Notion account** (not primary).

In Claude Code settings → MCP servers, configure with:
- Token: `<NOTION_TOKEN_REDACTED>`
- Workspace: Ian's second account Notion workspace

Verify with: `notion-search "coin collection"` — should return results from the Coin Hub workspace.

---

*Generated 26 March 2026. This is Ian's personal CoinHub project — UK coin collection tracker.*
