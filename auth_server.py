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
DEVICES_FILE = SERVE_DIR / '.coinhub_devices.json'
GUESTS_FILE  = SERVE_DIR / '.coinhub_guests.json'
PORT         = 8090
SESSION_TTL  = 8 * 3600       # 8 hours  (in-memory, lost on restart)
REMEMBER_TTL = 7 * 24 * 3600  # 7 days   (persistent, survives restarts)
_SESSIONS: dict[str, float] = {}
_DEVICES:  dict[str, float] = {}  # {remember_token: expiry_timestamp}
_GUEST_INVITES: dict[str, float] = {}   # invite_token → expiry_timestamp
_GUEST_SESSIONS: dict[str, float] = {} # session_id → expiry_timestamp

# ── SENSITIVE FILES (never served) ───────────────────────────────────────────
_BLOCKED = {'.coinhub_auth', 'auth_server.py', '.coinhub_sync_queue.json',
            '.coinhub_config', 'coinhub_changes.log', '.coinhub_devices.json',
            '.coinhub_guests.json'}
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

def _notion_get_prop_str(prop):
    """Extract a plain-text string from a Notion property dict."""
    if not prop:
        return ''
    t = prop.get('type', '')
    if t == 'rich_text':
        return ''.join(r.get('plain_text', '') for r in prop.get('rich_text', []))
    if t == 'title':
        return ''.join(r.get('plain_text', '') for r in prop.get('title', []))
    if t == 'select':
        s = prop.get('select')
        return s.get('name', '') if s else ''
    if t == 'formula':
        f = prop.get('formula', {})
        return f.get('string', '') or (str(f.get('number', '')) if f.get('number') is not None else '')
    if t == 'date':
        d = prop.get('date')
        return d.get('start', '') if d else ''
    if t == 'relation':
        rels = prop.get('relation', [])
        return rels[0]['id'] if rels else ''
    if t == 'number':
        n = prop.get('number')
        return str(n) if n is not None else ''
    return ''


def _notion_resolve_name(page_id, cache):
    """Fetch the Name title of a Notion page, using cache to avoid duplicate requests."""
    if not page_id:
        return ''
    if page_id in cache:
        return cache[page_id]
    try:
        p = _notion_request('GET', f'/pages/{page_id}')
        parts = p.get('properties', {}).get('Name', {}).get('title', [])
        name = ''.join(t.get('plain_text', '') for t in parts)
        cache[page_id] = name
    except Exception:
        cache[page_id] = ''
    return cache[page_id]


def _notion_pull_instances(since_iso=None):
    """
    Query the Notion instance DB (optionally filtered to pages edited since since_iso).
    Returns a list of simplified instance dicts.
    """
    config = {}
    if CONFIG_FILE.exists():
        try: config = json.loads(CONFIG_FILE.read_text())
        except Exception: pass
    db_instance = config.get('notion_databases', {}).get('instance', '')
    if not db_instance:
        return []

    body = {'page_size': 100}
    if since_iso:
        body['filter'] = {
            'timestamp': 'last_edited_time',
            'last_edited_time': {'after': since_iso}
        }

    pages, cursor = [], None
    while True:
        q = dict(body)
        if cursor:
            q['start_cursor'] = cursor
        result = _notion_request('POST', f'/databases/{db_instance}/query', q)
        pages.extend(result.get('results', []))
        if not result.get('has_more'):
            break
        cursor = result.get('next_cursor')

    cache = {}
    instances = []
    for page in pages:
        props = page.get('properties', {})

        formula_id = _notion_get_prop_str(props.get('Number', {}))
        if not formula_id:
            continue

        def rel(key):
            return _notion_resolve_name(_notion_get_prop_str(props.get(key, {})), cache)

        notes_prop = props.get('Notes', {})
        notes = ''.join(r.get('plain_text', '') for r in notes_prop.get('rich_text', []))

        instances.append({
            'id': formula_id,
            'cond': rel('Condition'),
            's1':   rel('Storage 1'),
            's2':   rel('Storage 2'),
            's3':   rel('Storage 3'),
            'notes':  notes,
            'ptype':  rel('Preservation Type'),
            'lastStocktake': _notion_get_prop_str(props.get('Last Stocktake', {})),
            'lastEdited':    page.get('last_edited_time', ''),
        })

    return instances


