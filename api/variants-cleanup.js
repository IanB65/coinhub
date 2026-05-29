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

// COMM codes that already have a UK-D- equivalent (true duplicates — delete COMM, keep D)
const DUPLICATE_MAP = {
  'UK-COMM-£2-2007-ACTU-': 'UK-D-£2-2007-AofU-',
  'UK-COMM-£2-2007-ABST-': 'UK-D-£2-2007-ASTA-',
  'UK-COMM-£2-2020-MAYF-': 'UK-D-£2-2020-MAYF-',
  'UK-COMM-£2-2020-VEDA-': 'UK-D-£2-2020-VEDA-',
  'UK-COMM-£2-2022-25YR-': 'UK-D-£2-2022-25YR-',
  'UK-COMM-£2-2022-BELL-': 'UK-D-£2-2022-BELL-',
  'UK-COMM-£2-2022-FACP-': 'UK-D-£2-2022-FACP-',
  'UK-COMM-£2-2023-FSCO-': 'UK-D-£2-2023-FSM-',
  'UK-COMM-£2-2023-TOLK-': 'UK-D-£2-2023-JRRT-',
  'UK-COMM-£2-2024-NTLG-': 'UK-D-£2-2024-NTLG-',
  'UK-COMM-£2-2025-ORWL-': 'UK-D-£2-2025-ORWL-',
  'UK-COMM-£2-2026-ZSLL-': 'UK-D-£2-2026-ZSLL-',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !sheetId) return res.status(500).json({ error: 'Missing env vars' });

  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().slice(0, 10);

    // Get sheet numeric IDs
    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const meta = await metaResp.json();
    const variantsSheetId = meta.sheets.find(s => s.properties.title === 'Variants')?.properties.sheetId;

    // Fetch full Variants tab
    const varResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const varData = await varResp.json();
    const varRows = varData.values || [];

    // Collect existing variant codes
    const existingCodes = new Set(varRows.slice(1).map(r => r[0]?.trim()).filter(Boolean));

    // Find all COMM rows
    const commRows = [];
    for (let i = 1; i < varRows.length; i++) {
      const vc = varRows[i][0]?.trim();
      if (vc && vc.startsWith('UK-COMM-')) {
        commRows.push({ variantCode: vc, rowData: varRows[i] });
      }
    }

    // Build complete COMM→D mapping
    const codeMap = { ...DUPLICATE_MAP };
    const toCreate = []; // unique COMM rows that need a new UK-D- row

    for (const { variantCode, rowData } of commRows) {
      if (!codeMap[variantCode]) {
        const newCode = variantCode.replace('UK-COMM-', 'UK-D-');
        codeMap[variantCode] = newCode;
        if (!existingCodes.has(newCode)) {
          toCreate.push({
            newCode,
            row: [
              newCode,
              rowData[1] || '',
              rowData[2] || '',
              rowData[3] || '',
              rowData[4] || '',
              rowData[5] || '',
              rowData[6] || 'Need',
              rowData[7] || '',
              rowData[8] || '',
              rowData[9] || today,
              today,
            ],
          });
        }
      }
    }

    // Append new UK-D- rows
    if (toCreate.length > 0) {
      const appendResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: toCreate.map(x => x.row) }),
        }
      );
      if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());
    }

    // Update any Instances rows pointing to COMM codes
    const instResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Instances?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const instData = await instResp.json();
    const instRows = instData.values || [];
    const instUpdates = [];
    for (let i = 1; i < instRows.length; i++) {
      const vc = instRows[i][1]?.trim();
      if (vc && codeMap[vc]) {
        instUpdates.push({ range: `Instances!B${i + 1}`, values: [[codeMap[vc]]] });
      }
    }
    if (instUpdates.length > 0) {
      const instBatch = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: instUpdates }),
        }
      );
      if (!instBatch.ok) throw new Error('Instance update failed: ' + await instBatch.text());
    }

    // Re-fetch column A to get current row indices (after appending)
    const colAResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const colAData = await colAResp.json();
    const colA = (colAData.values || []).map(r => r[0]?.trim() || '');

    // Find row indices of COMM rows to delete (sort descending to avoid index shift)
    const deleteIndices = [];
    for (const { variantCode } of commRows) {
      const idx = colA.findIndex((vc, i) => i > 0 && vc === variantCode);
      if (idx !== -1) deleteIndices.push(idx);
    }
    deleteIndices.sort((a, b) => b - a);

    const deleteRequests = deleteIndices.map(idx => ({
      deleteDimension: {
        range: { sheetId: variantsSheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 },
      },
    }));

    if (deleteRequests.length > 0) {
      const delResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: deleteRequests }),
        }
      );
      if (!delResp.ok) throw new Error('Delete failed: ' + await delResp.text());
    }

    return res.status(200).json({
      ok: true,
      created: toCreate.length,
      deleted: deleteIndices.length,
      instancesUpdated: instUpdates.length,
      createdCodes: toCreate.map(x => x.newCode),
    });

  } catch (e) {
    console.error('variants-cleanup error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
