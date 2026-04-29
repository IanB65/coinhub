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

// Variants columns: A=variantCode B=name C=denomination D=collection E=monarch F=year G=status H=imageUrl I=notes J=dateAdded K=lastModified
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

  const { variantCode, name, denom, collection, monarch, year, status, imgUrl, notes } = body || {};
  if (!variantCode) return res.status(400).json({ error: 'variantCode required' });

  try {
    const token = await getAccessToken();

    const readResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
    const { values } = await readResp.json();

    const rowIndex = (values || []).findIndex((r, i) => i > 0 && r[0]?.trim() === variantCode);
    if (rowIndex === -1) return res.status(404).json({ error: `Variant ${variantCode} not found` });

    const sheetRow = rowIndex + 1; // 1-based
    const today = new Date().toISOString().slice(0, 10);
    const existing = values[rowIndex];

    const data = [
      { range: `Variants!B${sheetRow}`, values: [[name ?? existing[1] ?? '']] },
      { range: `Variants!C${sheetRow}`, values: [[denom ?? existing[2] ?? '']] },
      { range: `Variants!D${sheetRow}`, values: [[collection ?? existing[3] ?? '']] },
      { range: `Variants!E${sheetRow}`, values: [[monarch ?? existing[4] ?? '']] },
      { range: `Variants!F${sheetRow}`, values: [[year ?? existing[5] ?? '']] },
      { range: `Variants!G${sheetRow}`, values: [[status ?? existing[6] ?? '']] },
      { range: `Variants!H${sheetRow}`, values: [[imgUrl ?? existing[7] ?? '']] },
      { range: `Variants!I${sheetRow}`, values: [[notes ?? existing[8] ?? '']] },
      { range: `Variants!K${sheetRow}`, values: [[today]] },
    ];

    const batchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data }),
      }
    );
    if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

    return res.status(200).json({ ok: true, variantCode });
  } catch (e) {
    console.error('variants-write error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
