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

// ─── Scrapers ────────────────────────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

function extractText(html, regex) {
  const m = html.match(regex);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').trim() : null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Guess denomination from text.
 */
function guessDenomination(text) {
  const t = text.toLowerCase();
  if (t.includes('£5') || t.includes('five pound') || t.includes('5 pound')) return '£5';
  if (t.includes('£2') || t.includes('two pound') || t.includes('2 pound')) return '£2';
  if (t.includes('£1') || t.includes('one pound') || t.includes('1 pound')) return '£1';
  if (t.includes('50p') || t.includes('fifty pence') || t.includes('50 pence')) return '50p';
  if (t.includes('20p') || t.includes('twenty pence')) return '20p';
  if (t.includes('10p') || t.includes('ten pence') || t.includes('a-z')) return '10p';
  if (t.includes('5p') || t.includes('five pence')) return '5p';
  if (t.includes('2p') || t.includes('two pence')) return '2p';
  if (t.includes('1p') || t.includes('penny') || t.includes('one penny')) return '1p';
  return null;
}

/**
 * Guess year from text (prefer current/next year over old ones).
 */
function guessYear(text) {
  const currentYear = new Date().getFullYear();
  const matches = [...text.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1]));
  if (!matches.length) return String(currentYear);
  // Prefer years close to current
  matches.sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear));
  return String(matches[0]);
}

/**
 * Derive a 4-char uppercase code from a coin name.
 */
function makeCode(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).padEnd(4, 'X');
  return words.map(w => w[0]).join('').slice(0, 4).padEnd(4, words[0][1] || 'X');
}

/**
 * Build a variantCode from parts.
 */
function buildVariantCode(type, denom, year, name) {
  const d = denom.replace('£', 'P').replace('p', 'P');
  // Re-encode denom to match existing conventions: £2 → £2, 50p → 50P etc.
  const denomPart = denom.toUpperCase().replace('£', '£');
  const code = makeCode(name);
  return `UK-${type}-${denomPart}-${year}-${code}-`;
}

/**
 * Fetch Royal Mint new-coins page and extract coin listings.
 */
async function scrapeRoyalMint() {
  const coins = [];
  const urls = [
    'https://www.royalmint.com/new-coins/',
    'https://www.royalmint.com/shop/new/new-commemorative-coins/',
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!resp.ok) continue;
      const html = await resp.text();

      // Extract product tiles — Royal Mint uses structured markup
      // Match <h2> or <h3> or product card headings near year + denomination patterns
      const cardPattern = /<(?:h[23]|div)[^>]*class="[^"]*(?:product|coin|title|heading)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[23]|div)>/gi;
      let m;
      const seen = new Set();
      while ((m = cardPattern.exec(html)) !== null) {
        const text = stripTags(m[1]);
        if (text.length < 5 || text.length > 200) continue;
        const denom = guessDenomination(text);
        if (!denom) continue;
        const year = guessYear(text);
        const key = `${text}|${year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        coins.push({ name: text, denomination: denom, year, sourceUrl: url });
      }

      // Also try JSON-LD structured data
      const jsonLdPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
      while ((m = jsonLdPattern.exec(html)) !== null) {
        try {
          const data = JSON.parse(m[1]);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (!item.name) continue;
            const denom = guessDenomination(item.name + ' ' + (item.description || ''));
            if (!denom) continue;
            const year = guessYear(item.name + ' ' + (item.description || ''));
            const key = `${item.name}|${year}`;
            if (seen.has(key)) continue;
            seen.add(key);
            coins.push({
              name: stripTags(item.name).slice(0, 120),
              denomination: denom,
              year,
              imageUrl: item.image || '',
              sourceUrl: url,
              price: item.offers?.price ? String(item.offers.price) : '',
            });
          }
        } catch { /* skip malformed JSON-LD */ }
      }
    } catch { /* skip failed URLs */ }
  }
  return coins;
}

/**
 * Fetch Change Checker / Westminster Collection new releases.
 */
async function scrapeChangechecker() {
  const coins = [];
  try {
    const resp = await fetch('https://www.changechecker.org/category/blog-home/new-coins/', {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return coins;
    const html = await resp.text();

    // Extract article titles which typically name the coin and denomination
    const titlePattern = /<(?:h[123]|a)[^>]*class="[^"]*(?:entry|post|title)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[123]|a)>/gi;
    let m;
    const seen = new Set();
    while ((m = titlePattern.exec(html)) !== null) {
      const text = stripTags(m[1]);
      if (text.length < 10 || text.length > 200) continue;
      const denom = guessDenomination(text);
      if (!denom) continue;
      const year = guessYear(text);
      const key = `${text}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: text, denomination: denom, year, sourceUrl: 'https://www.changechecker.org/category/blog-home/new-coins/' });
    }
  } catch { /* skip */ }
  return coins;
}

/**
 * Fetch Westminster Collection new releases.
 */
