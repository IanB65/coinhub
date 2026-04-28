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
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { action, instance, id } = body || {};
  if (!action) return res.status(400).json({ error: 'action required: add | remove' });

  try {
    const token = await getAccessToken();

    if (action === 'add') {
      if (!instance || !instance.id || !instance.variantCode) {
        return res.status(400).json({ error: 'instance.id and instance.variantCode required' });
      }
      // Columns: A=id, B=variantCode, C=s1, D=s2, E=s3, F=cond, G=ptype, H=desc, I=notes, J='', K=lastStocktake, L='', M=lastEdited
      const row = [
        instance.id,
        instance.variantCode,
        instance.s1 || '',
        instance.s2 || '',
        instance.s3 || '',
        instance.cond || '',
        instance.ptype || '',
        instance.desc || '',
        instance.notes || '',
        '',
        instance.lastStocktake || '',
        '',
        instance.lastEdited || new Date().toISOString().slice(0, 10),
      ];
      const appendResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Instances:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [row] }),
        }
      );
      if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());
      return res.status(200).json({ ok: true, action: 'add', id: instance.id });
    }

    if (action === 'remove') {
      if (!id) return res.status(400).json({ error: 'id required for remove' });

      // Fetch sheet metadata to get numeric sheetId for Instances tab
      const metaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaResp.ok) throw new Error('Metadata fetch failed: ' + metaResp.status);
      const meta = await metaResp.json();
      const instSheet = meta.sheets.find(s => s.properties.title === 'Instances');
      if (!instSheet) throw new Error('Instances tab not found');
      const instSheetId = instSheet.properties.sheetId;

      // Find the row index of the instance
      const readResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Instances?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!readResp.ok) throw new Error('Read failed: ' + readResp.status);
      const { values } = await readResp.json();
      const rowIndex = (values || []).findIndex((r, i) => i > 0 && r[0]?.trim() === id);
      if (rowIndex === -1) return res.status(404).json({ error: `Instance ${id} not found in sheet` });

      const deleteResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              deleteDimension: {
                range: { sheetId: instSheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
              }
            }]
          }),
        }
      );
      if (!deleteResp.ok) throw new Error('Delete failed: ' + await deleteResp.text());
      return res.status(200).json({ ok: true, action: 'remove', id });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('instances-write error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
