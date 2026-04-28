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

  try {
    const token = await getAccessToken();

    // Get sheet metadata to find NewCoinsInbox numeric sheetId (needed for row deletion)
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaResp.ok) throw new Error('Metadata fetch failed: ' + metaResp.status);
    const meta = await metaResp.json();
    const inboxSheet = meta.sheets.find(s => s.properties.title === 'NewCoinsInbox');
    if (!inboxSheet) throw new Error('NewCoinsInbox tab not found — please create it first');
    const inboxSheetId = inboxSheet.properties.sheetId;

    // Read NewCoinsInbox
    // Columns: variantCode(A), name(B), denomination(C), collection(D), monarch(E),
    //          year(F), imageUrl(G), sourceUrl(H), price(I), approved(J), dateFound(K)
    const inboxResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!inboxResp.ok) throw new Error('Inbox fetch failed: ' + inboxResp.status);
    const { values: inboxRows } = await inboxResp.json();

    if (!inboxRows || inboxRows.length <= 1) {
      return res.status(200).json({ approved: 0, message: 'Inbox is empty' });
    }

    const today = new Date().toISOString().slice(0, 10);
    // Row indices (0-based in array, 1-based in sheet; header is row 1 = index 0)
    const approvedIndices = [];
    const variantRows = [];

    for (let i = 1; i < inboxRows.length; i++) {
      const r = inboxRows[i];
      const approved = (r[9] || '').toUpperCase();
      if (approved === 'TRUE') {
        approvedIndices.push(i); // array index (sheet row = i + 1)
        // Map to Variants columns: variantCode, name, denomination, collection, monarch, year,
        //                          status, imageUrl, notes, dateAdded, lastModified
        variantRows.push([
          r[0] || '', // variantCode
          r[1] || '', // name
          r[2] || '', // denomination
          r[3] || '', // collection
          r[4] || '', // monarch
          r[5] || '', // year
          'Need',     // status
          r[6] || '', // imageUrl
          '',         // notes
          today,      // dateAdded
          today,      // lastModified
        ]);
      }
    }

    if (!variantRows.length) {
      return res.status(200).json({ approved: 0, message: 'No approved rows found' });
    }

    // Append approved rows to Variants
    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: variantRows }),
      }
    );
    if (!appendResp.ok) throw new Error('Variants append failed: ' + await appendResp.text());

    // Delete approved rows from NewCoinsInbox (reverse order to preserve indices)
    const deleteRequests = approvedIndices.slice().reverse().map(i => ({
      deleteDimension: {
        range: {
          sheetId: inboxSheetId,
          dimension: 'ROWS',
          startIndex: i,   // 0-based
          endIndex: i + 1,
        },
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

    return res.status(200).json({ approved: variantRows.length });
  } catch (e) {
    console.error('inbox-approve error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
