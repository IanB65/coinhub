const crypto = require('crypto');

const SHEET_ID = '1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4';
const ALLOWED_TABS = ['Variants', 'Instances', 'Images'];

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

function makeJWT(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(sa) {
  const jwt = makeJWT(sa);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function toCSV(rows) {
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\r\n');
}

module.exports = async function handler(req, res) {
  const tab = req.query.tab;
  if (!ALLOWED_TABS.includes(tab)) {
    return res.status(400).json({ error: `Invalid tab. Allowed: ${ALLOWED_TABS.join(', ')}` });
  }

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    return res.status(500).json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON env var not set' });
  }

  try {
    const sa = JSON.parse(saJson);
    const token = await getAccessToken(sa);

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}?majorDimension=ROWS`;
    const sheetsRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!sheetsRes.ok) {
      const err = await sheetsRes.text();
      return res.status(sheetsRes.status).json({ error: err });
    }

    const data = await sheetsRes.json();
    const rows = data.values || [];

    // Pad all rows to same width as header
    const width = rows[0]?.length || 0;
    const padded = rows.map(r => {
      while (r.length < width) r.push('');
      return r;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).send(toCSV(padded));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