def _notion_push_stocktake(checks):
    """
    Push stocktake dates from checks={iid: date_str} to Notion instance pages.
    Fetches all pages once, builds an id→pageId map, then updates only changed entries.
    Returns {updated, skipped, errors}.
    """
    config = {}
    if CONFIG_FILE.exists():
        try: config = json.loads(CONFIG_FILE.read_text())
        except Exception: pass
    db_instance = config.get('notion_databases', {}).get('instance', '')
    if not db_instance:
        return {'updated': 0, 'skipped': 0, 'errors': ['No instance database configured']}

    # Fetch all instance pages to build formula_id → {pageId, currentDate} map
    pages, cursor = [], None
    body = {'page_size': 100}
    while True:
        q = dict(body)
        if cursor:
            q['start_cursor'] = cursor
        result = _notion_request('POST', f'/databases/{db_instance}/query', q)
        pages.extend(result.get('results', []))
        if not result.get('has_more'):
            break
        cursor = result.get('next_cursor')

    id_map = {}
    for page in pages:
        props = page.get('properties', {})
        fid = _notion_get_prop_str(props.get('Number', {}))
        if fid:
            current_ls = _notion_get_prop_str(props.get('Last Stocktake', {}))
            id_map[fid] = {'pageId': page['id'], 'current': current_ls}

    updated, skipped, errors = 0, 0, []
    for iid, date_str in checks.items():
        entry = id_map.get(iid)
        if not entry:
            skipped += 1
            continue
        if entry['current'] == date_str:
            skipped += 1
            continue
        try:
            _notion_request('PATCH', f'/pages/{entry["pageId"]}', {
                'properties': {'Last Stocktake': {'date': {'start': date_str}}}
            })
            updated += 1
        except Exception as e:
            errors.append(f'{iid}: {e}')

    return {'updated': updated, 'skipped': skipped, 'errors': errors}


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

# ── REMEMBER-DEVICE (persistent, 7-day tokens) ────────────────────────────────
def _devices_load() -> dict:
    if DEVICES_FILE.exists():
        try:
            return {t: exp for t, exp in json.loads(DEVICES_FILE.read_text()).items()
                    if exp > time.time()}  # prune expired on load
        except Exception:
            pass
    return {}

def _devices_save():
    DEVICES_FILE.write_text(json.dumps(_DEVICES, indent=2))

def device_new() -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    _DEVICES[token] = now + REMEMBER_TTL
    # Prune any other expired tokens while we're here
    for t in [k for k, exp in _DEVICES.items() if exp <= now]:
        del _DEVICES[t]
    _devices_save()
    return token

def device_valid(token: str | None) -> bool:
    if token and token in _DEVICES:
        if _DEVICES[token] > time.time():
            return True
        del _DEVICES[token]
        _devices_save()
    return False

def device_revoke(token: str | None):
    if token and token in _DEVICES:
        del _DEVICES[token]
        _devices_save()

def device_from_cookie(header: str) -> str | None:
    for part in (header or '').split(';'):
        k, _, v = part.strip().partition('=')
        if k.strip() == 'chrid':
            return v.strip()
    return None

# Load persisted devices at startup
_DEVICES.update(_devices_load())

# ── GUEST INVITES & SESSIONS ──────────────────────────────────────────────────
def _guests_load() -> dict:
    if GUESTS_FILE.exists():
        try:
            now = time.time()
            return {t: exp for t, exp in json.loads(GUESTS_FILE.read_text()).items()
                    if exp > now}
        except Exception:
            pass
    return {}

def _guests_save():
    GUESTS_FILE.write_text(json.dumps(_GUEST_INVITES, indent=2))

def guest_invite_new(hours: float) -> str:
    token = secrets.token_urlsafe(32)
    _GUEST_INVITES[token] = time.time() + hours * 3600
    _guests_save()
    return token

def guest_invite_use(token: str) -> float | None:
    """Validate invite token, return expiry timestamp or None if invalid/expired."""
    now = time.time()
    if token in _GUEST_INVITES:
        expiry = _GUEST_INVITES[token]
        if expiry > now:
            return expiry
        del _GUEST_INVITES[token]
        _guests_save()
    return None

def guest_invite_revoke(token: str):
    if token in _GUEST_INVITES:
        del _GUEST_INVITES[token]
        _guests_save()

def guest_session_new(expiry: float) -> str:
    sid = secrets.token_urlsafe(32)
    _GUEST_SESSIONS[sid] = expiry
    return sid

def guest_session_valid(sid: str | None) -> bool:
    if sid and sid in _GUEST_SESSIONS:
        if _GUEST_SESSIONS[sid] > time.time():
            return True
        del _GUEST_SESSIONS[sid]
    return False

def guest_session_from_cookie(header: str) -> str | None:
    for part in (header or '').split(';'):
        k, _, v = part.strip().partition('=')
        if k.strip() == 'chgsid':
            return v.strip()
    return None

def _get_role(cookie_hdr: str) -> str | None:
    """Returns 'owner', 'guest', or None."""
    if session_valid(session_from_cookie(cookie_hdr)):
        return 'owner'
    if guest_session_valid(guest_session_from_cookie(cookie_hdr)):
        return 'guest'
    return None

