const crypto = require('crypto');

async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKey, 'base64url');

  const jwt = `${header}.${payload}.${sig}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!resp.ok) throw new Error('Token fetch failed: ' + await resp.text());
  return (await resp.json()).access_token;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !privateKey || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { updates } = body || {};
  if (!Array.isArray(updates) || !updates.length) {
    return res.status(400).json({ error: 'updates array required: [{insId, date}]' });
  }

  try {
    const token = await getAccessToken(email, privateKey);

    // Fetch Instances sheet to map insId → row number
    const fetchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Instances?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fetchResp.ok) throw new Error('Sheet fetch failed: ' + fetchResp.status);
    const { values } = await fetchResp.json();

    const rowMap = {};
    for (let i = 1; i < (values || []).length; i++) {
      const id = values[i][0]?.trim();
      if (id) rowMap[id] = i + 1; // 1-indexed sheet rows
    }

    const data = updates
      .filter(u => rowMap[u.insId])
      .map(u => ({ range: `Instances!L${rowMap[u.insId]}`, values: [[u.date || '']] }));

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
    return res.status(500).json({ error: e.message });
  }
};
