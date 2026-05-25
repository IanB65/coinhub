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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEADERS_BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Cache-Control': 'no-cache',
};

const HEADERS_FEED = {
  'User-Agent': 'CoinHub-Scanner/1.0 (coin collection tracker)',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

function extractText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function guessDenomination(text) {
  const t = text.toLowerCase();
  if (t.includes('£5') || t.includes('five pound') || t.includes('5 pound')) return '£5';
  if (t.includes('£2') || t.includes('two pound') || t.includes('2 pound') || t.includes('2-pound')) return '£2';
  if (t.includes('£1') || t.includes('one pound') || t.includes('1 pound') || t.includes('1-pound')) return '£1';
  if (t.includes('50p') || t.includes('fifty pence') || t.includes('50 pence') || t.includes('50-pence')) return '50p';
  if (t.includes('20p') || t.includes('twenty pence')) return '20p';
  if (t.includes('10p') || t.includes('ten pence') || t.includes('a-z')) return '10p';
  if (t.includes('5p') || t.includes('five pence')) return '5p';
  if (t.includes('2p') || t.includes('two pence')) return '2p';
  if (t.includes('1p') || t.includes('penny') || t.includes('one penny')) return '1p';
  return null;
}

function guessYear(text) {
  const currentYear = new Date().getFullYear();
  const matches = [...text.matchAll(/\b(20\d{2})\b/g)].map(m => parseInt(m[1]));
  if (!matches.length) return String(currentYear);
  matches.sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear));
  return String(matches[0]);
}

function makeCode(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).padEnd(4, 'X');
  return words.map(w => w[0]).join('').slice(0, 4).padEnd(4, words[0][1] || 'X');
}

function buildVariantCode(type, denom, year, name) {
  const denomPart = denom.toUpperCase().replace('£', '£');
  return `UK-${type}-${denomPart}-${year}-${makeCode(name)}-`;
}

async function safeFetch(url, headers, timeoutMs = 12000) {
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return { ok: resp.ok, status: resp.status, text: resp.ok ? await resp.text() : null };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// ─── Scrapers ─────────────────────────────────────────────────────────────────

async function scrapeRoyalMint() {
  const coins = [];
  const errors = [];
  const seen = new Set();

  // Try the press centre — these are news articles, less aggressively blocked
  const pressUrls = [
    'https://www.royalmint.com/aboutus/press-centre/',
    'https://www.royalmint.com/new-coins/',
    'https://www.royalmint.com/our-coins/',
  ];

  for (const url of pressUrls) {
    const { ok, status, text, error } = await safeFetch(url, HEADERS_BROWSER);
    if (!ok) { errors.push(`Royal Mint ${url}: HTTP ${status}${error ? ' ' + error : ''}`); continue; }

    // Try JSON-LD structured data first (most reliable when present)
    const jsonLdPattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = jsonLdPattern.exec(text)) !== null) {
      try {
        const data = JSON.parse(m[1]);
        const items = Array.isArray(data) ? data.flat() : [data];
        for (const item of items) {
          const raw = item['@graph'] ? item['@graph'] : [item];
          for (const node of raw) {
            const name = node.name || '';
            if (!name || name.length < 5 || name.length > 150) continue;
            const combined = name + ' ' + (node.description || '');
            const denom = guessDenomination(combined);
            if (!denom) continue;
            const year = guessYear(combined);
            const key = `${name.toLowerCase()}|${year}`;
            if (seen.has(key)) continue;
            seen.add(key);
            coins.push({ name: extractText(name).slice(0, 120), denomination: denom, year, imageUrl: node.image || '', sourceUrl: url, price: node.offers?.price ? String(node.offers.price) : '' });
          }
        }
      } catch { /* skip malformed */ }
    }

    // Parse product/article link text (title attributes, heading text, anchor text)
    const linkPattern = /<a[^>]+href="([^"]*(?:coin|collect|royal-mint)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = linkPattern.exec(text)) !== null) {
      const name = extractText(m[2]);
      if (name.length < 8 || name.length > 150) continue;
      const denom = guessDenomination(name);
      if (!denom) continue;
      const year = guessYear(name);
      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: url });
    }

    // Headings
    const headingPattern = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
    while ((m = headingPattern.exec(text)) !== null) {
      const name = extractText(m[1]);
      if (name.length < 8 || name.length > 150) continue;
      const denom = guessDenomination(name);
      if (!denom) continue;
      const year = guessYear(name);
      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: url });
    }
  }

  return { coins, errors, source: 'Royal Mint' };
}

