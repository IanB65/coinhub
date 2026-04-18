# CoinHub Project Memory

## Project Overview
CoinHub is a **single-file HTML/CSS/JS** gallery for a UK coin collection (~529KB).
- No server, no build step — everything self-contained in `CoinHub.html`
- Data source: Notion (second email account, MCP connected)
- 1,430+ coin variants across 25 collections
- See `CoinHub_ClaudeCode_Handoff.md` for full architecture details

## Key Files & Working Directory
- **REAL working directory: `C:/Users/ian/Documents/coinhub/`** ← ALWAYS use this
- `CoinHub.html` — main deliverable (~529KB, all data embedded)
- `CoinHub_MASTER_Handover.md` — full architecture/handoff doc
- `C:/Users/ian/OneDrive/Desktop/Closed/Coins/` — secondary copy, do NOT rely on it

## Hosting Architecture — Vercel + Cloudflare
- **Host: Vercel** (project: `ianb65s-projects/coinhub`, hobby plan)
- **Domain: `coins.ghghome.co.uk`** → Cloudflare DNS (DNS-only CNAME) → Vercel
- **Deploy trigger: push to `main` branch of `IanB65/coinhub` GitHub repo**
- Vercel auto-deploys on every push to `main`
- GitHub Pages is NOT used — do not add CNAME file or index.html redirects for GH Pages
- Netlify is NOT used — ignore all netlify.toml/functions in the repo

## Critical Bugs (FIXED — do not reintroduce)
1. Always use `COTUK_MAP` directly, NEVER `window.COTUK_MAP`
2. Always use `coin.variantCode`, NEVER `coin.id` (coin.id does not exist)
3. `INSTANCE_DATA` must be at script level (global), NOT inside any function
4. `onerror` attributes must be single-line HTML

## Design System
- Parchment/antiquarian aesthetic — NOT modern/tech UI
- Fonts: Bodoni Moda (headings), Cormorant Garamond (body), DM Mono (codes)
- Colors: `--ink:#0C0C0A`, `--paper:#F5F2EB`, `--gold:#8B6914`, `--got:#2D6`, `--need:#E55`

## Notion Integration
- Second email account (not primary)
- 3-step creation pattern: create page → move to data_source → update properties
- Coin Variant data_source_id: `1bf05769-e1ee-81c7-81dc-000b9d014020`
- Instance data_source_id: `1a605769-e1ee-80d2-b868-000b80373e62`
- Parent page: `1a505769-e1ee-806a-883d-c8df0a47b311`
- CoinHub Inbox: https://www.notion.so/32205769e1ee818a8ea8e45f1efcbdca
- Inbox trigger phrase: "Please process the CoinHub Inbox page"

## Notion Sync Queue — CHECK AT SESSION START
- Queue file: `C:\Users\ian\OneDrive\Desktop\Closed\Coins\.coinhub_sync_queue.json`
- **At the start of every session, read this file. If it has items, process them immediately via Notion MCP, then clear the file.**
- add_instance: create Instance record + update Variant status to Got
- edit_instance: update existing Instance record fields in Notion
- remove_instance: archive/remove Instance + revert Variant status if newInstCount=0
- Reference data source IDs for Instance relations:
  - Storage 1: `collection://1d705769-e1ee-80e8-8821-000b783319c7`
  - Storage 2: `collection://1d805769-e1ee-807a-9b01-000b22c54e0c`
  - Storage 3: `collection://1d805769-e1ee-801e-b1a4-000b9de0b849`
  - Condition: `collection://1d805769-e1ee-80f2-b71b-000b9932007f`
  - Preservation Type: `collection://1d905769-e1ee-804e-8473-000b2f0e2f2f`

## Monarch Name Casing (keep as-is from Notion)
- 'King George Vi' ← lowercase 'i' intentional

## 2026 Coins — DONE ✅
All in RAW array + images in COTUK_MAP. Commemoratives use UK-COMM- prefix (NOT UK-D-).
- UK-COMM-50P-2026-BRGP- (Grand Prix Centenary) — coinhunter.co.uk
- UK-COMM-50P-2026-KTRU- (King's Trust) — coinhunter.co.uk
- UK-COMM-£2-2026-ZSLL- (ZSL London Zoo) — coinhunter.co.uk
- UK-COMM-£2-2026-BEAG- (HMS Beagle) — coinhunter.co.uk
- UK-COMM-£5-2026-QEII- (QEII 100th Birthday) — coinhunter.co.uk
- UK-D-50P-2026-WPKD- (Winnie the Pooh Kindness) — royalmint.com globalassets
- UK-D-50P-2026-DENN- (Dennis the Menace) — royalmint.com globalassets

## Coin Skill — Westminster Collection added ✅
The coin-collection skill now includes westminstercollection.co.uk as:
- §1 New Coins: secondary source (UK issues only)
- §2 Images: Step 2 (after Royal Mint)

## Pending Tasks
- Collection progress bars (sidebar)
- Collection overview page (card grid)
- Mobile responsive improvements
- Export to CSV

## Data Scale
- 1,430+ RAW coin entries
- 646+ COTUK_MAP image entries
- 1,496+ instance records

## Deploying Changes
To push CoinHub.html to production: push to `main` branch of `IanB65/coinhub` → Vercel auto-deploys.
Use GitHub API or `git push` from `C:/Users/ian/Documents/coinhub/` (if git is configured there).
