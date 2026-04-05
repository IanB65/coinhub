# CoinHub — Claude Code Project Guide

## What this project is

CoinHub is a **single-file HTML/CSS/JS app** (`CoinHub.html`) for Ian's UK coin collection.
It is served locally by `auth_server.py` (Python stdlib only, no dependencies) at `http://localhost:8090`.

- **~415 KB** self-contained file — no framework, no build step
- **1,430+ coin variants**, **1,496 instance records**, **646 image map entries**
- Auth: email + PBKDF2 password + TOTP 2FA
- Notion sync: UI changes are queued; Claude processes them via the Notion MCP server

### Files
```
CoinHub.html                ← THE APP
auth_server.py              ← Python auth + file server (port 8090)
.coinhub_auth               ← Hashed login credentials
.coinhub_config             ← Notion API token + database IDs
.coinhub_sync_queue.json    ← Pending Notion sync operations (process then clear to [])
CLAUDE.md                   ← This file
CoinHub_MASTER_Handover.md  ← Full project handover with credentials
```

### On session start
Read `.coinhub_sync_queue.json`. If it has items, process them via the Notion MCP then clear to `[]`.

---

## Design system

### Typography
| Font | Use |
|------|-----|
| `Bodoni Moda` (serif) | Logo, quantity numbers |
| `Cormorant Garamond` (serif) | Coin names, detail text |
| `DM Mono` (monospace) | UI chrome, codes, labels, all controls |

### CSS custom properties
```css
--ink:    #0C0C0A   /* primary text */
--paper:  #F5F2EB   /* page background */
--paper2: #EDE9DF   /* sidebar background */
--paper3: #E4DFD2   /* hover / detail panel */
--gold:   #8B6914   /* brand / logo */
--gold2:  #C49A2A   /* interactive gold */
--gold3:  #F0C84A   /* highlight gold */
--got:    #2D6A4F   /* "Got" status — green */
--got-bg: #D8F3DC
--need:   #9B2335   /* "Need" status — red */
--need-bg:#FFE4E8
--list:   #1A3A6B   /* "List" status — blue */
--list-bg:#DBEAFE
--border: #C8BFA8   /* dividers */
--muted:  #4A4438   /* secondary text */
--r:      2px       /* border-radius */
```

### Visual style rules
- Parchment / antiquarian aesthetic — warm off-whites, ink tones, gold accents
- No rounded cards; sharp borders with `--r: 2px`
- No box shadows; use borders and background colour changes instead
- Grain overlay on `body::before` (do not remove)
- Transitions: `0.12s` for most UI, `0.15s` for expand animations
- Font sizes are small and precise — do not increase arbitrarily
- Use `letter-spacing` and `text-transform:uppercase` for labels/headings

---

## Cross-platform web development rules

**All changes to CoinHub.html must work on:**
- Windows desktop (Chrome, Edge, Firefox)
- iOS Safari (iPhone and iPad)
- Android Chrome

### Responsive layout strategy
- **Mobile breakpoint:** `max-width: 767px`
- **Tablet breakpoint:** `max-width: 1024px`
- At mobile widths, the sidebar (`260px 1fr` grid) must collapse — sidebar becomes a drawer or moves above the table
- Always include `<meta name="viewport" content="width=device-width, initial-scale=1.0">` (already present)
- Use `min-width: 0` on grid children to prevent overflow

### Touch & iOS-specific rules
- Minimum tap target size: **44×44 px** (Apple HIG requirement)
- Never use `:hover` as the only interaction indicator — pair with `:active` for touch
- iOS Safari ignores `position:sticky` on elements inside `overflow:hidden` — avoid that combination
- iOS Safari bottom bar: add `padding-bottom: env(safe-area-inset-bottom)` to fixed/sticky footers
- Use `-webkit-overflow-scrolling: touch` on scrollable containers for iOS momentum scrolling
- `appearance: none; -webkit-appearance: none` on `<select>` and `<input>` (already applied)
- Avoid `100vh` for full-screen layouts on iOS — use `100dvh` or `min-height: -webkit-fill-available`
- Test fixed headers: iOS Safari's URL bar shrinks/grows and can cause layout jumps

### CSS best practices
- **Mobile-first** where adding new components; **desktop-first** is acceptable when editing existing CSS
- Use CSS custom properties (already established) — never hard-code colours inline
- Prefer `gap` over margins for flex/grid spacing
- Use `flex-wrap: wrap` for rows that must reflow on narrow screens
- `overflow-x: hidden` on `body` prevents horizontal scroll from layout bugs
- Scrollable containers need explicit `overflow-y: auto` and a `max-height`

### JavaScript cross-platform rules
- Event listeners: prefer `addEventListener` over inline `on*` attributes
- Touch events: where click handlers drive UI, they work on touch too — no need to add separate touch handlers unless you need swipe/drag
- `localStorage` works everywhere but can be blocked in private browsing (handle the exception)
- `fetch` is supported everywhere — no polyfills needed
- Avoid `innerText` on table cells — use `textContent` instead (better performance)
- Use `requestAnimationFrame` for any animation driven by JS

### Images
- Always set explicit `width` and `height` attributes on `<img>` to prevent layout shift
- Use `loading="lazy"` for coin images that are off-screen
- Provide `alt` text on all images

### Forms & inputs
- On mobile, set `inputmode` attribute to get the right soft keyboard:
  - `inputmode="numeric"` for number fields
  - `inputmode="email"` for email
  - `inputmode="search"` for search boxes
- `font-size` on `<input>` must be **≥ 16px** to prevent iOS Safari from auto-zooming on focus

### Performance
- The single-file approach means all JS/CSS is inline — keep it that way
- Avoid DOM queries in tight loops — cache selectors
- Use `document.createDocumentFragment()` when building large lists of rows
- `will-change: transform` on elements that animate (use sparingly)

---

## CoinHub HTML structure

```
<head>
  <style> ← all CSS
<body>
  #loadScreen        ← full-screen loading overlay
  <header>           ← sticky top bar, logo + stats
  .app               ← CSS grid: 260px sidebar | 1fr main
    .filters         ← left panel: denomination pills, filters, collection list
    .main            ← right panel: results bar + sticky sort row + coin table
      .coin-table    ← <table> with expandable detail rows
  <script>           ← all JS: COTUK_MAP, INSTANCE_DATA, RAW, UI functions
```

### Key JS globals
| Name | Description |
|------|-------------|
| `COTUK_MAP` | `{ variantCode: imageUrl }` — 646 entries |
| `INSTANCE_DATA` | `{ variantCode: [instances] }` — 1,496 records |
| `RAW` | coin variant rows built by `buildCoinData()` |
| `state` | current filter/sort state |
| `render()` | re-renders the table from current state |
| `syncQueue` | pending Notion operations |

---

## Notion databases
| Name | ID |
|------|----|
| variant | `1bf05769-e1ee-81c7-81dc-000b9d014020` |
| instance | `1a605769-e1ee-80d2-b868-000b80373e62` |
| storage_container | `1d705769-e1ee-80e8-8821-000b783319c7` |
| storage_page | `1d805769-e1ee-807a-9b01-000b22c54e0c` |
| storage_slot | `1d805769-e1ee-801e-b1a4-000b9de0b849` |
| location | `1d805769-e1ee-8042-b4dd-000b1393168e` |

---

## Auth server notes
- `auth_server.py` runs on port `8090`
- Serves `CoinHub.html` at `/`
- Handles `/api/login`, `/api/logout`, `/api/sync-queue` endpoints
- Sessions use signed cookies; remember-device tokens stored for 7 days
- TOTP is optional but enabled for Ian's account