async function scrapeWestminster() {
  const coins = [];
  try {
    const resp = await fetch('https://www.westminstercollection.com/change-checker/certified-bu-coins/', {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return coins;
    const html = await resp.text();

    const titlePattern = /<(?:h[123])[^>]*>([\s\S]*?)<\/h[123]>/gi;
    let m;
    const seen = new Set();
    while ((m = titlePattern.exec(html)) !== null) {
      const text = stripTags(m[1]);
      if (text.length < 10 || text.length > 200) continue;
      const denom = guessDenomination(text);
      if (!denom) continue;
      const year = guessYear(text);
      const key = `${text}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: text, denomination: denom, year, sourceUrl: 'https://www.westminstercollection.com/change-checker/certified-bu-coins/' });
    }
  } catch { /* skip */ }
  return coins;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyServiceKey(req) && !verifyOwnerToken(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    // Scrape all sources in parallel
    const [royalMintCoins, changeCheckerCoins, westminsterCoins] = await Promise.all([
      scrapeRoyalMint(),
      scrapeChangechecker(),
      scrapeWestminster(),
    ]);

    // Deduplicate by name+denomination+year
    const allScraped = [...royalMintCoins, ...changeCheckerCoins, ...westminsterCoins];
    const dedupedMap = new Map();
    for (const c of allScraped) {
      const key = `${c.denomination}|${c.year}|${c.name.toLowerCase()}`;
      if (!dedupedMap.has(key)) dedupedMap.set(key, c);
    }
    const candidates = [...dedupedMap.values()];

    if (!candidates.length) {
      return res.status(200).json({ staged: 0, skipped: 0, found: 0, message: 'No new coins found in sources' });
    }

    // Read existing Variants + inbox
    const token = await getAccessToken();
    const [variantsResp, inboxResp] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const existingCodes = new Set([
      ...((variantsResp.ok ? await variantsResp.json() : {}).values || []).slice(1).map(r => r[0]).filter(Boolean),
      ...((inboxResp.ok ? await inboxResp.json() : {}).values || []).slice(1).map(r => r[0]).filter(Boolean),
    ]);

    // Also read existing Variants names+year to avoid duplicates on name
    const variantNamesResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:F?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const existingNameYears = new Set();
    if (variantNamesResp.ok) {
      const vdata = await variantNamesResp.json();
      for (const row of (vdata.values || []).slice(1)) {
        const name = (row[1] || '').toLowerCase().trim();
        const year = (row[5] || '').trim();
        if (name && year) existingNameYears.add(`${name}|${year}`);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentYear = new Date().getFullYear();

    const newRows = [];
    for (const c of candidates) {
      // Skip if year seems too old (more than 2 years before current) — likely a scraping artefact
      const coinYear = parseInt(c.year);
      if (coinYear < currentYear - 2) continue;

      const monarch = coinYear >= 2023 ? 'King Charles III' : 'Queen Elizabeth II';
      const collection = 'Commemorative';
      const variantCode = buildVariantCode('COMM', c.denomination, c.year, c.name);

      if (existingCodes.has(variantCode)) continue;

      const nameYearKey = `${c.name.toLowerCase().trim()}|${c.year}`;
      if (existingNameYears.has(nameYearKey)) continue;

      newRows.push([
        variantCode,
        c.name.slice(0, 120),
        c.denomination,
        collection,
        monarch,
        c.year,
        c.imageUrl || '',
        c.sourceUrl || '',
        c.price || '',
        'FALSE',
        today,
      ]);
    }

    if (!newRows.length) {
      return res.status(200).json({ staged: 0, skipped: candidates.length, found: candidates.length, message: 'All found coins already in sheet or inbox' });
    }

    const appendResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: newRows }),
      }
    );
    if (!appendResp.ok) throw new Error('Append failed: ' + await appendResp.text());

    // Add checkbox validation to column J
    try {
      const appendData = await appendResp.json();
      const updatedRange = appendData.updates?.updatedRange || '';
      const match = updatedRange.match(/:?[A-Z]+(\d+):[A-Z]+(\d+)/);
      if (match) {
        const startRow = parseInt(match[1], 10);
        const endRow = parseInt(match[2], 10);
        const metaResp = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (metaResp.ok) {
          const meta = await metaResp.json();
          const inboxSheet = meta.sheets.find(s => s.properties.title === 'NewCoinsInbox');
          if (inboxSheet) {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requests: [{
                  setDataValidation: {
                    range: { sheetId: inboxSheet.properties.sheetId, startRowIndex: startRow - 1, endRowIndex: endRow, startColumnIndex: 9, endColumnIndex: 10 },
                    rule: { condition: { type: 'BOOLEAN' }, showCustomUi: true },
                  },
                }],
              }),
            });
          }
        }
      }
    } catch (_) { /* checkbox step is best-effort */ }

    return res.status(200).json({
      staged: newRows.length,
      skipped: candidates.length - newRows.length,
      found: candidates.length,
      stagedNames: newRows.map(r => `${r[2]} ${r[5]}: ${r[1]}`),
    });
  } catch (e) {
    console.error('weekly-new-coins error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