# Load persisted guest invites at startup
_GUEST_INVITES.update(_guests_load())

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
@media(max-width:480px){
  .card{width:100%;padding:2rem 1.2rem}
  body{padding:1rem;align-items:flex-start;padding-top:3rem}
  input[type=email],input[type=password],input[type=text]{font-size:16px}
}
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
    <div class="field">
      <label class="check-row">
        <input type="checkbox" name="remember" value="1" checked>
        Remember this device for 7 days
      </label>
    </div>
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

def admin_page(link=None, expires=None, error=None):
    dur_options = [
        ('1','1 hour'), ('2','2 hours'), ('4','4 hours'), ('8','8 hours'),
        ('24','1 day'), ('48','2 days'), ('72','3 days'), ('168','7 days'),
        ('336','14 days'), ('720','30 days'),
    ]
    opts = ''.join(f'<option value="{v}"{"  selected" if v=="24" else ""}>{l}</option>' for v, l in dur_options)

    link_box = ''
    if link:
        exp_str = f'Expires: {time.strftime("%d %b %Y %H:%M UTC", time.gmtime(float(expires)))}' if expires else ''
        link_box = f'''<div style="margin-top:.8rem">
  <label>Share this link with your guest:</label>
  <div style="margin-top:.3rem;background:var(--paper);border:1px solid var(--bdr);border-radius:var(--r);padding:.5rem .6rem;font-size:.58rem;word-break:break-all;font-family:inherit;line-height:1.6;user-select:all">{link}</div>
  <p class="hint" style="margin-top:.3rem">{exp_str}</p>
  <p class="hint" style="margin-top:.2rem">Select the link above and copy it.</p>
</div>'''

    err_box = f'<p class="err">{error}</p>' if error else ''

    now = time.time()
    active = sorted([(t, exp) for t, exp in _GUEST_INVITES.items() if exp > now], key=lambda x: x[1])
    if active:
        rows = ''.join(
            f'<tr style="border-bottom:1px solid var(--bdr)">'
            f'<td style="padding:.35rem .3rem;font-size:.6rem;color:var(--mut)">expires {time.strftime("%d %b %Y %H:%M UTC", time.gmtime(exp))}</td>'
            f'<td style="padding:.35rem .3rem;text-align:right">'
            f'<form method="POST" action="/admin/guest-revoke" style="display:inline">'
            f'<input type="hidden" name="token" value="{t}">'
            f'<button class="btn" style="width:auto;padding:.2rem .6rem;margin-top:0" onclick="return confirm(\'Revoke this invite?\')">Revoke</button>'
            f'</form>'
            f'</td></tr>'
            for t, exp in active
        )
        invite_table = f'<h3 style="margin-top:1.2rem;margin-bottom:.5rem">Active Invite Links ({len(active)})</h3><table style="width:100%;border-collapse:collapse">{rows}</table>'
    else:
        invite_table = '<p class="hint" style="margin-top:1rem">No active invite links.</p>'

    return _page('Guest Admin', f'''<div class="card" style="width:480px;max-width:100%">
  <div class="logo">Coin <span>Hub</span></div>
  <h3>Create Guest Invite Link</h3>
  <p class="hint" style="margin:.4rem 0 .8rem">Guests can browse all coins but cannot edit, add, delete, run stocktake, or sync with Notion.</p>
  <form method="POST" action="/admin/guest-invite">
    <div class="field">
      <label>Access Duration</label>
      <select name="hours" style="width:100%;padding:.4rem .6rem;border:1px solid var(--bdr);border-radius:var(--r);background:var(--paper);font-family:inherit;font-size:.75rem;color:var(--ink)">{opts}</select>
    </div>
    {err_box}
    <button class="btn" type="submit">Generate Invite Link</button>
  </form>
  {link_box}
  {invite_table}
  <a href="/CoinHub.html" style="font-size:.6rem;color:var(--list);text-decoration:none;margin-top:1rem;display:block">← Back to CoinHub</a>
</div>''')

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
        for c in ([cookie] if isinstance(cookie, str) else (cookie or [])):
            self.send_header('Set-Cookie', c)
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, loc, cookie=None):
        self.send_response(302)
        self.send_header('Location', loc)
        for c in ([cookie] if isinstance(cookie, str) else (cookie or [])):
            self.send_header('Set-Cookie', c)
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
            # Revoke the remember token so this device must log in again
            rt = device_from_cookie(self.headers.get('Cookie', ''))
            device_revoke(rt)
            self._redirect('/', cookie=[
                'chsid=; Max-Age=0; Path=/; HttpOnly',
                'chrid=; Max-Age=0; Path=/; HttpOnly',
            ])
            return

        # ── Remember-device auto-login ────────────────────────────────────────
        # If no valid session but a valid remember token exists, mint a new
        # session and redirect to the same URL so the browser picks it up.
        cookie_hdr = self.headers.get('Cookie', '')
        if not session_valid(session_from_cookie(cookie_hdr)) and path not in ('', 'login', 'setup'):
            rt = device_from_cookie(cookie_hdr)
            if device_valid(rt):
                sid = session_new()
                self._redirect(self.path,
                    cookie=f'chsid={sid}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Strict')
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

        if path == 'api/notion-pull':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1] if '?' in self.path else '')
            since = (qs.get('since') or [None])[0]
            try:
                instances = _notion_pull_instances(since)
                pulled_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                print(f'[CoinHub] Notion pull: {len(instances)} instances (since={since})')
                self._json_resp({'instances': instances, 'pulledAt': pulled_at})
            except Exception as e:
                print(f'[CoinHub] Notion pull error: {e}')
                self._json_resp({'error': str(e)}, 500)
            return

        # ── Guest invite entry point ──────────────────────────────────────────
        if path == 'guest':
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1] if '?' in self.path else '')
            token = (qs.get('t') or [None])[0]
            expiry = guest_invite_use(token) if token else None
            if not expiry:
                self._html(_page('Access Denied', '<div class="card"><div class="logo">Coin <span>Hub</span></div><p class="err" style="text-align:center;margin-top:.5rem">This invite link is invalid or has expired.</p><a href="/" style="font-size:.6rem;color:var(--list);display:block;text-align:center;margin-top:.8rem">← Back to login</a></div>'))
                return
            gsid = guest_session_new(expiry)
            max_age = int(expiry - time.time())
            print(f'[CoinHub] Guest session created (expires in {max_age//3600}h {(max_age%3600)//60}m)')
            self._redirect('/CoinHub.html',
                cookie=f'chgsid={gsid}; Max-Age={max_age}; Path=/; HttpOnly; SameSite=Strict')
            return

        # ── Session info (for guest-mode detection) ───────────────────────────
        if path == 'api/whoami':
            cookie_hdr = self.headers.get('Cookie', '')
            role = _get_role(cookie_hdr)
            if not role:
                self._json_resp({'role': None}, 401); return
            resp: dict = {'role': role}
            if role == 'guest':
                gsid = guest_session_from_cookie(cookie_hdr)
                exp = _GUEST_SESSIONS.get(gsid or '')
                if exp:
                    resp['guestExpires'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(exp))
            self._json_resp(resp)
            return

        # ── Admin panel (owner only) ──────────────────────────────────────────
        if path == 'admin':
            if not self._authed():
                self._redirect('/'); return
            self._html(admin_page())
            return

        if self._authed() or guest_session_valid(guest_session_from_cookie(self.headers.get('Cookie', ''))):
            # Prevent browser caching of the app file
            if path in ('', 'CoinHub.html'):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                content = (SERVE_DIR / 'CoinHub.html').read_bytes()
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
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

        if path == 'api/notion-stocktake-push':
            if not self._authed():
                self._json_resp({'error': 'unauthorized'}, 401); return
            try:
                body = json.loads(self._raw_body())
                checks = body.get('checks', {})
                result = _notion_push_stocktake(checks)
                print(f'[CoinHub] Stocktake push: {result}')
                self._json_resp(result)
            except Exception as e:
                print(f'[CoinHub] Stocktake push error: {e}')
                self._json_resp({'error': str(e)}, 500)
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

        if path == 'admin/guest-invite':
            if not self._authed():
                self._redirect('/'); return
            try:
                hours = float(data.get('hours', 24))
                if hours <= 0 or hours > 24 * 30:
                    raise ValueError('Duration must be between 1 hour and 30 days')
                token = guest_invite_new(hours)
                expiry = _GUEST_INVITES[token]
                print(f'[CoinHub] Guest invite created (expires {time.strftime("%d %b %Y %H:%M UTC", time.gmtime(expiry))})')
                host = self.headers.get('Host', 'localhost:8090')
                scheme = 'https' if 'ghghome' in host else 'http'
                link = f'{scheme}://{host}/guest?t={token}'
                self._html(admin_page(link=link, expires=str(expiry)))
            except Exception as e:
                self._html(admin_page(error=str(e)))
            return

        if path == 'admin/guest-revoke':
            if not self._authed():
                self._redirect('/'); return
            guest_invite_revoke(data.get('token', ''))
            self._redirect('/admin')
            return

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
            cookies = [f'chsid={sid}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Strict']
            if data.get('remember') == '1':
                rt = device_new()
                cookies.append(f'chrid={rt}; Max-Age={REMEMBER_TTL}; Path=/; HttpOnly; SameSite=Strict')
                print(f'[CoinHub] Login: {email} (device remembered for 7 days)')
            else:
                print(f'[CoinHub] Login: {email}')
            self._redirect('/CoinHub.html', cookie=cookies)

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
