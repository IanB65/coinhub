const crypto = require('crypto');

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected)); }
  catch { return false; }
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

// POST { variantCode, imageUrl } — updates imageUrl (col G) for a matching inbox row
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyServiceKey(req)) return res.status(401).json({ error: 'Unauthorised' });

  const { variantCode, imageUrl } = req.body || {};
  if (!variantCode || !imageUrl) return res.status(400).json({ error: 'variantCode and imageUrl required' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const token = await getAccessToken();

  const readResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox!A:A`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!readResp.ok) return res.status(500).json({ error: 'Failed to read inbox' });
  const rows = (await readResp.json()).values || [];

  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === variantCode);
  if (rowIndex === -1) return res.status(404).json({ error: `variantCode not found in inbox: ${variantCode}` });

  const sheetRow = rowIndex + 1; // 1-indexed
  const updateResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox!G${sheetRow}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[imageUrl]] }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to update row: ' + await updateResp.text() });

  return res.status(200).json({ updated: variantCode, row: sheetRow, imageUrl });
};
