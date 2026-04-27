const crypto = require('crypto');

function verifyToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const secret = process.env.COINHUB_JWT_SECRET;
  if (!secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.role === 'guest') return null; // owner only
    return payload;
  } catch { return null; }
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
    return res.status(400).json({ error: 'updates array required: [{code, url}]' });
  }

  try {
    const token = await getAccessToken();

    const fetchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Images?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fetchResp.ok) throw new Error('Images sheet fetch failed: ' + fetchResp.status);
    const { values } = await fetchResp.json();

    // Build row map: variantCode -> row number (1-based)
    const rowMap = {};
    for (let i = 1; i < (values || []).length; i++) {
      const code = values[i][0]?.trim();
      if (code) rowMap[code] = i + 1;
    }

    const data = [];
    const notFound = [];
    for (const u of updates) {
      if (!u.code || !u.url) continue;
      if (rowMap[u.code]) {
        data.push({ range: `Images!B${rowMap[u.code]}`, values: [[u.url]] });
      } else {
        // New entry — append at end
        notFound.push(u);
      }
    }

    let updated = 0;
    let appended = 0;

    if (data.length) {
      const batchResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'RAW', data }),
        }
      );
      if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());
      updated = data.length;
    }

    if (notFound.length) {
      const appendRows = notFound.map(u => [u.code, u.url]);
      const appendResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('Images!A:B')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: appendRows }),
        }
      );
      if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());
      appended = notFound.length;
    }

    return res.status(200).json({ updated, appended });
  } catch (e) {
    console.error('images-update error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
