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

function buildSearchQuery(name, denom, includeDenom = true) {
  // CoinHub names are often "Collection - Design name". Use the design part.
  const designPart = name.includes(' - ') ? name.split(' - ').slice(1).join(' ') : name;
  // Strip dots and punctuation that can confuse Numista search (e.g. J.R.R. → JRR)
  const clean = designPart.replace(/[.,'"""]/g, '').replace(/\s+/g, ' ').trim();
  return includeDenom && denom ? `${denom} ${clean}` : clean;
}

async function numistaSearch(name, year, denom, apiKey) {
  const doSearch = async (q) => {
    const url = `https://api.numista.com/api/v3/coins?q=${encodeURIComponent(q)}&issuer=united-kingdom&count=10&lang=en`;
    const r = await fetch(url, { headers: { 'Numista-API-Key': apiKey } });
    if (r.status === 429) throw new Error('Quota exceeded');
    if (!r.ok) return null;
    const data = await r.json();
    const items = data.items || data.types || [];
    if (!items.length) return null;
    // Prefer results whose year range covers this coin's year
    if (year) {
      const match = items.find(c => {
        const lo = parseInt(c.min_year) || 0;
        const hi = parseInt(c.max_year) || 9999;
        return year >= lo && year <= hi;
      });
      if (match) return match.id;
    }
    return items[0].id;
  };

  try {
    // First try: with denomination prefix
    const id = await doSearch(buildSearchQuery(name, denom, true));
    if (id) return id;
    // Fallback: without denomination prefix (costs one extra call only on miss)
    if (denom) return await doSearch(buildSearchQuery(name, denom, false));
    return null;
  } catch(e) {
    if (e.message === 'Quota exceeded') throw e;
    return null;
  }
}

async function numistaPrice(numistaId, apiKey) {
  const url = `https://api.numista.com/api/v3/coins/${numistaId}/prices?currency=GBP`;
  try {
    const r = await fetch(url, { headers: { 'Numista-API-Key': apiKey } });
    if (!r.ok) return { estimatedValue: null, pricesByGrade: {} };
    const data = await r.json();
    const prices = data.prices || [];
    // Build a grade → price map from all GBP prices
    const pricesByGrade = {};
    for (const p of prices) {
      if (p.currency === 'GBP' && p.grade) {
        const val = p.average ?? p.median ?? p.max ?? null;
        if (val !== null) pricesByGrade[p.grade] = Math.round(Number(val) * 100) / 100;
      }
    }
    // General fallback: first GBP price (used for variant-level display and want-list analysis)
    const gbp = prices.find(p => p.currency === 'GBP') || prices[0];
    if (!gbp) return { estimatedValue: null, pricesByGrade };
    const val = gbp.average ?? gbp.median ?? gbp.max ?? null;
    return { estimatedValue: val !== null ? Math.round(Number(val) * 100) / 100 : null, pricesByGrade };
  } catch { return { estimatedValue: null, pricesByGrade: {} }; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const apiKey = process.env.NUMISTA_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NUMISTA_API_KEY not configured in environment' });

  const sheetId = process.env.GOOGLE_SHEET_ID;

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  // coins: [{variantCode, name, year, denom, numistaId?}]
  const { coins = [] } = body;
  if (!coins.length) return res.status(200).json({ results: [] });

  const results = await Promise.all(coins.map(async coin => {
    const { variantCode, name, year, denom, numistaId: knownId } = coin;
    try {
      let numistaId = knownId || null;
      if (!numistaId && name) {
        numistaId = await numistaSearch(name, year, denom, apiKey);
      }
      if (!numistaId) return { variantCode, numistaId: null, estimatedValue: null, pricesByGrade: {}, found: false };
      const { estimatedValue, pricesByGrade } = await numistaPrice(numistaId, apiKey);
      return { variantCode, numistaId, estimatedValue, pricesByGrade, found: true };
    } catch(e) {
      if (e.message === 'Quota exceeded') return { variantCode, numistaId: null, estimatedValue: null, pricesByGrade: {}, found: false, quotaExceeded: true };
      return { variantCode, numistaId: null, estimatedValue: null, pricesByGrade: {}, found: false };
    }
  }));

  // Write results back to the Values sheet
  if (sheetId && process.env.GOOGLE_CLIENT_ID) {
    try {
      const token = await getGoogleToken();

      // Read existing Values sheet to build row map
      const sheetResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Values?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let existingRows = [];
      if (sheetResp.ok) {
        const d = await sheetResp.json();
        existingRows = d.values || [];
      } else if (sheetResp.status === 400) {
        // Values tab doesn't exist — create it
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Values' } } }] }),
        });
      }

      // If sheet is empty, write the header row first
      const isEmpty = existingRows.length === 0;

      const rowMap = {};
      for (let i = 1; i < existingRows.length; i++) {
        const vc = existingRows[i][0]?.trim();
        if (vc) rowMap[vc] = i + 1;
      }

      const now = new Date().toISOString().split('T')[0];
      const batchData = [];
      const appendRows = [];

      if (isEmpty) {
        appendRows.push(['variantCode', 'numistaId', 'estimatedValue', 'lastUpdated']);
      }

      for (const r of results) {
        if (!r.found) continue;
        const row = [
          r.variantCode,
          r.numistaId || '',
          r.estimatedValue !== null ? String(r.estimatedValue) : '',
          now,
        ];
        if (rowMap[r.variantCode]) {
          batchData.push({
            range: `Values!A${rowMap[r.variantCode]}:D${rowMap[r.variantCode]}`,
            values: [row],
          });
        } else {
          appendRows.push(row);
        }
      }

      if (batchData.length) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: batchData }),
        });
      }

      if (appendRows.length) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Values:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: appendRows }),
          }
        );
      }

      // Also write estimatedValue + valueDate back to Variants sheet (cols M & N) for analysis
      const foundResults = results.filter(r => r.found);
      if (foundResults.length) {
        const varResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (varResp.ok) {
          const { values: varCodes } = await varResp.json();
          const varRowMap = {};
          (varCodes || []).forEach((r, i) => { if (i > 0 && r[0]?.trim()) varRowMap[r[0].trim()] = i + 1; });
          const varBatch = foundResults
            .filter(r => varRowMap[r.variantCode])
            .map(r => ({
              range: `Variants!M${varRowMap[r.variantCode]}:N${varRowMap[r.variantCode]}`,
              values: [[r.estimatedValue !== null ? String(r.estimatedValue) : '', now]],
            }));
          if (varBatch.length) {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: varBatch }),
            });
          }
        }
      }
    } catch (e) {
      console.error('Values sheet write error:', e.message);
      // Return results even if sheet write failed
    }
  }

  return res.status(200).json({ results });
};
