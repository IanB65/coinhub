const crypto = require('crypto');

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  } catch { return false; }
}

function verifyOwnerToken(req) {
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
    if (payload.role === 'guest') return false;
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

async function readInbox(token, sheetId) {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error('Inbox fetch failed: ' + resp.status);
  const { values } = await resp.json();
  return values || [];
}

module.exports = async function handler(req, res) {
  const isOwner = verifyOwnerToken(req);
  const isService = verifyServiceKey(req);

  if (!isOwner && !isService) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  // GET — return current inbox rows (owner JWT only)
  if (req.method === 'GET') {
    if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
    try {
      const token = await getAccessToken();
      const rows = await readInbox(token, sheetId);
      // Return data rows (skip header), as objects
      const items = rows.slice(1).map((r, i) => ({
        rowIndex: i + 1, // 1-based index in the data (excluding header)
        variantCode: r[0] || '',
        name: r[1] || '',
        denomination: r[2] || '',
        collection: r[3] || '',
        monarch: r[4] || '',
        year: r[5] || '',
        imageUrl: r[6] || '',
        sourceUrl: r[7] || '',
        price: r[8] || '',
        approved: (r[9] || '').toUpperCase() === 'TRUE',
        dateFound: r[10] || '',
      }));
      return res.status(200).json({ items });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const requestedCodes = Array.isArray(body.variantCodes) ? new Set(body.variantCodes) : null;
    const discard = body.discard === true;

    const token = await getAccessToken();

    // Get sheet metadata for NewCoinsInbox numeric sheetId (needed for row deletion)
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaResp.ok) throw new Error('Metadata fetch failed: ' + metaResp.status);
    const meta = await metaResp.json();
    const inboxSheet = meta.sheets.find(s => s.properties.title === 'NewCoinsInbox');
    if (!inboxSheet) throw new Error('NewCoinsInbox tab not found');
    const inboxSheetId = inboxSheet.properties.sheetId;

    const inboxRows = await readInbox(token, sheetId);

    if (!inboxRows || inboxRows.length <= 1) {
      return res.status(200).json({ approved: 0, discarded: 0, message: 'Inbox is empty' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const targetIndices = [];
    const variantRows = [];

    for (let i = 1; i < inboxRows.length; i++) {
      const r = inboxRows[i];
      const code = (r[0] || '').trim();
      const approvedCol = (r[9] || '').toUpperCase();

      // Select by explicit code list, or fall back to col J checkbox (GitHub Actions path)
      const selected = requestedCodes ? requestedCodes.has(code) : approvedCol === 'TRUE';
      if (!selected) continue;

      targetIndices.push(i);
      if (!discard) {
        variantRows.push([
          code,
          r[1] || '', // name
          r[2] || '', // denomination
          r[3] || '', // collection
          r[4] || '', // monarch
          r[5] || '', // year
          'Need',
          r[6] || '', // imageUrl
          '',         // notes
          today,
          today,
        ]);
      }
    }

    if (!targetIndices.length) {
      return res.status(200).json({ approved: 0, discarded: 0, message: discard ? 'No matching rows to discard' : 'No approved rows found' });
    }

    // Append to Variants (unless discarding)
    if (!discard && variantRows.length) {
      const appendResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: variantRows }),
        }
      );
      if (!appendResp.ok) throw new Error('Variants append failed: ' + await appendResp.text());
    }

    // Delete rows from inbox (reverse order to preserve indices)
    const deleteRequests = targetIndices.slice().reverse().map(i => ({
      deleteDimension: {
        range: { sheetId: inboxSheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
      },
    }));
    const deleteResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: deleteRequests }),
      }
    );
    if (!deleteResp.ok) throw new Error('Row deletion failed: ' + await deleteResp.text());

    return res.status(200).json(
      discard
        ? { approved: 0, discarded: targetIndices.length }
        : { approved: variantRows.length, discarded: 0 }
    );
  } catch (e) {
    console.error('inbox-approve error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
