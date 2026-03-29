# CoinHub Remote Access Setup

How to make CoinHub available at `https://coins.ghghome.co.uk` from anywhere.

---

## Step 1 — Add ghghome.co.uk to Cloudflare (once only)

1. Create a free account at **cloudflare.com** if you don't have one
2. Add your domain: Dashboard → Add a Site → enter `ghghome.co.uk` → Free plan
3. Cloudflare will scan your existing DNS records and show you two nameservers, e.g.:
   - `ada.ns.cloudflare.com`
   - `bart.ns.cloudflare.com`
4. Log in to wherever you registered `ghghome.co.uk` (GoDaddy, Namecheap, etc.)
   and replace the nameservers with the ones Cloudflare gave you
5. Wait for propagation — usually 5–30 minutes, Cloudflare will email you when active

---

## Step 2 — Install cloudflared on your PC

Download the Windows installer from:
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Run the installer, then open a new Command Prompt and confirm:
```
cloudflared --version
```

---

## Step 3 — Authenticate cloudflared with your account

```cmd
cloudflared tunnel login
```

A browser window will open. Select your Cloudflare account and authorise it.
This saves a certificate to `C:\Users\<you>\.cloudflared\cert.pem`.

---

## Step 4 — Create the tunnel

```cmd
cloudflared tunnel create coinhub
```

This creates a tunnel with a UUID. Note the UUID printed, e.g. `abc123...`.

---

## Step 5 — Configure the tunnel

Create the file `C:\Users\<you>\.cloudflared\config.yml`:

```yaml
tunnel: coinhub
credentials-file: C:\Users\<YOU>\.cloudflared\<TUNNEL-UUID>.json

ingress:
  - hostname: coins.ghghome.co.uk
    service: http://localhost:8090
  - service: http_status:404
```

Replace `<YOU>` with your Windows username and `<TUNNEL-UUID>` with the UUID from step 4.

---

## Step 6 — Add DNS record in Cloudflare

```cmd
cloudflared tunnel route dns coinhub coins.ghghome.co.uk
```

This creates a CNAME in your Cloudflare DNS automatically.

---

## Step 7 — Test the tunnel

Start CoinHub first:
```cmd
cd "H:\My Drive\Coins\Coins\Claude files"
python auth_server.py
```

Then in a second window, start the tunnel:
```cmd
cloudflared tunnel run coinhub
```

Visit `https://coins.ghghome.co.uk` — you should see the CoinHub login page.

---

## Step 8 — Run everything automatically on Windows startup

### Option A — Task Scheduler (recommended)

1. Open Task Scheduler (search in Start menu)
2. Create Task → name it "CoinHub Server"
3. Triggers → New → At log on → your user account
4. Actions → New → Start a program:
   - Program: `"H:\My Drive\Coins\Coins\Claude files\start_coinhub.bat"`
5. Conditions → uncheck "Start only if on AC power"
6. Settings → check "Run task as soon as possible after a scheduled start is missed"
7. Click OK

Repeat steps 2–7 for a second task named "CoinHub Tunnel":
- Action: Start a program
- Program: `cloudflared`
- Arguments: `tunnel run coinhub`

### Option B — Quick shortcut in Startup folder

Press `Win+R`, type `shell:startup`, press Enter.
Drop a shortcut to `start_coinhub.bat` into that folder.
Create another shortcut with target: `cloudflared tunnel run coinhub`

---

## Sharing access with others

1. Go to `https://coins.ghghome.co.uk/admin` (you must be logged in as admin)
2. Click **Generate Invite Link** — it copies a one-time link to your clipboard
3. Send the link to the person — it expires in 7 days and works once only
4. They visit the link, create their account (with optional 2FA), and get access
5. To remove someone: return to `/admin` and click **Remove** next to their name

---

## Version control & rollback

See GIT_SETUP.md for how to commit versions and roll back.

---

## Security notes

- CoinHub uses HTTPS via Cloudflare's edge (TLS 1.3)
- Login requires email + password (PBKDF2-SHA256, 200k iterations)
- Optional TOTP 2FA per user
- Invite links are single-use and expire after 7 days
- Sessions expire after 8 hours
- Sensitive config files are never served by the web server
