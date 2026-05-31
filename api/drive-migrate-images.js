const crypto = require('crypto');

function verifyToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const secret = process.env.COINHUB_JWT_SECRET;
  if (!secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.role === 'guest') return null;
    return payload;
  } catch { return null; }
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
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Token refresh failed: ' + text);
  }
  return (await resp.json()).access_token;
}

async function uploadToDrive(token, folderId, filename, buffer, mimeType) {
  const boundary = 'coinhub_' + Date.now();
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];
  const body = Buffer.concat([
    Buffer.from(parts.join('')),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    // Surface a clear hint if the token is missing Drive scope
    if (resp.status === 403 || resp.status === 401) {
      throw new Error(`Drive upload auth error (token may need Drive scope): ${text}`);
    }
    throw new Error(`Drive upload failed ${resp.status}: ${text}`);
  }
  return (await resp.json()).id;
}

async function makePublic(token, fileId) {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  );
  if (!resp.ok) throw new Error('Set-public failed: ' + await resp.text());
}

// Process up to `concurrency` uploads in parallel
async function pooled(items, concurrency, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!sheetId || !apiKey) return res.status(500).json({ error: 'Missing GOOGLE_SHEET_ID or GOOGLE_API_KEY' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const {
    denomination,        // e.g. '10p' — omit to process all
    dryRun = false,
    offset = 0,
    limit = 30,
    folderId = '1Is60-8r2fH-yOMnVowYDW6_33GuUeoRQ',  // test folder by default
  } = body || {};

  try {
    // 1. Read Variants tab
    const varResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS&key=${apiKey}`
    );
    if (!varResp.ok) throw new Error('Variants fetch failed: ' + varResp.status);
    const { values } = await varResp.json();
    const [header, ...rows] = values || [];

    const cCode  = header.indexOf('variantCode');
    const cName  = header.indexOf('name');
    const cDenom = header.indexOf('denomination');
    const cImage = header.indexOf('imageUrl');

    // Filter: must have an image; optionally filter by denomination
    const candidates = rows.filter(r => {
      const hasImage = r[cImage]?.trim();
      if (!hasImage) return false;
      if (denomination) return r[cDenom]?.trim().toLowerCase() === denomination.toLowerCase();
      return true;
    });

    const total = candidates.length;
    const targets = candidates.slice(offset, offset + limit);

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        denomination: denomination || 'all',
        total,
        offset,
        limit,
        coins: targets.map(r => ({
          code: r[cCode],
          name: r[cName],
          denomination: r[cDenom],
          imageUrl: r[cImage],
        })),
      });
    }

    // 2. Get OAuth token + Images tab in parallel
    const [token, imgResp] = await Promise.all([
      getAccessToken(),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Images?majorDimension=ROWS&key=${apiKey}`),
    ]);

    if (!imgResp.ok) throw new Error('Images tab fetch failed: ' + imgResp.status);
    const imgData = await imgResp.json();
    const imgRows = imgData.values || [];

    // Build map: variantCode -> 1-based sheet row number
    const imgRowMap = {};
    for (let i = 1; i < imgRows.length; i++) {
      const code = imgRows[i][0]?.trim();
      if (code) imgRowMap[code] = i + 1;
    }

    // 3. Download + upload in parallel (5 at a time)
    const results = await pooled(targets, 5, async (row) => {
      const code     = row[cCode];
      const name     = row[cName];
      const imageUrl = row[cImage];

      try {
        const imgFetch = await fetch(imageUrl, {
          headers: { 'User-Agent': 'CoinHub/1.0 (+https://coins.ghghome.co.uk)' },
        });
        if (!imgFetch.ok) throw new Error(`Download ${imgFetch.status}`);

        const mimeType = (imgFetch.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        const ext      = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : mimeType.includes('gif') ? 'gif' : 'jpg';
        const filename = `${code}.${ext}`;
        const buffer   = Buffer.from(await imgFetch.arrayBuffer());

        const fileId = await uploadToDrive(token, folderId, filename, buffer, mimeType);
        await makePublic(token, fileId);

        const driveUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
        return { code, name, status: 'ok', fileId, driveUrl, originalUrl: imageUrl };
      } catch (err) {
        return { code, name, status: 'error', error: err.message, originalUrl: imageUrl };
      }
    });

    // 4. Update Images tab with successful Drive URLs
    const successful = results.filter(r => r.status === 'ok');

    if (successful.length > 0) {
      const updates = [];
      const appends = [];

      for (const r of successful) {
        if (imgRowMap[r.code]) {
          updates.push({ range: `Images!B${imgRowMap[r.code]}`, values: [[r.driveUrl]] });
        } else {
          appends.push([r.code, r.driveUrl]);
        }
      }

      if (updates.length) {
        const bResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
          }
        );
        if (!bResp.ok) throw new Error('Sheet batch update failed: ' + await bResp.text());
      }

      if (appends.length) {
        const aResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('Images!A:B')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: appends }),
          }
        );
        if (!aResp.ok) throw new Error('Sheet append failed: ' + await aResp.text());
      }
    }

    return res.status(200).json({
      denomination: denomination || 'all',
      total,
      offset,
      limit,
      processed: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      errors: results.filter(r => r.status === 'error').length,
      hasMore: offset + limit < total,
      nextOffset: offset + limit,
      results,
    });

  } catch (e) {
    console.error('drive-migrate error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
