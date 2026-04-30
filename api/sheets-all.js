const crypto = require('crypto');
const TABS = ['Variants', 'Instances', 'Images', 'Storage'];

// Accepts both owner and guest tokens (read-only endpoint)
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

  const apiKey = process.env.GOOGLE_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!apiKey || !sheetId) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY or GOOGLE_SHEET_ID env var not set' });
  }

  async function fetchTab(tab) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?majorDimension=ROWS&key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Sheet "${tab}" fetch failed: ${r.status}`);
    const data = await r.json();
    const rows = data.values || [];
    const width = rows[0]?.length || 0;
    return rows.map(r => { while (r.length < width) r.push(''); return r; });
  }

  try {
    const [variants, instances, images, storage] = await Promise.all(TABS.map(fetchTab));

    // Values tab is optional — created on first numista-sync run
    let values = [];
    try { values = await fetchTab('Values'); } catch { /* not yet created */ }

    // Conditions tab: col A=code, col B=description
    let conditions = [];
    try { conditions = await fetchTab('Conditions'); } catch { /* optional */ }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ variants, instances, images, storage, values, conditions });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
