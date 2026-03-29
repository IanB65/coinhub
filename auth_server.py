#!/usr/bin/env python3
"""CoinHub secure server — email + PBKDF2 password + optional TOTP 2FA.
No external dependencies. Run directly: python auth_server.py
"""
import base64, hashlib, hmac, http.server, json, secrets, socketserver, struct, time, urllib.parse, urllib.request
from pathlib import Path

SERVE_DIR    = Path(__file__).parent
AUTH_FILE    = SERVE_DIR / '.coinhub_auth'
QUEUE_FILE   = SERVE_DIR / '.coinhub_sync_queue.json'
CONFIG_FILE  = SERVE_DIR / '.coinhub_config'
CHANGES_FILE = SERVE_DIR / 'coinhub_changes.log'
PORT        = 8090
SESSION_TTL = 8 * 3600  # 8 hours
_SESSIONS: dict[str, float] = {}

# ── SENSITIVE FILES (never served) ───────────────────────────────────────────
_BLOCKED = {'.coinhub_auth', 'auth_server.py', '.coinhub_sync_queue.json', '.coinhub_config', 'coinhub_changes.log'}
_BLOCKED_LOWER = {f.lower() for f in _BLOCKED}  # case-insensitive match for Windows FS

# ── NOTION API ────────────────────────────────────────────────────────────────
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

