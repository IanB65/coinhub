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

const HEADERS_HTML = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const HEADERS_RSS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CoinHubBot/1.0)',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

function extractText(html) {
  return html.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8211;/g, '–').replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function guessDenomination(text) {
  const t = text.toLowerCase();
  if (/£5(?!\d|,\d)/.test(t) || t.includes('five pound') || t.includes('5 pound')) return '£5';
  if (/£2(?!\d|,\d)/.test(t) || t.includes('two pound') || t.includes('2 pound') || t.includes('2-pound')) return '£2';
  if (/£1(?!\d|,\d)/.test(t) || t.includes('one pound') || t.includes('1 pound') || t.includes('1-pound')) return '£1';
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

// Extract a clean coin name from a Change Checker style title.
// Their titles are coin-focused, e.g.:
//   "New 50p Coin: The Prince's Trust"
//   "2026 £2 Coin – Mary Anning"
//   "50 Years of Aardman 50p Coin"
function cleanChangecheckerTitle(raw) {
  // Strip HTML entities and trim
  let t = raw.trim();

  // Skip non-release articles
  const SKIP = ['scarcity index', 'check your change', 'coin value', 'most wanted',
    'how to', 'top 10', 'round-up', 'infographic', 'competition', 'giveaway',
    'sell', 'sold', 'worth £', 'rarest', 'error coin', 'complete guide',
    'what we know', 'everything we know', 'all you need', 'things to know',
    'preview:', 'update:', 'round up', 'new design', 'designs revealed',
    'entering circulation', 'in circulation', 'check their change', 'urged to check'];
  const lower = t.toLowerCase();
  if (SKIP.some(p => lower.includes(p))) return null;

  // Skip if extracted name would start with an interrogative (article-style)
  if (/^(what|how|why|when|where|which|everything|all the|here's|find out)/i.test(t)) return null;

  // Pattern: "New [denom] Coin: [name]" or "New [denom]: [name]"
  let m = t.match(/^new\s+(?:50p|£\d|\d+p)\s*(?:coin)?\s*[:\–\-]\s*(.+)/i);
  if (m) return m[1].replace(/\s*\(.*\)$/, '').trim();

  // Pattern: "[year] [denom] [name] Coin"
  m = t.match(/^\d{4}\s+(?:50p|£\d|\d+p)\s+(.+?)\s+coin$/i);
  if (m) return m[1].trim();

  // Pattern: "[name] [denom] Coin" (product-style title)
  m = t.match(/^(.+?)\s+(?:50p|£\d|\d+p)\s+coin$/i);
  if (m) {
    const name = m[1].trim();
    if (name.length >= 3 && name.length <= 80) return name;
  }

  // Pattern: "[denom] [name]" at end: "50p: The Queen's Beasts"
  m = t.match(/^(?:50p|£\d|\d+p)[:\s–\-]+(.+)/i);
  if (m) return m[1].replace(/\s*coin\s*$/i, '').trim();

  // Has a colon — after-colon is the coin name
  if (t.includes(':')) {
    const after = t.split(':').slice(1).join(':').trim();
    const after2 = after.replace(/\s*coin\s*$/i, '').trim();
    if (after2.length >= 3 && after2.length <= 80 && !/\b(is|are|was|will|has)\b/i.test(after2)) {
      return after2;
    }
  }

  // Short clean title with no verb phrases — use as-is
  if (t.length <= 70 && !/\b(is|are|was|will|has|have|could|celebrating|announces?|launches?|unveils?)\b/i.test(t) && !/[?!]/.test(t)) {
    return t.replace(/\s*coin\s*$/i, '').trim() || null;
  }

  return null;
}

// ─── Scrapers ─────────────────────────────────────────────────────────────────

async function scrapeChangechecker() {
  const coins = [];
  const errors = [];
  const seen = new Set();
  const cutoffMs = Date.now() - 180 * 24 * 60 * 60 * 1000;

  // Change Checker RSS — WordPress, always accessible, coin-focused titles
  const rss = await safeFetch('https://www.changechecker.org/feed/', HEADERS_RSS, 15000);
  if (!rss.ok) {
    errors.push(`Change Checker RSS: HTTP ${rss.status}${rss.error ? ' ' + rss.error : ''}`);
    return { coins, errors, source: 'Change Checker' };
  }

  for (const [, itemXml] of rss.text.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    // Check pubDate within cutoff
    const pdMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/i);
    if (pdMatch) {
      const pd = new Date(pdMatch[1].trim()).getTime();
      if (!isNaN(pd) && pd < cutoffMs) continue;
    }

    const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
    if (!titleMatch) continue;
    const rawTitle = extractText(titleMatch[1] || titleMatch[2] || '');

    const denom = guessDenomination(rawTitle);
    if (!denom) continue;

    errors.push(`CC_TITLE: ${rawTitle}`);

    const cleanName = cleanChangecheckerTitle(rawTitle);
    if (!cleanName || cleanName.length < 3) continue;

    const linkMatch = itemXml.match(/<link>(https?:\/\/[^<]+)<\/link>/i);
    const sourceUrl = linkMatch ? linkMatch[1].trim() : 'https://www.changechecker.org/';

    const year = guessYear(rawTitle + ' ' + (pdMatch ? pdMatch[1] : ''));
    const key = `${cleanName.toLowerCase()}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);

    coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, imageUrl: '', sourceUrl });
  }

  return { coins, errors, source: 'Change Checker' };
}

async function scrapeWestminster() {
  const coins = [];
  const errors = [];
  const seen = new Set();
  const currentYear = new Date().getFullYear();

  // Westminster Collection — Royal Mint authorised retailer, lists actual coin products
  const URLS = [
    'https://www.westminstercollection.com/change-checker/certified-bu-coins/',
    'https://www.westminstercollection.com/coins/uk-coins/',
  ];

  for (const url of URLS) {
    const result = await safeFetch(url, HEADERS_HTML, 15000);
    if (!result.ok) {
      errors.push(`Westminster ${url}: HTTP ${result.status}${result.error ? ' ' + result.error : ''}`);
      continue;
    }

    // Extract product titles from h2/h3 elements (their product cards use these)
    for (const [, titleHtml] of result.text.matchAll(/<h[23][^>]*class="[^"]*(?:product|title)[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
      const raw = extractText(titleHtml);
      const denom = guessDenomination(raw);
      if (!denom) continue;
      const year = guessYear(raw);
      if (parseInt(year) < currentYear - 2) continue;
      // Strip denomination and year from name
      const name = raw
        .replace(/\b(50p|£\d|£\d+|\d+p)\b/gi, '')
        .replace(/\b20\d{2}\b/g, '')
        .replace(/\bcoin\b/gi, '')
        .replace(/\s+/g, ' ').trim();
      if (!name || name.length < 3) continue;
      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: name.slice(0, 120), denomination: denom, year, imageUrl: '', sourceUrl: url });
    }

    // Fallback: any heading containing a denomination
    if (!coins.length) {
      for (const [, headHtml] of result.text.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)) {
        const raw = extractText(headHtml);
        const denom = guessDenomination(raw);
        if (!denom) continue;
        const year = guessYear(raw);
        if (parseInt(year) < currentYear - 2) continue;
        const name = raw
          .replace(/\b(50p|£\d|£\d+|\d+p)\b/gi, '')
          .replace(/\b20\d{2}\b/g, '')
          .replace(/\bcoin\b/gi, '')
          .replace(/\s+/g, ' ').trim();
        if (!name || name.length < 3) continue;
        const key = `${name.toLowerCase()}|${year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        coins.push({ name: name.slice(0, 120), denomination: denom, year, imageUrl: '', sourceUrl: url });
      }
    }
  }

  return { coins, errors, source: 'Westminster Collection' };
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
    const [ccResult, wmResult] = await Promise.all([
      scrapeChangechecker(),
      scrapeWestminster(),
    ]);

    const sourceSummary = [ccResult, wmResult].map(r => ({
      source: r.source, found: r.coins.length, errors: r.errors,
    }));

    // Deduplicate across sources
    const dedupedMap = new Map();
    for (const c of [...ccResult.coins, ...wmResult.coins]) {
      const key = `${c.denomination}|${c.year}|${c.name.toLowerCase()}`;
      if (!dedupedMap.has(key)) dedupedMap.set(key, c);
    }
    const candidates = [...dedupedMap.values()];

    if (!candidates.length) {
      return res.status(200).json({ staged: 0, skipped: 0, found: 0, message: 'No new coins found', sources: sourceSummary });
    }

    const token = await getAccessToken();
    const [variantsResp, inboxResp] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const existingCodes = new Set([
      ...((variantsResp.ok ? await variantsResp.json() : {}).values || []).slice(1).map(r => r[0]).filter(Boolean),
      ...((inboxResp.ok ? await inboxResp.json() : {}).values || []).slice(1).map(r => r[0]).filter(Boolean),
    ]);

    const variantNamesResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:F?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const inboxNamesResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox!A:F?majorDimension=ROWS`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const existingNameYears = new Set();
    for (const resp of [variantNamesResp, inboxNamesResp]) {
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const row of (data.values || []).slice(1)) {
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
      const variantCode = buildVariantCode('D', c.denomination, c.year, c.name);

      if (existingCodes.has(variantCode)) continue;
      const nameYearKey = `${c.name.toLowerCase().trim()}|${c.year}`;
      if (existingNameYears.has(nameYearKey)) continue;

      newRows.push([
        variantCode, c.name.slice(0, 120), c.denomination, 'Commemorative', monarch, c.year,
        c.imageUrl || '', c.sourceUrl || '', '', 'FALSE', today,
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
