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

    // Read existing inbox + Variants to avoid duplicates
    const [inboxResp, variantsResp] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const inboxData = inboxResp.ok ? await inboxResp.json() : { values: [] };
    const variantsData = variantsResp.ok ? await variantsResp.json() : { values: [] };
    const existingCodes = new Set([
      ...(inboxData.values || []).slice(1).map(r => r[0]).filter(Boolean),
      ...(variantsData.values || []).slice(1).map(r => r[0]).filter(Boolean),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const newRows = coins
      .filter(c => c.variantCode && !existingCodes.has(c.variantCode))
      .map(c => [
        c.variantCode || '',
        c.name || '',
        c.denomination || '',
        c.collection || '',
        c.monarch || '',
        c.year || '',
        c.imageUrl || '',
        c.sourceUrl || '',
        c.price || '',
        'FALSE',
        today,
      ]);

    if (!newRows.length) return res.status(200).json({ staged: 0, skipped: coins.length });

    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: newRows }),
      }
    );
    if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());

    // Add checkbox validation to column J of the newly appended rows
    try {
      const appendData = await appendResp.json();
      const updatedRange = appendData.updates?.updatedRange || '';
      // updatedRange looks like "NewCoinsInbox!A12:K14" — extract row numbers
      const match = updatedRange.match(/:?[A-Z]+(\d+):[A-Z]+(\d+)/);
      if (match) {
        const startRow = parseInt(match[1], 10);
        const endRow = parseInt(match[2], 10);
        // Get the numeric sheetId for NewCoinsInbox
        const metaResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (metaResp.ok) {
          const meta = await metaResp.json();
          const inboxSheet = meta.sheets.find(s => s.properties.title === 'NewCoinsInbox');
          if (inboxSheet) {
            const inboxSheetId = inboxSheet.properties.sheetId;
            // Column J = index 9 (0-based)
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  requests: [{
                    setDataValidation: {
                      range: { sheetId: inboxSheetId, startRowIndex: startRow - 1, endRowIndex: endRow, startColumnIndex: 9, endColumnIndex: 10 },
                      rule: { condition: { type: 'BOOLEAN' }, showCustomUi: true },
                    },
                  }],
                }),
              }
            );
          }
        }
      }
    } catch (_) { /* checkbox step is best-effort */ }

    return res.status(200).json({ staged: newRows.length, skipped: coins.length - newRows.length });
  } catch (e) {
    console.error('inbox-stage error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
