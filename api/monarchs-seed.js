const crypto = require('crypto');

// Portrait URLs sourced from Wikimedia Commons
const PORTRAITS = [
  ['King Charles III',   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/King_Charles_III_%28July_2023%29.jpg/500px-King_Charles_III_%28July_2023%29.jpg'],
  ['Queen Elizabeth II', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Queen_Elizabeth_II_on_her_Coronation_Day.jpg/500px-Queen_Elizabeth_II_on_her_Coronation_Day.jpg'],
  ['King George Vi',     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/King_George_VI_LOC_matpc.14736_A_%28cropped%29.jpg/500px-King_George_VI_LOC_matpc.14736_A_%28cropped%29.jpg'],
  ['King George V',      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/King_George_1923_LCCN2014715558_%28cropped%29.jpg/500px-King_George_1923_LCCN2014715558_%28cropped%29.jpg'],
  ['King George III',    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/King_George_III_of_England_by_Johann_Zoffany.jpg/500px-King_George_III_of_England_by_Johann_Zoffany.jpg'],
  ['King Edward VII',    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/King-Edward-VII_%28cropped%29_%28b%29.jpg/500px-King-Edward-VII_%28cropped%29_%28b%29.jpg'],
  ['Queen Victoria',     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Queen_Victoria_by_Bassano.jpg/500px-Queen_Victoria_by_Bassano.jpg'],
];

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
  const token = await getAccessToken();

  // Read current Monarchs tab
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Monarchs`;
  const readResp = await fetch(readUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!readResp.ok) throw new Error('Read failed: ' + await readResp.text());
  const rows = (await readResp.json()).values || [];

  const headers = (rows[0] || []).map(h => h.trim().toLowerCase());
  let nameCol     = headers.indexOf('name');
  let portraitCol = headers.findIndex(h => h.includes('portrait') || h.includes('imageurl') || h.includes('image'));

  const results = [];

  // If no usable headers, write from scratch
  if (nameCol === -1 || portraitCol === -1) {
    const values = [['name', 'portraitUrl'], ...PORTRAITS];
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Monarchs!A1?valueInputOption=RAW`;
    const wr = await fetch(writeUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: 'Monarchs!A1', majorDimension: 'ROWS', values }),
    });
    if (!wr.ok) throw new Error('Write failed: ' + await wr.text());
    return res.status(200).json({ ok: true, action: 'wrote_fresh', rows: values.length });
  }

  // Map existing rows by monarch name
  const nameToRowIdx = {};
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][nameCol]?.trim();
    if (name) nameToRowIdx[name] = i;
  }

  const colLetter = String.fromCharCode(65 + portraitCol);
  let nextAppendRow = rows.length + 1;

  for (const [name, url] of PORTRAITS) {
    const existing = nameToRowIdx[name];
    if (existing !== undefined) {
      // Update portrait cell in existing row
      const range = `Monarchs!${colLetter}${existing + 1}`;
      const wr = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[url]] }) }
      );
      if (!wr.ok) throw new Error(`Update ${name} failed: ` + await wr.text());
      results.push({ name, action: 'updated' });
    } else {
      // Append new row
      const newRow = new Array(Math.max(nameCol, portraitCol) + 1).fill('');
      newRow[nameCol] = name;
      newRow[portraitCol] = url;
      const range = `Monarchs!A${nextAppendRow}`;
      const wr = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ range, majorDimension: 'ROWS', values: [newRow] }) }
      );
      if (!wr.ok) throw new Error(`Append ${name} failed: ` + await wr.text());
      results.push({ name, action: 'appended' });
      nextAppendRow++;
    }
  }

  return res.status(200).json({ ok: true, results });
};
