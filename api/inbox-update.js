const crypto = require('crypto');

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
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

// Update existing rows in NewCoinsInbox by variantCode.
// Body: { coins: [{ variantCode, name?, denomination?, collection?, monarch?, year?, imageUrl?, sourceUrl?, price? }] }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyServiceKey(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { coins } = body || {};
  if (!Array.isArray(coins) || !coins.length) {
    return res.status(400).json({ error: 'coins array required' });
  }

  try {
    const token = await getAccessToken();

    const inboxResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!inboxResp.ok) throw new Error('Inbox fetch failed: ' + inboxResp.status);
    const { values: rows } = await inboxResp.json();

    if (!rows || rows.length <= 1) {
      return res.status(200).json({ updated: 0, notFound: coins.map(c => c.variantCode) });
    }

    // Build index: variantCode -> sheet row number (1-based, header = row 1)
    const rowIndex = {};
    for (let i = 1; i < rows.length; i++) {
      const code = (rows[i][0] || '').trim();
      if (code) rowIndex[code] = i + 1;
    }

    // Columns: A=variantCode B=name C=denomination D=collection E=monarch F=year G=imageUrl H=sourceUrl I=price J=approved K=dateFound
    const colMap = { name: 'B', denomination: 'C', collection: 'D', monarch: 'E', year: 'F', imageUrl: 'G', sourceUrl: 'H', price: 'I' };

    const data = [];
    const notFound = [];

    for (const coin of coins) {
      const rowNum = rowIndex[coin.variantCode];
      if (!rowNum) { notFound.push(coin.variantCode); continue; }
      for (const [field, col] of Object.entries(colMap)) {
        if (coin[field] !== undefined && coin[field] !== null) {
          data.push({ range: `NewCoinsInbox!${col}${rowNum}`, values: [[String(coin[field])]] });
        }
      }
    }

    if (!data.length) return res.status(200).json({ updated: 0, notFound });

    const batchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data }),
      }
    );
    if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

    return res.status(200).json({ updated: coins.length - notFound.length, notFound });
  } catch (e) {
    console.error('inbox-update error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
