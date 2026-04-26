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

async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Token refresh failed: ' + await resp.text());
  return (await resp.json()).access_token;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { updates } = body || {};
  if (!Array.isArray(updates) || !updates.length) {
    return res.status(400).json({ error: 'updates array required: [{insId, date}]' });
  }

  try {
    const token = await getAccessToken();

    const fetchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Instances?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fetchResp.ok) throw new Error('Sheet fetch failed: ' + fetchResp.status);
    const { values } = await fetchResp.json();

    const rowMap = {};
    for (let i = 1; i < (values || []).length; i++) {
      const id = values[i][0]?.trim();
      if (id) rowMap[id] = i + 1;
    }

    const data = updates
      .filter(u => rowMap[u.insId])
      .map(u => ({ range: `Instances!K${rowMap[u.insId]}`, values: [[u.date || '']] }));

    if (!data.length) return res.status(200).json({ updated: 0, skipped: updates.length });

    const batchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data }),
      }
    );
    if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

    return res.status(200).json({ updated: data.length });
  } catch (e) {
    console.error('sheets-write error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
