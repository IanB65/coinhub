#!/usr/bin/env python3
"""CoinHub secure server — multi-user, email + PBKDF2 password + optional TOTP 2FA.
No external dependencies. Run directly: python auth_server.py
"""
import base64, hashlib, hmac, http.server, json, secrets, socketserver, struct, time, urllib.parse, urllib.request
from pathlib import Path

SERVE_DIR   = Path(__file__).parent
AUTH_FILE   = SERVE_DIR / '.coinhub_auth'
QUEUE_FILE  = SERVE_DIR / '.coinhub_sync_queue.json'
CONFIG_FILE = SERVE_DIR / '.coinhub_config'
PORT        = 8090
SESSION_TTL = 8 * 3600   # 8 hours
INVITE_TTL  = 7 * 86400  # 7 days

_SESSIONS: dict[str, dict] = {}  # token → {expires, user_id, email, role}

# ── SENSITIVE FILES (never served) ───────────────────────────────────────────
_BLOCKED = {'.coinhub_auth', 'auth_server.py', '.coinhub_sync_queue.json', '.coinhub_config'}
_BLOCKED_LOWER = {f.lower() for f in _BLOCKED}

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
                # Handled by Claude MCP — skip silently
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
def session_new(user: dict) -> str:
    sid = secrets.token_urlsafe(32)
    _SESSIONS[sid] = {
        'expires': time.time() + SESSION_TTL,
        'user_id': user['id'],
        'email':   user['email'],
        'role':    user['role'],
    }
    return sid

def session_get(sid: str | None) -> dict | None:
    if sid and sid in _SESSIONS:
        s = _SESSIONS[sid]
        if s['expires'] > time.time():
            return s
        del _SESSIONS[sid]
    return None

def session_from_cookie(header: str) -> str | None:
    for part in (header or '').split(';'):
        k, _, v = part.strip().partition('=')
        if k.strip() == 'chsid':
            return v.strip()
    return None

def session_invalidate_user(user_id: str):
    """Remove all sessions for a given user (e.g. after account deletion)."""
    for sid in [k for k, v in _SESSIONS.items() if v['user_id'] == user_id]:
        del _SESSIONS[sid]

# ── AUTH DATA ─────────────────────────────────────────────────────────────────
def auth_load() -> dict:
    """Load auth data, auto-migrating from old single-user format."""
    if not AUTH_FILE.exists():
        return {'users': [], 'invites': []}
    data = json.loads(AUTH_FILE.read_text())
    # Migrate old single-user format (has 'email' at top level)
    if 'email' in data:
        data = {
            'users': [{
                'id':           secrets.token_hex(8),
                'email':        data['email'],
                'pw_hash':      data['pw_hash'],
                'totp_secret':  data.get('totp_secret'),
                'totp_enabled': data.get('totp_enabled', False),
                'role':         'admin',
                'created_at':   time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }],
            'invites': [],
        }
        AUTH_FILE.write_text(json.dumps(data, indent=2))
        print('[CoinHub] Migrated auth file to multi-user format')
    return data

def auth_save(data: dict):
    AUTH_FILE.write_text(json.dumps(data, indent=2))

def auth_find_user(email: str) -> dict | None:
    return next((u for u in auth_load()['users'] if u['email'].lower() == email.lower()), None)

def auth_find_user_by_id(uid: str) -> dict | None:
    return next((u for u in auth_load()['users'] if u['id'] == uid), None)

