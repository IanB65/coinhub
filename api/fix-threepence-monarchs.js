/**
 * TEMPORARY one-shot migration endpoint.
 * Fixes incorrect monarch + notes on UK-PD-THRE variants.
 * Protected by GOOGLE_API_KEY.
 * DELETE THIS FILE after running.
 *
 * Call: GET https://coins.ghghome.co.uk/api/fix-threepence-monarchs?key=YOUR_GOOGLE_API_KEY
 * Add &dry=1 to preview without writing.
 */

async function getAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Token refresh failed: ' + await resp.text());
  return (await resp.json()).access_token;
}

function correctMonarch(year) {
  if (year >= 1902 && year <= 1910) return 'King Edward VII';
  if (year >= 1911 && year <= 1936) return 'King George V';
  return null;
}

module.exports = async function handler(req, res) {
  // Auth: accept Google API key as one-time migration gate
  const key = req.query?.key || '';
  if (!key || key !== process.env.GOOGLE_API_KEY) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const dryRun = req.query?.dry === '1';
  const sheetId = process.env.GOOGLE_SHEET_ID;

  try {
    const token = await getAccessToken();

    const readResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!readResp.ok) throw new Error('Sheet read failed: ' + await readResp.text());
    const { values } = await readResp.json();

    const today = new Date().toISOString().slice(0, 10);
    const updates = [];
    const log = [];

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const variantCode = row[0]?.trim() ?? '';
      const match = variantCode.match(/^UK-PD-THRE-(\d{4})-$/);
      if (!match) continue;

      const year = parseInt(match[1], 10);
      const monarch = correctMonarch(year);
      if (!monarch) continue;

      const currentMonarch = row[4]?.trim() ?? '';
      if (currentMonarch === monarch) {
        log.push({ variantCode, action: 'skipped', reason: 'already correct' });
        continue;
      }

      const sheetRow = i + 1;
      const newNotes = `A pre-decimal silver threepence from ${year}, struck during the reign of ${monarch}.`;

      log.push({ variantCode, action: dryRun ? 'would-fix' : 'fixed', from: currentMonarch, to: monarch });

      if (!dryRun) {
        updates.push(
          { range: `Variants!E${sheetRow}`, values: [[monarch]] },
          { range: `Variants!I${sheetRow}`, values: [[newNotes]] },
          { range: `Variants!K${sheetRow}`, values: [[today]] }
        );
      }
    }

    if (!dryRun && updates.length > 0) {
      const batchResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
        }
      );
      if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());
    }

    return res.status(200).json({ dryRun, fixed: updates.length / 3, log });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
