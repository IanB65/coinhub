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

async function getGoogleToken() {
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
  if (!resp.ok) throw new Error('Google token refresh: ' + await resp.text());
  return (await resp.json()).access_token;
}

async function fetchSpinkCode(numistaId, apiKey) {
  const url = `https://api.numista.com/api/v3/coins/${numistaId}`;
  const r = await fetch(url, { headers: { 'Numista-API-Key': apiKey } });
  if (r.status === 429) throw new Error('Quota exceeded');
  if (!r.ok) return null;
  const data = await r.json();
  const refs = data.references || [];
  const spinkRef = refs.find(ref => ref.catalogue?.name?.toLowerCase().includes('spink'));
  return spinkRef ? spinkRef.number || null : null;
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const apiKey = process.env.NUMISTA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NUMISTA_API_KEY not configured' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(500).json({ error: 'GOOGLE_SHEET_ID not configured' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { body = {}; }
  const force = !!body.force;

  try {
    const token = await getGoogleToken();

    // Read Variants sheet (cols A:P) to get variantCodes, numistaIds (col O), spinkCodes (col P)
    const varResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:P?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!varResp.ok) throw new Error('Failed to read Variants sheet: ' + await varResp.text());
    const { values: varRows = [] } = await varResp.json();

    // Write header to P1 if missing
    const headerRow = varRows[0] || [];
    if (!headerRow[15]) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!P1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [['spinkCode']] }),
        }
      );
    }

    // Read Values sheet to get auto-resolved numistaIds
    const valResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Values!A:B?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const valuesNumistaMap = {};
    if (valResp.ok) {
      const { values: valRows = [] } = await valResp.json();
      for (let i = 1; i < valRows.length; i++) {
        const vc = valRows[i][0]?.trim();
        const nid = valRows[i][1]?.trim();
        if (vc && nid) valuesNumistaMap[vc] = nid;
      }
    }

    // Build list of variants to process
    const toProcess = [];
    for (let i = 1; i < varRows.length; i++) {
      const r = varRows[i];
      const vc = r[0]?.trim();
      if (!vc) continue;
      const numistaId = r[14]?.trim() || valuesNumistaMap[vc] || '';
      if (!numistaId) continue;
      const existingSpink = r[15]?.trim() || '';
      if (existingSpink && !force) continue;
      toProcess.push({ vc, numistaId, rowNum: i + 1 });
    }

    // Fetch Spink codes in batches of 10 with 300ms pause between batches
    const BATCH = 10;
    const results = [];
    let quotaExceeded = false;

    for (let i = 0; i < toProcess.length; i += BATCH) {
      if (quotaExceeded) break;
      const batch = toProcess.slice(i, i + BATCH);
      for (const item of batch) {
        try {
          const spinkCode = await fetchSpinkCode(item.numistaId, apiKey);
          results.push({ variantCode: item.vc, numistaId: item.numistaId, spinkCode, rowNum: item.rowNum });
        } catch (e) {
          if (e.message === 'Quota exceeded') { quotaExceeded = true; break; }
          results.push({ variantCode: item.vc, numistaId: item.numistaId, spinkCode: null, rowNum: item.rowNum });
        }
      }
      if (!quotaExceeded && i + BATCH < toProcess.length) await sleep(300);
    }

    // Write found Spink codes back to Variants!P
    const batchData = results
      .filter(r => r.spinkCode)
      .map(r => ({ range: `Variants!P${r.rowNum}`, values: [[r.spinkCode]] }));

    if (batchData.length) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: batchData }),
      });
    }

    return res.status(200).json({
      updated: batchData.length,
      processed: results.length,
      skipped: toProcess.length - results.length,
      quotaExceeded,
      results: results.map(({ variantCode, numistaId, spinkCode }) => ({ variantCode, numistaId, spinkCode })),
    });
  } catch (e) {
    console.error('spink-sync error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