def _append_changes(entries):
    """Append processed change entries to the persistent log file (one JSON object per line)."""
    with open(CHANGES_FILE, 'a', encoding='utf-8') as f:
        for e in entries:
            f.write(json.dumps({**e, 'processedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}) + '\n')

def _lookup_notion_page(db_id, name):
    """Return first Notion page ID where the Name title property equals `name`, or None."""
    if not name or not db_id:
        return None
    try:
        results = _notion_request('POST', f'/databases/{db_id}/query', {
            'filter': {'property': 'Name', 'title': {'equals': name}}
        })
        pages = results.get('results', [])
        return pages[0]['id'] if pages else None
    except Exception:
        return None

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
    dbs         = config.get('notion_databases', {})
    db_variant  = dbs.get('variant', '')
    db_instance = dbs.get('instance', '')
    db_s1       = dbs.get('storage_container', '')
    db_s2       = dbs.get('storage_page', '')
    db_s3       = dbs.get('storage_slot', '')
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
                    _append_changes([item])
                    processed += 1
                else:
                    errors.append('delete_variant: missing variantCode')

            elif t == 'add_instance':
                # Handled by Claude MCP — skip silently
                processed += 1

            elif t == 'remove_instance':
                inst_formula_id = item.get('instId', '')
                if inst_formula_id:
                    # Find the actual Notion page by its formula ID property
                    results = _notion_request('POST', f'/databases/{db_instance}/query', {
                        'filter': {'property': 'ID', 'formula': {'string': {'equals': inst_formula_id}}}
                    })
                    for page in results.get('results', []):
                        _notion_request('PATCH', f'/pages/{page["id"]}', {'archived': True})
                    _append_changes([item])
                    processed += 1
                else:
                    errors.append('remove_instance: missing instId')

            elif t == 'edit_instance':
                inst = item.get('inst', {})
                inst_formula_id = inst.get('id', '')
                if inst_formula_id:
                    results = _notion_request('POST', f'/databases/{db_instance}/query', {
                        'filter': {'property': 'ID', 'formula': {'string': {'equals': inst_formula_id}}}
                    })
                    for page in results.get('results', []):
                        props = {}
                        if inst.get('cond'):
                            props['Condition'] = {'rich_text': [{'text': {'content': inst['cond']}}]}
                        if inst.get('ptype'):
                            props['Preservation Type'] = {'select': {'name': inst['ptype']}}
                        # Storage relations — look up page IDs by name
                        s1_id = _lookup_notion_page(db_s1, inst.get('s1'))
                        if s1_id:
                            props['Storage 1'] = {'relation': [{'id': s1_id}]}
                        s2_id = _lookup_notion_page(db_s2, inst.get('s2'))
                        if s2_id:
                            props['Storage 2'] = {'relation': [{'id': s2_id}]}
                        s3_id = _lookup_notion_page(db_s3, inst.get('s3'))
                        if s3_id:
                            props['Storage 3'] = {'relation': [{'id': s3_id}]}
                        if props:
                            _notion_request('PATCH', f'/pages/{page["id"]}', {'properties': props})
                    _append_changes([item])
                    processed += 1
                else:
                    errors.append('edit_instance: missing inst.id')

            elif t == 'variant_edit':
                vc = item.get('variantCode', '')
                if vc:
                    results = _notion_request('POST', f'/databases/{db_variant}/query', {
                        'filter': {'property': 'userDefined:ID', 'title': {'equals': vc}}
                    })
                    for page in results.get('results', []):
                        props = {}
                        if item.get('status'):
                            props['Status'] = {'select': {'name': item['status']}}
                        if item.get('collection'):
                            props['Collection'] = {'select': {'name': item['collection']}}
                        if props:
                            _notion_request('PATCH', f'/pages/{page["id"]}', {'properties': props})
                    _append_changes([item])
                    processed += 1
                else:
                    errors.append('variant_edit: missing variantCode')

            else:
                # Unknown type — leave in queue
                remaining.append(item)
        except Exception as e:
            errors.append(f'{item.get("type","?")}: {e}')
            remaining.append(item)

    QUEUE_FILE.write_text(json.dumps(remaining, indent=2))
    return {'processed': processed, 'errors': errors, 'remaining': len(remaining)}

# ── TOTP (RFC 6238, SHA-1, 30-second window) ──────────────────────────────────
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

# ── PASSWORD (PBKDF2-HMAC-SHA256, 200k iterations) ────────────────────────────
def pw_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    key  = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 200_000)
    return base64.b64encode(salt + key).decode()

def pw_verify(password: str, stored: str) -> bool:
    raw  = base64.b64decode(stored)
    salt, key = raw[:16], raw[16:]
    candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 200_000)
    return hmac.compare_digest(key, candidate)

# ── SESSIONS ──────────────────────────────────────────────────────────────────
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

# ── AUTH CONFIG ───────────────────────────────────────────────────────────────
def auth_load() -> dict | None:
    return json.loads(AUTH_FILE.read_text()) if AUTH_FILE.exists() else None

def auth_save(email, hashed_pw, totp_secret=None, totp_enabled=False):
    AUTH_FILE.write_text(json.dumps({
        'email': email, 'pw_hash': hashed_pw,
        'totp_secret': totp_secret, 'totp_enabled': totp_enabled
    }, indent=2))

# ── HTML ──────────────────────────────────────────────────────────────────────
_CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#0C0C0A;--paper:#F5F2EB;--p2:#EDE9DF;--gold:#8B6914;--g2:#C49A2A;
      --bdr:#C8BFA8;--mut:#4A4438;--need:#9B2335;--got:#2D6A4F;--r:2px}
body{font-family:'DM Mono',monospace,sans-serif;background:var(--paper);
     color:var(--ink);min-height:100vh;display:flex;align-items:center;
     justify-content:center;padding:2rem}
.card{background:var(--p2);border:1px solid var(--bdr);border-radius:4px;
      padding:2.5rem 2rem;width:420px;display:flex;flex-direction:column;gap:1rem}
.logo{font-size:1.5rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;
      color:var(--gold);text-align:center;font-family:Georgia,serif}
.logo span{color:var(--ink);font-weight:400;font-style:italic}
h3{font-size:.6rem;letter-spacing:.15em;text-transform:uppercase;color:var(--mut)}
label{display:block;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;
      color:var(--mut);margin-bottom:.25rem}
.field{margin-bottom:.7rem}
input[type=email],input[type=password],input[type=text]{width:100%;padding:.4rem .6rem;
  border:1px solid var(--bdr);border-radius:var(--r);background:var(--paper);
  font-family:inherit;font-size:.75rem;color:var(--ink);outline:none}
input:focus{border-color:var(--g2)}
.btn{width:100%;padding:.5rem;border:1px solid var(--gold);border-radius:var(--r);
     background:transparent;cursor:pointer;font-family:inherit;font-size:.7rem;
     color:var(--gold);transition:all .12s;margin-top:.2rem}
.btn:hover{background:var(--gold);color:#fff}
.err{font-size:.62rem;color:var(--need);text-align:center;min-height:1rem}
.hint{font-size:.55rem;color:var(--mut);line-height:1.5}
.totp-box{background:var(--paper);border:1px solid var(--bdr);border-radius:var(--r);
          padding:.75rem;display:flex;flex-direction:column;gap:.4rem}
.secret{font-family:'DM Mono',monospace;font-size:.75rem;color:var(--gold);
        font-weight:600;word-break:break-all;cursor:pointer;padding:.3rem .4rem;
        background:var(--p2);border-radius:var(--r)}
.check-row{display:flex;align-items:center;gap:.4rem;font-size:.65rem;cursor:pointer}
.check-row input{width:auto}
"""

def _page(title, body):
    return f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Coin Hub — {title}</title><style>{_CSS}</style></head>
<body>{body}</body></html>"""

def login_page(error='', show_totp=False):
    totp = '<div class="field"><label>Authenticator Code</label><input type="text" name="totp" maxlength="6" placeholder="000000" autocomplete="one-time-code"></div>' if show_totp else ''
    return _page('Sign In', f"""<div class="card">
  <div class="logo">Coin <span>Hub</span></div>
  <form method="POST" action="/login">
    <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"></div>
    <div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>
    {totp}
    <p class="err">{error}</p>
    <button class="btn" type="submit">Sign In</button>
  </form>
</div>""")

def setup_page(prefill='', error='', totp_secret=None, totp_checked=True):
    secret = totp_secret or totp_new_secret()
    uri = f'otpauth://totp/CoinHub?secret={secret}&issuer=CoinHub'
    totp_block = f"""<div class="totp-box" id="totpBox">
  <span class="hint"><b>Add to Google Authenticator / Authy</b> using "Enter a setup key":</span>
  <span class="secret" onclick="navigator.clipboard.writeText(this.textContent).then(()=>this.style.color='var(--got)')" title="Click to copy">{secret}</span>
  <span class="hint">Or use this URI:</span>
  <a href="{uri}" style="font-size:.5rem;color:#1A3A6B;word-break:break-all">{uri}</a>
  <span class="hint">Then enter the 6-digit code below to confirm:</span>
  <input type="text" name="totp_verify" maxlength="6" placeholder="000000" style="width:120px">
  <input type="hidden" name="totp_secret" value="{secret}">
</div>"""
    checked = 'checked' if totp_checked else ''
    return _page('Setup', f"""<div class="card">
  <div class="logo">Coin <span>Hub</span></div>
  <h3>First-time setup</h3>
  <form method="POST" action="/setup">
    <div class="field"><label>Your Email</label><input type="email" name="email" required value="{prefill}"></div>
    <div class="field"><label>Password (min 8 chars)</label><input type="password" name="password" required minlength="8"></div>
    <div class="field"><label>Confirm Password</label><input type="password" name="password2" required></div>
    <div class="field">
      <label class="check-row">
        <input type="checkbox" name="enable_2fa" {checked} onchange="document.getElementById('totpBox').style.display=this.checked?'flex':'none'"> Enable two-factor authentication (TOTP)
      </label>
    </div>
    {totp_block}
    <p class="err">{error}</p>
    <button class="btn" type="submit">Create Account &amp; Sign In</button>
  </form>
</div>""")

# ── REQUEST HANDLER ───────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(SERVE_DIR), **kw)

    def log_message(self, fmt, *args):
        ts = time.strftime('%H:%M:%S')
        print(f'  [{ts}] {fmt % args}')

    def _authed(self):
        return session_valid(session_from_cookie(self.headers.get('Cookie', '')))

    def _html(self, html, status=200, cookie=None):
        body = html.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, loc, cookie=None):
        self.send_response(302)
        self.send_header('Location', loc)
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()

    def _body(self):
        n = int(self.headers.get('Content-Length', 0))
        return dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))

    def _raw_body(self):
        n = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(n)

    def _json_resp(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0].lstrip('/')
        auth = auth_load()

        # Block sensitive files always — case-insensitive (Windows FS) + dot-file catch-all
        if path.lower() in _BLOCKED_LOWER or path.startswith('.'):
            self.send_response(403); self.end_headers(); return

        if path == 'logout':
            self._redirect('/', cookie='chsid=; Max-Age=0; Path=/; HttpOnly')
            return

        if auth is None:
            self._html(setup_page()); return

        if path in ('', 'login'):
            if self._authed():
                self._redirect('/CoinHub.html')
            else:
                self._html(login_page(show_totp=auth.get('totp_enabled', False)))
            return

        if path == 'api/queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            queue = []
            if QUEUE_FILE.exists():
                try: queue = json.loads(QUEUE_FILE.read_text())
                except Exception: queue = []
            self._json_resp({'items': queue})
            return

        if path == 'api/process-queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            result = _process_queue()
            print(f'[CoinHub] Queue processed: {result}')
            self._json_resp(result)
            return

        if self._authed():
            super().do_GET()
        else:
            self._redirect('/')

    def do_POST(self):
        path = self.path.split('?')[0].lstrip('/')
        auth = auth_load()

        if path == 'api/process-queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            self._raw_body()  # consume body
            result = _process_queue()
            print(f'[CoinHub] Queue processed: {result}')
            self._json_resp(result)
            return

        if path == 'api/save-audit-log':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            try:
                log = json.loads(self._raw_body())
                if not isinstance(log, list):
                    raise ValueError('Expected JSON array')
                CHANGES_FILE.write_text(json.dumps(log, indent=2), encoding='utf-8')
                self._json_resp({'ok': True, 'saved': len(log)})
            except Exception as e:
                self._json_resp({'error': str(e)}, 400)
            return

        if path == 'api/queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            try:
                item = json.loads(self._raw_body())
            except Exception:
                self._json_resp({'error': 'invalid json'}, 400); return
            queue = []
            if QUEUE_FILE.exists():
                try: queue = json.loads(QUEUE_FILE.read_text())
                except Exception: queue = []
            item['queuedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            queue.append(item)
            QUEUE_FILE.write_text(json.dumps(queue, indent=2))
            print(f'[CoinHub] Queued {item.get("type","?")} — {item.get("variantCode","?")} ({len(queue)} pending)')
            self._json_resp({'ok': True, 'queued': len(queue)})
            return

        data = self._body()

        if path == 'setup':
            email    = data.get('email', '').strip().lower()
            pw       = data.get('password', '')
            pw2      = data.get('password2', '')
            use_2fa  = 'enable_2fa' in data
            secret   = data.get('totp_secret', '')
            code     = data.get('totp_verify', '')

            def err(msg):
                self._html(setup_page(prefill=email, error=msg, totp_secret=secret, totp_checked=use_2fa))

            if not email:               return err('Email is required.')
            if len(pw) < 8:             return err('Password must be at least 8 characters.')
            if pw != pw2:               return err('Passwords do not match.')
            if use_2fa:
                if not secret:          return err('No TOTP secret present.')
                if not totp_verify(secret, code):
                    return err('Authenticator code is incorrect — please try again.')

            auth_save(email, pw_hash(pw), secret if use_2fa else None, use_2fa)
            print(f'[CoinHub] Account created: {email} | 2FA: {use_2fa}')
            sid = session_new()
            self._redirect('/CoinHub.html',
                cookie=f'chsid={sid}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Strict')

        elif path == 'login':
            if auth is None:
                self._redirect('/'); return
            email = data.get('email', '').strip().lower()
            pw    = data.get('password', '')
            code  = data.get('totp', '')
            show_totp = auth.get('totp_enabled', False)

            if email != auth['email'].lower() or not pw_verify(pw, auth['pw_hash']):
                self._html(login_page('Invalid email or password.', show_totp))
                return

            if show_totp and not totp_verify(auth['totp_secret'], code):
                self._html(login_page('Authenticator code is incorrect.', show_totp))
                return

            sid = session_new()
            print(f'[CoinHub] Login: {email}')
            self._redirect('/CoinHub.html',
                cookie=f'chsid={sid}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Strict')
        else:
            self.send_response(404); self.end_headers()


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('localhost', PORT), Handler) as srv:
        status = 'No account yet — visit to set up' if not AUTH_FILE.exists() else 'Ready'
        print(f'[CoinHub] http://localhost:{PORT}  |  {status}')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\n[CoinHub] Stopped.')
