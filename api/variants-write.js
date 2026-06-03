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

// Variants columns: A=variantCode B=name C=denomination D=collection E=monarch F=year G=status H=imageUrl I=notes J=dateAdded K=lastModified
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

  const { action, variantCode, name, denom, collection, monarch, year, status, imgUrl, notes, priority } = body || {};

  if (action === 'seed-monarchs') {
    const PORTRAITS = [
      ['King Charles III',   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/King_Charles_III_%28July_2023%29.jpg/500px-King_Charles_III_%28July_2023%29.jpg'],
      ['Queen Elizabeth II', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Queen_Elizabeth_II_on_her_Coronation_Day.jpg/500px-Queen_Elizabeth_II_on_her_Coronation_Day.jpg'],
      ['King George Vi',     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/King_George_VI_LOC_matpc.14736_A_%28cropped%29.jpg/500px-King_George_VI_LOC_matpc.14736_A_%28cropped%29.jpg'],
      ['King George V',      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/King_George_1923_LCCN2014715558_%28cropped%29.jpg/500px-King_George_1923_LCCN2014715558_%28cropped%29.jpg'],
      ['King George III',    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/King_George_III_of_England_by_Johann_Zoffany.jpg/500px-King_George_III_of_England_by_Johann_Zoffany.jpg'],
      ['King Edward VII',    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/King-Edward-VII_%28cropped%29_%28b%29.jpg/500px-King-Edward-VII_%28cropped%29_%28b%29.jpg'],
      ['Queen Victoria',     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Queen_Victoria_by_Bassano.jpg/500px-Queen_Victoria_by_Bassano.jpg'],
    ];
    try {
      const token = await getAccessToken();
      const readResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Monarchs`, { headers: { Authorization: `Bearer ${token}` } });
      if (!readResp.ok) throw new Error('Read failed: ' + await readResp.text());
      const rows = (await readResp.json()).values || [];
      const headers = (rows[0] || []).map(h => h.trim().toLowerCase());
      let nameCol     = headers.indexOf('name');
      let portraitCol = headers.findIndex(h => h.includes('portrait') || h.includes('imageurl') || h.includes('image'));

      if (nameCol === -1 || portraitCol === -1) {
        const values = [['name', 'portraitUrl'], ...PORTRAITS];
        const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Monarchs!A1?valueInputOption=RAW`, {
          method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ range: 'Monarchs!A1', majorDimension: 'ROWS', values }),
        });
        if (!wr.ok) throw new Error('Write failed: ' + await wr.text());
        return res.status(200).json({ ok: true, action: 'wrote_fresh', rows: values.length });
      }

      const nameToRowIdx = {};
      for (let i = 1; i < rows.length; i++) { const n = rows[i][nameCol]?.trim(); if (n) nameToRowIdx[n] = i; }
      const colLetter = String.fromCharCode(65 + portraitCol);
      let nextRow = rows.length + 1;
      const results = [];
      for (const [n, url] of PORTRAITS) {
        const ri = nameToRowIdx[n];
        if (ri !== undefined) {
          const range = `Monarchs!${colLetter}${ri + 1}`;
          const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
            method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[url]] }),
          });
          if (!wr.ok) throw new Error(`Update ${n} failed: ` + await wr.text());
          results.push({ name: n, action: 'updated' });
        } else {
          const newRow = new Array(Math.max(nameCol, portraitCol) + 1).fill('');
          newRow[nameCol] = n; newRow[portraitCol] = url;
          const range = `Monarchs!A${nextRow}`;
          const wr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
            method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ range, majorDimension: 'ROWS', values: [newRow] }),
          });
          if (!wr.ok) throw new Error(`Append ${n} failed: ` + await wr.text());
          results.push({ name: n, action: 'appended' }); nextRow++;
        }
      }
      return res.status(200).json({ ok: true, results });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // One-shot migration: fix wrong monarchs on pre-decimal threepence variants.
  // POST body: { action: 'fix-threepence-monarchs' }  (add dry: true to preview)
  // Remove this block after running.
  if (action === 'fix-threepence-monarchs') {
    try {
      const token = await getAccessToken();
      const today = new Date().toISOString().slice(0, 10);
      const readResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!readResp.ok) throw new Error('Sheet read failed: ' + await readResp.text());
      const { values } = await readResp.json();
      const dryRun = body.dry === true;
      const updates = [], log = [];
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const vc = row[0]?.trim() ?? '';
        const m = vc.match(/^UK-PD-THRE-(\d{4})-$/);
        if (!m) continue;
        const yr = parseInt(m[1], 10);
        const correctMonarch = yr >= 1902 && yr <= 1910 ? 'King Edward VII'
                             : yr >= 1911 && yr <= 1936 ? 'King George V' : null;
        if (!correctMonarch) continue;
        if ((row[4]?.trim() ?? '') === correctMonarch) { log.push({ vc, action: 'skipped' }); continue; }
        const sr = i + 1;
        const newNotes = `A pre-decimal silver threepence from ${yr}, struck during the reign of ${correctMonarch}.`;
        log.push({ vc, action: dryRun ? 'would-fix' : 'fixed', from: row[4], to: correctMonarch });
        if (!dryRun) updates.push(
          { range: `Variants!E${sr}`, values: [[correctMonarch]] },
          { range: `Variants!I${sr}`, values: [[newNotes]] },
          { range: `Variants!K${sr}`, values: [[today]] }
        );
      }
      if (!dryRun && updates.length) {
        const br = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }) }
        );
        if (!br.ok) throw new Error('Batch update failed: ' + await br.text());
      }
      return res.status(200).json({ dryRun, fixed: updates.length / 3, log });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // One-shot seed: append all missing pre-decimal threepence variants (status LIST).
  // Call: POST /api/variants-write  body: { action: 'seed-missing-threepences' }
  // Add dry: true to preview. Delete this block after running.
  if (action === 'seed-missing-threepences') {
    // Complete struck-coin reference list, grouped by [variantCode, name, monarch, year, notes]
    const MISSING = [
      // Victoria silver (years Ian doesn't have yet)
      ...[1838,1839,1840,1841,1842,1843,1844,1845,1846,1848,1850,1851,1852,1853,1854,1855,1856,1857,1858,1859,
          1861,1862,1863,1864,1865,1866,1869,1871,1872,1875,1876,1877,1878,1880,1881,1882,1883,
          1887,1888,1889,1891,1892,1894,1896,1897,1898].map(y => [
        `UK-PD-THRE-${y}-`, 'Threepence (Silver)', 'Queen Victoria', y,
        `A pre-decimal silver threepence from ${y}, struck during the reign of Queen Victoria.`
      ]),
      // Edward VII silver (missing years)
      ...[1903,1904,1905,1906,1908,1909,1910].map(y => [
        `UK-PD-THRE-${y}-`, 'Threepence (Silver)', 'King Edward VII', y,
        `A pre-decimal silver threepence from ${y}, struck during the reign of King Edward VII.`
      ]),
      // George V silver (missing years)
      ...[1913,1914,1923,1924,1925,1927,1928,1929,1932].map(y => [
        `UK-PD-THRE-${y}-`, 'Threepence (Silver)', 'King George V', y,
        `A pre-decimal silver threepence from ${y}, struck during the reign of King George V.`
      ]),
      // George VI silver threepences (separate coin from the 12-sided brass; different variant code)
      ...[1937,1938,1939,1940,1941,1942,1943,1944].map(y => [
        `UK-PD-THRE-${y}-SIL-`, 'Threepence (Silver)', 'King George VI', y,
        `A pre-decimal silver threepence from ${y}, struck during the reign of King George VI. The small silver threepence was issued alongside the 12-sided brass version.`
      ]),
    ];

    try {
      const token = await getAccessToken();
      const readResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!readResp.ok) throw new Error('Sheet read failed: ' + await readResp.text());
      const existing = new Set(((await readResp.json()).values || []).slice(1).map(r => r[0]?.trim()).filter(Boolean));

      const dryRun = body.dry === true;
      const today = new Date().toISOString().slice(0, 10);
      const toAdd = MISSING.filter(([vc]) => !existing.has(vc));
      const skipped = MISSING.filter(([vc]) => existing.has(vc)).map(([vc]) => vc);

      if (!dryRun && toAdd.length > 0) {
        const rows = toAdd.map(([vc, name, monarch, yr, notes]) =>
          [vc, name, 'Threepence', 'Pre Decimal', monarch, String(yr), 'List', '', notes, today, today]
        );
        const appendResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: rows }) }
        );
        if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());
      }

      return res.status(200).json({
        dryRun, added: toAdd.length, skippedAlreadyExist: skipped.length,
        toAdd: toAdd.map(([vc]) => vc), skipped
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (!variantCode) return res.status(400).json({ error: 'variantCode required' });

  try {
    const token = await getAccessToken();
    const today = new Date().toISOString().slice(0, 10);

    if (action === 'setPriority') {
      const readResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
      const { values } = await readResp.json();
      const rowIndex = (values || []).findIndex((r, i) => i > 0 && r[0]?.trim() === variantCode);
      if (rowIndex === -1) return res.status(404).json({ error: `Variant ${variantCode} not found` });
      const sheetRow = rowIndex + 1;
      const writeResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!L${sheetRow}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[priority ? 'TRUE' : 'FALSE']] }),
        }
      );
      if (!writeResp.ok) throw new Error('Priority write failed: ' + await writeResp.text());
      return res.status(200).json({ ok: true, variantCode, priority: !!priority });
    }

    if (action === 'delete') {
      const readResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
      const { values } = await readResp.json();
      const rowIndex = (values || []).findIndex((r, i) => i > 0 && r[0]?.trim() === variantCode);
      if (rowIndex === -1) return res.status(404).json({ error: `Variant ${variantCode} not found` });

      const sheetRow = rowIndex + 1;

      const metaResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaResp.ok) throw new Error('Metadata fetch failed: ' + metaResp.status);
      const meta = await metaResp.json();
      const variantsSheet = (meta.sheets || []).find(s => s.properties?.title === 'Variants');
      if (!variantsSheet) throw new Error('Variants sheet not found');
      const sheetGid = variantsSheet.properties.sheetId;

      const deleteResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              deleteDimension: {
                range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow }
              }
            }]
          }),
        }
      );
      if (!deleteResp.ok) throw new Error('Delete failed: ' + await deleteResp.text());
      return res.status(200).json({ ok: true, variantCode, deleted: true });
    }

    if (action === 'create') {
      const readResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
      const { values } = await readResp.json();
      const exists = (values || []).slice(1).some(r => r[0]?.trim() === variantCode);
      if (exists) return res.status(409).json({ error: `Variant ${variantCode} already exists` });

      const newRow = [variantCode, name || '', denom || '', collection || '', monarch || '', year || '', status || 'Need', imgUrl || '', notes || '', today, today];
      const appendResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [newRow] }),
        }
      );
      if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());
      return res.status(201).json({ ok: true, variantCode, created: true });
    }

    const readResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!readResp.ok) throw new Error('Sheet fetch failed: ' + readResp.status);
    const { values } = await readResp.json();

    const rowIndex = (values || []).findIndex((r, i) => i > 0 && r[0]?.trim() === variantCode);
    if (rowIndex === -1) return res.status(404).json({ error: `Variant ${variantCode} not found` });

    const sheetRow = rowIndex + 1;
    const existing = values[rowIndex];

    const data = [
      { range: `Variants!B${sheetRow}`, values: [[name ?? existing[1] ?? '']] },
      { range: `Variants!C${sheetRow}`, values: [[denom ?? existing[2] ?? '']] },
      { range: `Variants!D${sheetRow}`, values: [[collection ?? existing[3] ?? '']] },
      { range: `Variants!E${sheetRow}`, values: [[monarch ?? existing[4] ?? '']] },
      { range: `Variants!F${sheetRow}`, values: [[year ?? existing[5] ?? '']] },
      { range: `Variants!G${sheetRow}`, values: [[status ?? existing[6] ?? '']] },
      { range: `Variants!H${sheetRow}`, values: [[imgUrl ?? existing[7] ?? '']] },
      { range: `Variants!I${sheetRow}`, values: [[notes ?? existing[8] ?? '']] },
      { range: `Variants!K${sheetRow}`, values: [[today]] },
    ];

    const batchResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
      }
    );
    if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

    return res.status(200).json({ ok: true, variantCode });
  } catch (e) {
    console.error('variants-write error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
