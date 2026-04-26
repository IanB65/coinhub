const crypto = require('crypto');

// ── TOTP (RFC 6238) ───────────────────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(str) {
  str = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const out = [];
  let bits = 0, val = 0;
  for (const c of str) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset+1] << 16)
             | (hmac[offset+2] << 8) | hmac[offset+3];
  return String(code % 1_000_000).padStart(6, '0');
}

function verifyTOTP(secret, token) {
  const t = Math.floor(Date.now() / 30000);
  const tok = String(token).replace(/\s/g, '').padStart(6, '0');
  return [-1, 0, 1].some(d => hotp(secret, t + d) === tok);
}

// ── JWT (HS256, no external deps) ─────────────────────────────────────────────
function makeToken(secret) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { password, totp } = body;

  const expected   = process.env.COINHUB_PASSWORD;
  const jwtSecret  = process.env.COINHUB_JWT_SECRET;
  const totpSecret = process.env.COINHUB_TOTP_SECRET; // optional

  if (!expected || !jwtSecret) return res.status(503).json({ error: 'Auth not configured' });

  // Constant-time password comparison
  const a = Buffer.from(password || '');
  const b = Buffer.from(expected);
  const padLen = Math.max(a.length, b.length);
  const aPad = Buffer.alloc(padLen); a.copy(aPad);
  const bPad = Buffer.alloc(padLen); b.copy(bPad);
  const passwordOk = a.length === b.length && crypto.timingSafeEqual(aPad, bPad);

  if (!passwordOk) {
    await delay(500);
    return res.status(401).json({ error: 'Invalid password' });
  }

  // 2FA check (only enforced if COINHUB_TOTP_SECRET is set)
  if (totpSecret) {
    if (!totp) return res.status(401).json({ error: 'Two-factor code required', need_totp: true });
    if (!verifyTOTP(totpSecret, totp)) {
      await delay(500);
      return res.status(401).json({ error: 'Invalid authenticator code' });
    }
  }

  return res.status(200).json({ token: makeToken(jwtSecret) });
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