async function scrapeChangechecker() {
  const coins = [];
  const errors = [];
  const seen = new Set();

  // Try RSS feed first — WordPress standard, usually accessible
  const rssResult = await safeFetch('https://www.changechecker.org/feed/', HEADERS_FEED);
  if (rssResult.ok && rssResult.text) {
    const titlePattern = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/gi;
    let m;
    while ((m = titlePattern.exec(rssResult.text)) !== null) {
      const name = extractText(m[1] || m[2] || '');
      if (name.length < 8 || name.length > 200) continue;
      const denom = guessDenomination(name);
      if (!denom) continue;
      const year = guessYear(name);
      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.changechecker.org/' });
    }
  } else {
    errors.push(`Change Checker RSS: HTTP ${rssResult.status}${rssResult.error ? ' ' + rssResult.error : ''}`);
  }

  // Also try their new coins category page
  const pageResult = await safeFetch('https://www.changechecker.org/category/blog-home/new-coins/', HEADERS_BROWSER);
  if (pageResult.ok && pageResult.text) {
    const patterns = [
      /<h[123][^>]*class="[^"]*(?:entry|post|article)[^"]*"[^>]*>([\s\S]*?)<\/h[123]>/gi,
      /<(?:h[123]|a)[^>]*class="[^"]*(?:title|heading)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[123]|a)>/gi,
      /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi,
    ];
    let m;
    for (const pat of patterns) {
      pat.lastIndex = 0;
      while ((m = pat.exec(pageResult.text)) !== null) {
        const name = extractText(m[1]);
        if (name.length < 8 || name.length > 200) continue;
        const denom = guessDenomination(name);
        if (!denom) continue;
        const year = guessYear(name);
        const key = `${name.toLowerCase()}|${year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.changechecker.org/category/blog-home/new-coins/' });
      }
    }
  } else {
    errors.push(`Change Checker page: HTTP ${pageResult.status}${pageResult.error ? ' ' + pageResult.error : ''}`);
  }

  return { coins, errors, source: 'Change Checker' };
}

async function scrapeWestminster() {
  const coins = [];
  const errors = [];
  const seen = new Set();

  // Try Westminster Collection blog
  const urls = [
    'https://www.westminstercollection.com/change-checker/certified-bu-coins/',
    'https://www.westminstercollection.com/blog/',
  ];

  for (const url of urls) {
    const { ok, status, text, error } = await safeFetch(url, HEADERS_BROWSER);
    if (!ok) { errors.push(`Westminster ${url}: HTTP ${status}${error ? ' ' + error : ''}`); continue; }
    let m;
    const headingPattern = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
    while ((m = headingPattern.exec(text)) !== null) {
      const name = extractText(m[1]);
      if (name.length < 8 || name.length > 200) continue;
      const denom = guessDenomination(name);
      if (!denom) continue;
      const year = guessYear(name);
      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: url });
    }
  }

  return { coins, errors, source: 'Westminster Collection' };
}

async function scrapeCoinNewsUK() {
  // coinnews.co.uk — trade publication, typically accessible
  const coins = [];
  const errors = [];
  const seen = new Set();

  const { ok, status, text, error } = await safeFetch('https://www.coinnews.net/category/british-coins/', HEADERS_BROWSER);
  if (!ok) {
    // Try RSS
    const rss = await safeFetch('https://www.coinnews.net/feed/', HEADERS_FEED);
    if (!rss.ok) { errors.push(`Coin News: HTTP ${status}${error ? ' ' + error : ''}`); return { coins, errors, source: 'Coin News' }; }
    const titlePattern = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/gi;
    let m;
    while ((m = titlePattern.exec(rss.text)) !== null) {
      const name = extractText(m[1] || m[2] || '');
      if (name.length < 8 || name.length > 200) continue;
      if (!name.toLowerCase().includes('uk') && !name.toLowerCase().includes('british') && !name.toLowerCase().includes('royal mint')) continue;
      const denom = guessDenomination(name);
      if (!denom) continue;
      const year = guessYear(name);
      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.coinnews.net/' });
    }
    return { coins, errors, source: 'Coin News' };
  }

  let m;
  const headingPattern = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
  while ((m = headingPattern.exec(text)) !== null) {
    const name = extractText(m[1]);
    if (name.length < 8 || name.length > 200) continue;
    const denom = guessDenomination(name);
    if (!denom) continue;
    const year = guessYear(name);
    const key = `${name.toLowerCase()}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    coins.push({ name: name.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.coinnews.net/category/british-coins/' });
  }

  return { coins, errors, source: 'Coin News' };
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
    const [rmResult, ccResult, wmResult, cnResult] = await Promise.all([
      scrapeRoyalMint(),
      scrapeChangechecker(),
      scrapeWestminster(),
      scrapeCoinNewsUK(),
    ]);

    const sourceSummary = [rmResult, ccResult, wmResult, cnResult].map(r => ({
      source: r.source,
      found: r.coins.length,
      errors: r.errors,
    }));

    // Deduplicate across sources
    const allScraped = [...rmResult.coins, ...ccResult.coins, ...wmResult.coins, ...cnResult.coins];
    const dedupedMap = new Map();
    for (const c of allScraped) {
      const key = `${c.denomination}|${c.year}|${c.name.toLowerCase()}`;
      if (!dedupedMap.has(key)) dedupedMap.set(key, c);
    }
    const candidates = [...dedupedMap.values()];

    if (!candidates.length) {
      return res.status(200).json({ staged: 0, skipped: 0, found: 0, message: 'No new coins found in sources', sources: sourceSummary });
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

    // Read name+year combos already in sheet
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
      const coinYear = parseInt(c.year);
      if (coinYear < currentYear - 2) continue;

      const monarch = coinYear >= 2023 ? 'King Charles III' : 'Queen Elizabeth II';
      const collection = 'Commemorative';
      const variantCode = buildVariantCode('COMM', c.denomination, c.year, c.name);

      if (existingCodes.has(variantCode)) continue;
      const nameYearKey = `${c.name.toLowerCase().trim()}|${c.year}`;
      if (existingNameYears.has(nameYearKey)) continue;

      newRows.push([
        variantCode, c.name.slice(0, 120), c.denomination, collection, monarch, c.year,
        c.imageUrl || '', c.sourceUrl || '', c.price || '', 'FALSE', today,
      ]);
    }

    if (!newRows.length) {
      return res.status(200).json({ staged: 0, skipped: candidates.length, found: candidates.length, message: 'All found coins already in sheet or inbox', sources: sourceSummary });
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
        const metaResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } });
        if (metaResp.ok) {
          const meta = await metaResp.json();
          const inboxSheet = meta.sheets.find(s => s.properties.title === 'NewCoinsInbox');
          if (inboxSheet) {
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ requests: [{ setDataValidation: { range: { sheetId: inboxSheet.properties.sheetId, startRowIndex: startRow - 1, endRowIndex: endRow, startColumnIndex: 9, endColumnIndex: 10 }, rule: { condition: { type: 'BOOLEAN' }, showCustomUi: true } } }] }),
            });
          }
        }
      }
    } catch (_) { /* best-effort */ }

    return res.status(200).json({
      staged: newRows.length,
      skipped: candidates.length - newRows.length,
      found: candidates.length,
      stagedNames: newRows.map(r => `${r[2]} ${r[5]}: ${r[1]}`),
      sources: sourceSummary,
    });
  } catch (e) {
    console.error('weekly-new-coins error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
