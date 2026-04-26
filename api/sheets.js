const crypto = require('crypto');
const ALLOWED_TABS = ['Variants', 'Instances', 'Images'];

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

  const tab = req.query.tab;
  if (!ALLOWED_TABS.includes(tab)) {
    return res.status(400).json({ error: `Invalid tab. Allowed: ${ALLOWED_TABS.join(', ')}` });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!apiKey || !sheetId) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY or GOOGLE_SHEET_ID env var not set' });
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?majorDimension=ROWS&key=${apiKey}`;
    const sheetsRes = await fetch(url);

    if (!sheetsRes.ok) {
      const err = await sheetsRes.text();
      return res.status(sheetsRes.status).json({ error: err });
    }

    const data = await sheetsRes.json();
    const rows = data.values || [];
    const width = rows[0]?.length || 0;
    const padded = rows.map(r => {
      while (r.length < width) r.push('');
      return r;
    });

    const csv = padded.map(row =>
      row.map(cell => {
        const s = String(cell ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
