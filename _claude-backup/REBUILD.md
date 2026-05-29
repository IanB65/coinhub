# CoinHub — Rebuild Guide
**Last updated:** May 2026

Use this guide to restore CoinHub from scratch. Everything is recoverable from GitHub + the steps below.

---

## What's where

| Component | Location | Recovery |
|-----------|----------|----------|
| App code (`CoinHub_v2.html`, `api/`, etc.) | GitHub: `IanB65/coinhub` → `main` | Clone the repo |
| Coin data (Variants, Instances, Images) | Google Sheets ID: `1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4` | Google Drive version history |
| Hosting config (`vercel.json`) | GitHub repo | Already in repo |
| Claude Code settings | `_claude-backup/settings.json` (this folder) | See Step 4 |
| Claude Code stop hook | `_claude-backup/stop-hook-git-check.sh` (this folder) | See Step 4 |
| Coin collection skill | `_claude-backup/coin-collection-SKILL.md` (this folder) | See Step 4 |
| Project instructions | `CLAUDE.md` (repo root) | Already in repo |

---

## Step 1 — Clone the repo

```bash
git clone https://github.com/IanB65/coinhub.git
cd coinhub
```

The live app is `CoinHub_v2.html`. The repo also contains all API functions in `api/`.

---

## Step 2 — Set up Vercel

1. Go to [vercel.com](https://vercel.com) and create a new project
2. Import the GitHub repo: `IanB65/coinhub`
3. Framework preset: **Other** (no build step)
4. Root directory: leave as `/`
5. Set all environment variables (see below)
6. Deploy

### Environment variables to set in Vercel

| Variable | Purpose | Where to get it |
|----------|---------|-----------------|
| `GOOGLE_API_KEY` | Google Sheets read-only access | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_SHEET_ID` | Sheet ID | `1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4` |
| `GOOGLE_CLIENT_ID` | OAuth client ID (write operations) | Google Cloud Console → OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Same as above |
| `GOOGLE_REFRESH_TOKEN` | OAuth refresh token | Run OAuth flow once to obtain |
| `COINHUB_JWT_SECRET` | Signs JWT tokens for web app auth | Generate: `openssl rand -hex 32` |
| `COINHUB_SERVICE_KEY` | Auth for scheduled tasks | Generate: `openssl rand -hex 32` |

### Vercel project settings
- Project name: `coinhub`
- Team: `ianb65s-projects`
- Plan: Hobby (free)

---

## Step 3 — Set up Cloudflare DNS

In your Cloudflare dashboard for `ghghome.co.uk`:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `coins` | `cname.vercel-dns.com` | DNS-only (grey cloud — NOT proxied) |

Then in Vercel → Project Settings → Domains, add: `coins.ghghome.co.uk`

---

## Step 4 — Restore Claude Code configuration

These files are all in `_claude-backup/` in the repo.

### settings.json
Copy to `~/.claude/settings.json` (create directory if needed):
```bash
mkdir -p ~/.claude
cp _claude-backup/settings.json ~/.claude/settings.json
```

### Stop hook script
Copy and make executable:
```bash
cp _claude-backup/stop-hook-git-check.sh ~/.claude/stop-hook-git-check.sh
chmod +x ~/.claude/stop-hook-git-check.sh
```

This hook fires when Claude finishes a session and warns if there are uncommitted or unpushed changes.

### Coin collection skill
In Claude Code on the web: open Settings → Skills → add a new skill, paste the contents of `_claude-backup/coin-collection-SKILL.md`.

Or if using Claude Code CLI, place the file at:
```
~/.claude/skills/coin-collection/SKILL.md
```

---

## Step 5 — Set up scheduled tasks

Two tasks need to be re-created in Claude Code on the web (sidebar → Routines):

### weekly-new-coins-check
- **Schedule:** Every Monday at 09:08
- **Trigger:** `Fetch https://www.royalmint.com/new-coins/ and check westminstercollection.co.uk for new UK coin releases. POST any new coins to /api/inbox-stage at https://coins.ghghome.co.uk. Use x-service-key auth header with COINHUB_SERVICE_KEY value. Report how many were staged.`

### coins-inbox-approve (manual)
- **Schedule:** Manual trigger only
- **Trigger:** `Read all rows in the NewCoinsInbox tab of the Google Sheet where approved = TRUE. Append them to the Variants tab (status = Need, dateAdded = today). Then delete the approved rows from NewCoinsInbox.`

---

## Step 6 — Verify deployment

1. Open `https://coins.ghghome.co.uk` — should load the coin gallery
2. Open `https://coins.ghghome.co.uk/CoinHub_v2.html` — same
3. Check `https://coins.ghghome.co.uk/api/sheets-all` returns JSON (needs auth)
4. Confirm coin data loads (Variants and Instances tabs visible in the gallery)

---

## Data recovery

If the Google Sheet is lost:
- Google Drive keeps full version history — go to Google Drive → right-click the sheet → Version history
- There is no separate export backup currently. Consider adding a weekly CSV export as an extra safety net.

If the GitHub repo is lost:
- Vercel keeps previous deployments — you can download the source from any past deploy
- Open Vercel dashboard → Project → Deployments → any deploy → Download

---

## Key reference

- **Live site:** https://coins.ghghome.co.uk
- **GitHub:** https://github.com/IanB65/coinhub
- **Vercel project:** ianb65s-projects/coinhub
- **Google Sheet:** https://docs.google.com/spreadsheets/d/1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4/edit
- **Sheet ID:** `1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4`