def auth_add_user(email, hashed_pw, totp_secret=None, totp_enabled=False, role='user') -> dict:
    data = auth_load()
    user = {
        'id':           secrets.token_hex(8),
        'email':        email.lower(),
        'pw_hash':      hashed_pw,
        'totp_secret':  totp_secret,
        'totp_enabled': totp_enabled,
        'role':         role,
        'created_at':   time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    data['users'].append(user)
    auth_save(data)
    return user

def auth_remove_user(uid: str) -> bool:
    data = auth_load()
    before = len(data['users'])
    data['users'] = [u for u in data['users'] if u['id'] != uid]
    if len(data['users']) < before:
        auth_save(data)
        return True
    return False

def auth_create_invite(admin_email: str) -> str:
    data = auth_load()
    token = secrets.token_urlsafe(32)
    data['invites'].append({
        'token':      token,
        'created_by': admin_email,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'expires_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + INVITE_TTL)),
        'used':       False,
    })
    auth_save(data)
    return token

def auth_find_invite(token: str) -> dict | None:
    data = auth_load()
    inv = next((i for i in data['invites'] if i['token'] == token and not i['used']), None)
    if inv:
        try:
            exp = time.mktime(time.strptime(inv['expires_at'], '%Y-%m-%dT%H:%M:%SZ'))
            if exp > time.time():
                return inv
        except Exception:
            pass
    return None

def auth_use_invite(token: str):
    data = auth_load()
    for inv in data['invites']:
        if inv['token'] == token:
            inv['used'] = True
    auth_save(data)

# ── COOKIE HELPER ─────────────────────────────────────────────────────────────
def _make_cookie(sid: str, forwarded_proto: str = '') -> str:
    secure = '; Secure' if forwarded_proto.lower() == 'https' else ''
    return f'chsid={sid}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Lax{secure}'

def _clear_cookie() -> str:
    return 'chsid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'

# ── HTML / CSS ────────────────────────────────────────────────────────────────
_CSS = """
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#0C0C0A;--paper:#F5F2EB;--p2:#EDE9DF;--gold:#8B6914;--g2:#C49A2A;
      --bdr:#C8BFA8;--mut:#4A4438;--need:#9B2335;--got:#2D6A4F;--r:2px}
body{font-family:'DM Mono',monospace,sans-serif;background:var(--paper);
     color:var(--ink);min-height:100vh;display:flex;align-items:center;
     justify-content:center;padding:2rem}
.card{background:var(--p2);border:1px solid var(--bdr);border-radius:4px;
      padding:2.5rem 2rem;width:460px;display:flex;flex-direction:column;gap:1rem}
.card.wide{width:620px}
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
.btn-sm{width:auto;padding:.3rem .7rem;font-size:.6rem;margin-top:0}
.btn-del{border-color:var(--need);color:var(--need)}
.btn-del:hover{background:var(--need);color:#fff}
.err{font-size:.62rem;color:var(--need);text-align:center;min-height:1rem}
.ok{font-size:.62rem;color:var(--got);text-align:center;min-height:1rem}
.hint{font-size:.55rem;color:var(--mut);line-height:1.5}
.totp-box{background:var(--paper);border:1px solid var(--bdr);border-radius:var(--r);
          padding:.75rem;display:flex;flex-direction:column;gap:.4rem}
.secret{font-family:'DM Mono',monospace;font-size:.75rem;color:var(--gold);
        font-weight:600;word-break:break-all;cursor:pointer;padding:.3rem .4rem;
        background:var(--p2);border-radius:var(--r)}
.check-row{display:flex;align-items:center;gap:.4rem;font-size:.65rem;cursor:pointer}
.check-row input{width:auto}
table{width:100%;border-collapse:collapse;font-size:.65rem}
th{font-size:.5rem;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);
   text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--bdr)}
td{padding:.5rem;border-bottom:1px solid var(--bdr);vertical-align:middle}
tr:last-child td{border-bottom:none}
.role-badge{display:inline-block;font-size:.5rem;letter-spacing:.08em;
            text-transform:uppercase;padding:.15rem .4rem;border-radius:var(--r);
            border:1px solid var(--bdr)}
.role-admin{border-color:var(--gold);color:var(--gold)}
.role-user{color:var(--mut)}
.invite-box{background:var(--paper);border:1px solid var(--bdr);border-radius:var(--r);
            padding:.75rem;font-size:.65rem;word-break:break-all;display:none}
.nav{font-size:.6rem;text-align:right}
.nav a{color:var(--gold);text-decoration:none}
.nav a:hover{text-decoration:underline}
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

def _totp_block(secret, totp_checked):
    uri = f'otpauth://totp/CoinHub?secret={secret}&issuer=CoinHub'
    checked = 'checked' if totp_checked else ''
    return f"""<div class="field">
      <label class="check-row">
        <input type="checkbox" name="enable_2fa" {checked} onchange="document.getElementById('totpBox').style.display=this.checked?'flex':'none'"> Enable two-factor authentication (TOTP)
      </label>
    </div>
    <div class="totp-box" id="totpBox" style="display:{'flex' if totp_checked else 'none'}">
      <span class="hint"><b>Add to Google Authenticator / Authy</b> using "Enter a setup key":</span>
      <span class="secret" onclick="navigator.clipboard.writeText(this.textContent).then(()=>this.style.color='var(--got)')" title="Click to copy">{secret}</span>
      <span class="hint">Or use this URI:</span>
      <a href="{uri}" style="font-size:.5rem;color:#1A3A6B;word-break:break-all">{uri}</a>
      <span class="hint">Then enter the 6-digit code below to confirm:</span>
      <input type="text" name="totp_verify" maxlength="6" placeholder="000000" style="width:120px">
      <input type="hidden" name="totp_secret" value="{secret}">
    </div>"""

def setup_page(prefill='', error='', totp_secret=None, totp_checked=True):
    secret = totp_secret or totp_new_secret()
    return _page('Setup', f"""<div class="card">
  <div class="logo">Coin <span>Hub</span></div>
  <h3>First-time setup</h3>
  <form method="POST" action="/setup">
    <div class="field"><label>Your Email</label><input type="email" name="email" required value="{prefill}"></div>
    <div class="field"><label>Password (min 8 chars)</label><input type="password" name="password" required minlength="8"></div>
    <div class="field"><label>Confirm Password</label><input type="password" name="password2" required></div>
    {_totp_block(secret, totp_checked)}
    <p class="err">{error}</p>
    <button class="btn" type="submit">Create Account &amp; Sign In</button>
  </form>
</div>""")

def invite_page(token, prefill='', error='', totp_secret=None, totp_checked=False):
    secret = totp_secret or totp_new_secret()
    return _page('Create Account', f"""<div class="card">
  <div class="logo">Coin <span>Hub</span></div>
  <h3>You've been invited</h3>
  <form method="POST" action="/invite/{token}">
    <div class="field"><label>Your Email</label><input type="email" name="email" required value="{prefill}"></div>
    <div class="field"><label>Password (min 8 chars)</label><input type="password" name="password" required minlength="8"></div>
    <div class="field"><label>Confirm Password</label><input type="password" name="password2" required></div>
    {_totp_block(secret, totp_checked)}
    <p class="err">{error}</p>
    <button class="btn" type="submit">Create Account &amp; Sign In</button>
  </form>
</div>""")

def admin_page(current_user: dict, users: list, msg='', msg_type='ok'):
    rows = ''
    for u in users:
        is_self = u['id'] == current_user['user_id']
        del_btn = '' if is_self else f'<form method="POST" action="/admin/remove/{u["id"]}" style="display:inline" onsubmit="return confirm(\'Remove {u[\'email\']}?\')"><button class="btn btn-sm btn-del" type="submit">Remove</button></form>'
        role_cls = 'role-admin' if u['role'] == 'admin' else 'role-user'
        joined = u.get('created_at', '')[:10]
        rows += f'<tr><td>{u["email"]}</td><td><span class="role-badge {role_cls}">{u["role"]}</span></td><td>{joined}</td><td>{del_btn}</td></tr>'

    msg_html = f'<p class="{msg_type}">{msg}</p>' if msg else ''
    return _page('Admin', f"""<div class="card wide">
  <div style="display:flex;justify-content:space-between;align-items:baseline">
    <div class="logo" style="font-size:1.1rem">Coin <span>Hub</span></div>
    <div class="nav"><a href="/CoinHub.html">← App</a> &nbsp; <a href="/logout">Sign out</a></div>
  </div>
  <h3>Users</h3>
  {msg_html}
  <table>
    <thead><tr><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
  <h3 style="margin-top:.5rem">Invite someone</h3>
  <p class="hint">Generates a single-use link valid for 7 days. Send it privately — anyone with the link can create an account.</p>
  <button class="btn" style="margin-top:.5rem" onclick="generateInvite(this)">Generate Invite Link</button>
  <div class="invite-box" id="inviteBox"></div>
  <script>
  function generateInvite(btn) {{
    btn.disabled = true; btn.textContent = 'Generating…';
    fetch('/api/invite', {{method:'POST'}})
      .then(r=>r.json()).then(d=>{{
        const box = document.getElementById('inviteBox');
        box.textContent = d.url;
        box.style.display = 'block';
        navigator.clipboard.writeText(d.url).catch(()=>{{}});
        btn.textContent = 'Copied to clipboard!';
        setTimeout(()=>{{btn.textContent='Generate Invite Link';btn.disabled=false;}}, 3000);
      }}).catch(()=>{{btn.textContent='Error — try again';btn.disabled=false;}});
  }}
  </script>
</div>""")

# ── REQUEST HANDLER ───────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(SERVE_DIR), **kw)

    def log_message(self, fmt, *args):
        ts = time.strftime('%H:%M:%S')
        print(f'  [{ts}] {fmt % args}')

    def _session(self) -> dict | None:
        return session_get(session_from_cookie(self.headers.get('Cookie', '')))

    def _authed(self) -> bool:
        return self._session() is not None

    def _is_admin(self) -> bool:
        s = self._session()
        return s is not None and s['role'] == 'admin'

    def _proto(self) -> str:
        return self.headers.get('X-Forwarded-Proto', '')

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

    def _host(self) -> str:
        proto = self._proto() or 'http'
        host  = self.headers.get('X-Forwarded-Host') or self.headers.get('Host') or f'localhost:{PORT}'
        return f'{proto}://{host}'

    def do_GET(self):
        path = self.path.split('?')[0].lstrip('/')
        auth = auth_load()
        has_users = bool(auth['users'])

        # Block sensitive files always
        if path.lower() in _BLOCKED_LOWER or path.startswith('.'):
            self.send_response(403); self.end_headers(); return

        # Logout
        if path == 'logout':
            s = self._session()
            if s:
                session_invalidate_user(s['user_id'])
            self._redirect('/', cookie=_clear_cookie())
            return

        # No users yet → first-time setup
        if not has_users:
            if path not in ('', 'setup'):
                self._redirect('/'); return
            self._html(setup_page()); return

        # Login / root
        if path in ('', 'login'):
            s = self._session()
            if s:
                self._redirect('/CoinHub.html')
            else:
                user = auth['users'][0] if auth['users'] else None
                # Show TOTP field if any user has it — actual validation is per-user
                show_totp = any(u.get('totp_enabled') for u in auth['users'])
                self._html(login_page(show_totp=show_totp))
            return

        # Invite registration page
        if path.startswith('invite/'):
            token = path[len('invite/'):]
            inv = auth_find_invite(token)
            if not inv:
                self._html(_page('Invalid Invite', '<div class="card"><div class="logo">Coin <span>Hub</span></div><p class="err" style="margin-top:1rem">This invite link is invalid or has expired.</p></div>'))
                return
            self._html(invite_page(token))
            return

        # Admin panel
        if path == 'admin':
            if not self._is_admin():
                self._redirect('/'); return
            data = auth_load()
            self._html(admin_page(self._session(), data['users']))
            return

        # API: queue
        if path == 'api/queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            queue = []
            if QUEUE_FILE.exists():
                try: queue = json.loads(QUEUE_FILE.read_text())
                except Exception: queue = []
            self._json_resp({'items': queue})
            return

        # API: process-queue
        if path == 'api/process-queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            result = _process_queue()
            print(f'[CoinHub] Queue processed: {result}')
            self._json_resp(result)
            return

        # Static files (auth required)
        if self._authed():
            super().do_GET()
        else:
            self._redirect('/')

    def do_POST(self):
        path = self.path.split('?')[0].lstrip('/')
        auth = auth_load()
        has_users = bool(auth['users'])

        # First-time setup
        if path == 'setup':
            if has_users:
                self._redirect('/'); return
            data = self._body()
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

            user = auth_add_user(email, pw_hash(pw), secret if use_2fa else None, use_2fa, role='admin')
            print(f'[CoinHub] Admin account created: {email} | 2FA: {use_2fa}')
            sid = session_new(user)
            self._redirect('/CoinHub.html', cookie=_make_cookie(sid, self._proto()))
            return

        # Login
        if path == 'login':
            if not has_users:
                self._redirect('/'); return
            data  = self._body()
            email = data.get('email', '').strip().lower()
            pw    = data.get('password', '')
            code  = data.get('totp', '')

            user = auth_find_user(email)
            show_totp = any(u.get('totp_enabled') for u in auth['users'])

            if not user or not pw_verify(pw, user['pw_hash']):
                self._html(login_page('Invalid email or password.', show_totp)); return

            if user.get('totp_enabled') and not totp_verify(user['totp_secret'], code):
                self._html(login_page('Authenticator code is incorrect.', show_totp)); return

            sid = session_new(user)
            print(f'[CoinHub] Login: {email}')
            self._redirect('/CoinHub.html', cookie=_make_cookie(sid, self._proto()))
            return

        # Invite registration
        if path.startswith('invite/'):
            token = path[len('invite/'):]
            inv = auth_find_invite(token)
            if not inv:
                self._html(_page('Invalid Invite', '<div class="card"><div class="logo">Coin <span>Hub</span></div><p class="err" style="margin-top:1rem">This invite link is invalid or has expired.</p></div>'))
                return
            data    = self._body()
            email   = data.get('email', '').strip().lower()
            pw      = data.get('password', '')
            pw2     = data.get('password2', '')
            use_2fa = 'enable_2fa' in data
            secret  = data.get('totp_secret', '')
            code    = data.get('totp_verify', '')

            def inv_err(msg):
                self._html(invite_page(token, prefill=email, error=msg, totp_secret=secret, totp_checked=use_2fa))

            if not email:               return inv_err('Email is required.')
            if auth_find_user(email):   return inv_err('An account with that email already exists.')
            if len(pw) < 8:             return inv_err('Password must be at least 8 characters.')
            if pw != pw2:               return inv_err('Passwords do not match.')
            if use_2fa:
                if not secret:          return inv_err('No TOTP secret present.')
                if not totp_verify(secret, code):
                    return inv_err('Authenticator code is incorrect — please try again.')

            auth_use_invite(token)
            user = auth_add_user(email, pw_hash(pw), secret if use_2fa else None, use_2fa, role='user')
            print(f'[CoinHub] New user registered via invite: {email} (invited by {inv["created_by"]})')
            sid = session_new(user)
            self._redirect('/CoinHub.html', cookie=_make_cookie(sid, self._proto()))
            return

        # Admin: remove user
        if path.startswith('admin/remove/'):
            if not self._is_admin():
                self._redirect('/'); return
            uid  = path[len('admin/remove/'):]
            sess = self._session()
            if uid == sess['user_id']:
                data = auth_load()
                self._html(admin_page(sess, data['users'], 'You cannot remove your own account.', 'err'))
                return
            target = auth_find_user_by_id(uid)
            session_invalidate_user(uid)
            auth_remove_user(uid)
            name = target['email'] if target else uid
            print(f'[CoinHub] User removed: {name} by {sess["email"]}')
            data = auth_load()
            self._html(admin_page(sess, data['users'], f'Removed {name}.'))
            return

        # API: generate invite link (admin only, JSON)
        if path == 'api/invite':
            if not self._is_admin():
                self._json_resp({'error': 'forbidden'}, 403); return
            sess  = self._session()
            token = auth_create_invite(sess['email'])
            url   = f'{self._host()}/invite/{token}'
            print(f'[CoinHub] Invite created by {sess["email"]}: {url}')
            self._json_resp({'ok': True, 'url': url})
            return

        # API: queue
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

        # API: process-queue
        if path == 'api/process-queue':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            self._raw_body()
            result = _process_queue()
            print(f'[CoinHub] Queue processed: {result}')
            self._json_resp(result)
            return

        self.send_response(404); self.end_headers()


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), Handler) as srv:
        auth = auth_load()
        status = 'No account yet — visit to set up' if not auth['users'] else f'Ready — {len(auth["users"])} user(s)'
        print(f'[CoinHub] http://localhost:{PORT}  |  {status}')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\n[CoinHub] Stopped.')
