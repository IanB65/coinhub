// Temporary debug endpoint — returns raw Numista API response for one search
const crypto = require('crypto');

function verifyToken(req) {
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
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const apiKey = process.env.NUMISTA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NUMISTA_API_KEY not set' });

  const q = req.query.q || '50p Peter Rabbit';
  const issuer = req.query.issuer || 'united-kingdom';

  const results = {};

  // Test 1: with issuer
  try {
    const url1 = `https://api.numista.com/api/v3/coins?q=${encodeURIComponent(q)}&issuer=${issuer}&count=5&lang=en`;
    const r1 = await fetch(url1, { headers: { 'Numista-API-Key': apiKey } });
    results.withIssuer = { status: r1.status, url: url1, body: await r1.json() };
  } catch(e) { results.withIssuer = { error: e.message }; }

  // Test 2: without issuer
  try {
    const url2 = `https://api.numista.com/api/v3/coins?q=${encodeURIComponent(q)}&count=5&lang=en`;
    const r2 = await fetch(url2, { headers: { 'Numista-API-Key': apiKey } });
    results.withoutIssuer = { status: r2.status, url: url2, body: await r2.json() };
  } catch(e) { results.withoutIssuer = { error: e.message }; }

  // Test 3: check prices for first result if any
  const firstId = results.withIssuer?.body?.items?.[0]?.id || results.withoutIssuer?.body?.items?.[0]?.id;
  if (firstId) {
    try {
      const url3 = `https://api.numista.com/api/v3/coins/${firstId}/prices?currency=GBP`;
      const r3 = await fetch(url3, { headers: { 'Numista-API-Key': apiKey } });
      results.prices = { status: r3.status, coinId: firstId, body: await r3.json() };
    } catch(e) { results.prices = { error: e.message }; }
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(results);
};
