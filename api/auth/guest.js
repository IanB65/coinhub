const crypto = require('crypto');

// Verify the owner's JWT (rejects guest tokens)
function verifyOwnerToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const secret = process.env.COINHUB_JWT_SECRET;
  if (!secret) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [h, p, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.role === 'guest') return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function makeGuestToken(secret, label, expiresInSeconds) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({
    role: 'guest',
    label: String(label).slice(0, 60),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + Number(expiresInSeconds),
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function validateGuestToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.role !== 'guest') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  const secret = process.env.COINHUB_JWT_SECRET;
  if (!secret) return res.status(503).json({ error: 'Auth not configured' });

  // GET ?token=TOKEN — validate a guest token (called by CoinHub_v2.html)
  if (req.method === 'GET' && req.query.token) {
    const payload = validateGuestToken(req.query.token, secret);
    if (!payload) return res.status(401).json({ valid: false, error: 'Invalid or expired guest link' });
    return res.status(200).json({ valid: true, label: payload.label, exp: payload.exp });
  }

  // All other operations require the owner's JWT
  if (!verifyOwnerToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  // POST — create a guest token
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { label, expiresInSeconds } = body;
    if (!label || !expiresInSeconds) {
      return res.status(400).json({ error: 'label and expiresInSeconds required' });
    }
    const token = makeGuestToken(secret, label, expiresInSeconds);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'coins.ghghome.co.uk';
    const link = `https://${host}/CoinHub_v2.html?guest=${token}`;
    return res.status(200).json({ token, link, label: payload.label, exp: payload.exp, createdAt: payload.iat });
  }

  // DELETE — no-op (tokens are self-contained JWTs; removal is local only)
  if (req.method === 'DELETE') {
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
