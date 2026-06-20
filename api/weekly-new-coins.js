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

// Phrases that indicate an article/editorial, not an actual coin name
const ARTICLE_SKIP = [
  'what we know', 'trading card', 'scarcity index', 'coin values', 'most valuable',
  'most wanted', 'how to', 'everything you need', 'find out', 'poll result',
  'new design', 'new release', 'coming soon', 'collector alert', 'collectors guide',
  'infographic', 'video', 'podcast', 'competition', 'win a', 'giveaway',
  'change checker', 'update:', 'updates:', 'preview:', 'round-up', 'round up',
  'designs released', 'new designs', 'have you got', 'do you have',
  'top 10', 'top ten', 'complete guide', 'full list',
  // price / rarity / archive articles
  'selling for', 'sold for', 'worth £', 'worth more', 'face value',
  'check your change', 'check their change', 'urged to check',
  'rarest', 'rare coin', 'error coin', 'print error', 'mistakenly',
  'in circulation', 'entering circulation', 'enters circulation',
  'no new', 'not be made', 'signs deal', 'expands into',
  'how much is', 'how to spot', 'what to look for',
];

/**
 * Attempt to derive a clean coin name from a raw title (which may be an article headline).
 * Returns null if the title looks like an editorial rather than a coin product name.
 */
function cleanCoinName(raw) {
  const lower = raw.toLowerCase();

  // Skip obvious non-coin articles
  if (ARTICLE_SKIP.some(p => lower.includes(p))) return null;

  // Skip if it looks like a sentence / article (verb phrases, question marks, etc.)
  if (/[?!]/.test(raw)) return null;

  // Suffixes in the after-colon part that indicate article language — strip them to get coin name
  const ARTICLE_SUFFIX = /\s+(honoured|celebrated|celebrates?|features?|featured|launched|unveiled|released|revealed|announced|coming|arrives?|to be minted|on new|on the new)\b.*/i;

  if (raw.includes(':')) {
    const [before, ...rest] = raw.split(':');
    const afterRaw = rest.join(':').trim();

    // Try stripping article suffixes from the after-colon part to get a clean coin name
    const afterClean = afterRaw.replace(ARTICLE_SUFFIX, '').replace(/\s+(on\s+new|new\s+uk|uk\s+coin)\b.*/i, '').trim();
    if (afterClean.length >= 3 && afterClean.length <= 60
        && !ARTICLE_SKIP.some(p => afterClean.toLowerCase().includes(p))
        && !/\b(is|are|was|were|has|will|could)\b/i.test(afterClean)) {
      return afterClean;
    }

    // Fall back to before-colon if it's short and clean
    const beforeClean = before.trim();
    if (beforeClean.length >= 5 && beforeClean.length <= 70
        && !ARTICLE_SKIP.some(p => beforeClean.toLowerCase().includes(p))
        && !/\b(is|are|was|were|has|will|could|should|might|reveals?|launches?|celebrates?|honours?|honoured|features?|featured)\b/i.test(beforeClean)) {
      return beforeClean;
    }

    return null;
  }

  // No colon — skip if it looks like a sentence
  if (/\b(is|are|was|were|has|have|will|could|should|might|reveals?|launches?|introduces?|celebrates?|honours?|honoured|features?|featured)\b/i.test(raw)) return null;

  // Skip if excessively long (likely a sentence)
  if (raw.length > 100) return null;

  return raw;
}

function guessDenomination(text) {
  // Use word-boundary checks so "£2,000" or "£500" don't match £2/£5
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

// ─── Scrapers ─────────────────────────────────────────────────────────────────

// Convert a Royal Mint product URL slug into a readable coin name.
// Strips denomination, year, finish words and capitalises correctly.
function slugToName(slug, denom, year) {
  const SKIP = new Set([
    'uk', 'coin', 'coins',
    'brilliant', 'uncirculated', 'bu',
    'silver', 'gold', 'platinum', 'proof', 'colour', 'coloured', 'piedfort',
    'seven', 'six', 'five', 'four', 'three', 'two', 'collection', 'set',
    '50', '2', '5', '1', '10', '20', 'pence', 'penny', 'pound', 'pounds',
  ]);
  const LOWERCASE = new Set(['of', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'and', 'or']);
  const ROMAN = { 'Ii': 'II', 'Iii': 'III', 'Iv': 'IV', 'Vi': 'VI', 'Vii': 'VII', 'Viii': 'VIII' };

  const words = slug
    .split('-')
    .filter(w => w && w !== year && !SKIP.has(w.toLowerCase()) && !/^\d+$/.test(w));

  if (!words.length) return '';

  return words.map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && LOWERCASE.has(lower)) return lower;
    const titled = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    return ROMAN[titled] || titled;
  }).join(' ').trim();
}

// Scrape the Royal Mint XML sitemap — always static, no JS rendering needed.
// Product URL slugs encode name, denomination and year, e.g.
//   /shop/limited-editions/the-lord-of-the-rings/the-one-ring/
//     the-lord-of-the-rings-2026-50p-brilliant-uncirculated-coin/
async function scrapeRoyalMintSitemap() {
  const coins = [];
  const errors = [];
  const seen = new Set();
  const cutoffMs = Date.now() - 45 * 24 * 60 * 60 * 1000; // 45 days
  const currentYear = new Date().getFullYear();

  const idxResult = await safeFetch('https://www.royalmint.com/sitemap_index.xml', HEADERS_FEED, 15000);
  if (!idxResult.ok) {
    errors.push(`Royal Mint sitemap index: HTTP ${idxResult.status}${idxResult.error ? ' ' + idxResult.error : ''}`);
    return { coins, errors, source: 'Royal Mint (sitemap)' };
  }

  const allChildSitemaps = [...idxResult.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim());
  const shopSitemaps = allChildSitemaps.filter(u => /shop|product|coin/i.test(u));
  const toFetch = (shopSitemaps.length ? shopSitemaps : allChildSitemaps).slice(0, 10);

  for (const smUrl of toFetch) {
    const smResult = await safeFetch(smUrl, HEADERS_FEED, 20000);
    if (!smResult.ok) {
      errors.push(`Royal Mint sitemap ${smUrl}: HTTP ${smResult.status}`);
      continue;
    }

    for (const [, entry] of smResult.text.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const locMatch = entry.match(/<loc>(https?:\/\/www\.royalmint\.com(\/shop\/[^<]+))<\/loc>/i);
      if (!locMatch) continue;
      const fullUrl = locMatch[1];
      const path = locMatch[2];

      // Only individual product pages — skip category/collection/listing pages
      if (!path.match(/\/shop\/(limited-editions|commemorative|coins|bullion|gifts)\//i)) continue;
      if (path.includes('/collection/') || path.includes('/all-coins')) continue;
      const depth = path.replace(/\/$/, '').split('/').length;
      if (depth < 4) continue;

      // Skip if lastmod is older than cutoff
      const lastmodMatch = entry.match(/<lastmod>([^<]+)<\/lastmod>/i);
      if (lastmodMatch) {
        const lastmod = new Date(lastmodMatch[1].trim()).getTime();
        if (!isNaN(lastmod) && lastmod < cutoffMs) continue;
      }

      const slug = path.replace(/\/$/, '').split('/').pop();
      const denom = guessDenomination(slug.replace(/-/g, ' '));
      if (!denom) continue;

      const year = guessYear(slug.replace(/-/g, ' '));
      if (parseInt(year) < currentYear - 1) continue;

      const name = slugToName(slug, denom, year);
      if (!name || name.length < 4) continue;

      const key = `${name.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);

      coins.push({ name: name.slice(0, 120), denomination: denom, year, imageUrl: '', sourceUrl: fullUrl });
    }
  }

  return { coins, errors, source: 'Royal Mint (sitemap)' };
}

async function scrapeGoogleNews() {
  // Google News RSS — indexed within hours of a new Royal Mint release.
  // Parse <item> blocks individually so we can filter by pubDate and skip
  // price/rarity/archive articles that aren't new-release announcements.
  const coins = [];
  const errors = [];
  const seen = new Set();
  const cutoffMs = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days

  // Article phrases that signal a price/rarity/archive story, NOT a new release
  const SKIP_PHRASES = [
    'selling for', 'sold for', 'on sale for', 'worth £', 'worth more', 'worth over', 'worth up to',
    'check your change', 'check their change', 'urged to check', 'urges brits',
    'rarest', 'rare coin', 'error coin', 'print error', 'mistakenly created',
    'entering circulation', 'enters circulation', 'in circulation', 'entered circulation',
    'no new', 'not be made', 'signs deal', 'expands into', 'us market',
    'times face value', 'face value', 'most valuable', 'most wanted', 'scarcity',
    'how much', 'how to spot', 'what to look for',
  ];
  // Title must contain at least one of these to be considered a new-release article
  const ANNOUNCE_WORDS = [
    'unveil', 'release', 'launch', 'new 50p', 'new £', 'new coin',
    'commemorat', 'mark ', 'celebrat', 'honour', 'announced', 'first look',
    'forge', 'newly minted', 'creat', 'struck', 'revealed', 'designed',
  ];

  const queries = [
    'royal+mint+new+50p+coin+UK+2026',
    'royal+mint+new+%C2%A32+coin+UK+2026',
    'royal+mint+commemorative+coin+2026',
  ];

  for (const q of queries) {
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`;
    const { ok, status, text, error } = await safeFetch(url, HEADERS_FEED, 12000);
    if (!ok) { errors.push(`Google News: HTTP ${status}${error ? ' ' + error : ''}`); continue; }

    // Parse individual <item> blocks (skip the <channel> title which is the search query)
    for (const [, itemXml] of text.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
      if (!titleMatch) continue;
      const rawTitle = extractText(titleMatch[1] || titleMatch[2] || '');

      const lower = rawTitle.toLowerCase();
      if (SKIP_PHRASES.some(p => lower.includes(p))) continue;
      if (!ANNOUNCE_WORDS.some(p => lower.includes(p))) continue;

      // Filter by pubDate — skip articles older than 60 days
      const pubDateMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/i);
      let pubMs = Date.now();
      if (pubDateMatch) {
        const pd = new Date(pubDateMatch[1].trim()).getTime();
        if (!isNaN(pd)) pubMs = pd;
      }
      if (pubMs < cutoffMs) continue;

      const denom = guessDenomination(rawTitle);
      if (!denom) continue;

      const cleanName = cleanCoinName(rawTitle);
      if (!cleanName) continue;

      // Prefer explicit year in title; fall back to pubDate year (not current year)
      const year = rawTitle.match(/\b(20\d{2})\b/)
        ? guessYear(rawTitle)
        : String(new Date(pubMs).getFullYear());

      const key = `${cleanName.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);

      coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.royalmint.com/' });
    }
  }

  return { coins, errors, source: 'Google News' };
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
      const rawName = extractText(m[1] || m[2] || '');
      const denom = guessDenomination(rawName);
      if (!denom) continue;
      const cleanName = cleanCoinName(rawName);
      if (!cleanName) continue;
      const year = guessYear(rawName);
      const key = `${cleanName.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.changechecker.org/' });
    }
  } else {
    errors.push(`Change Checker RSS: HTTP ${rssResult.status}${rssResult.error ? ' ' + rssResult.error : ''}`);
  }

  // Also try their new coins category page
  const pageResult = await safeFetch('https://www.changechecker.org/category/blog-home/new-coins/', HEADERS_BROWSER);
  if (pageResult.ok && pageResult.text) {
    let m;
    const headingPattern = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
    while ((m = headingPattern.exec(pageResult.text)) !== null) {
      const rawName = extractText(m[1]);
      const denom = guessDenomination(rawName);
      if (!denom) continue;
      const cleanName = cleanCoinName(rawName);
      if (!cleanName) continue;
      const year = guessYear(rawName);
      const key = `${cleanName.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.changechecker.org/category/blog-home/new-coins/' });
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
      const rawName = extractText(m[1]);
      const denom = guessDenomination(rawName);
      if (!denom) continue;
      const cleanName = cleanCoinName(rawName);
      if (!cleanName) continue;
      const year = guessYear(rawName);
      const key = `${cleanName.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, sourceUrl: url });
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
      const rawName = extractText(m[1] || m[2] || '');
      const lower = rawName.toLowerCase();
      if (!lower.includes('uk') && !lower.includes('british') && !lower.includes('royal mint')) continue;
      const denom = guessDenomination(rawName);
      if (!denom) continue;
      const cleanName = cleanCoinName(rawName);
      if (!cleanName) continue;
      const year = guessYear(rawName);
      const key = `${cleanName.toLowerCase()}|${year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.coinnews.net/' });
    }
    return { coins, errors, source: 'Coin News' };
  }

  let m;
  const headingPattern = /<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi;
  while ((m = headingPattern.exec(text)) !== null) {
    const rawName = extractText(m[1]);
    const denom = guessDenomination(rawName);
    if (!denom) continue;
    const cleanName = cleanCoinName(rawName);
    if (!cleanName) continue;
    const year = guessYear(rawName);
    const key = `${cleanName.toLowerCase()}|${year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    coins.push({ name: cleanName.slice(0, 120), denomination: denom, year, sourceUrl: 'https://www.coinnews.net/category/british-coins/' });
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
    const [gnResult, ccResult, wmResult, cnResult] = await Promise.all([
      scrapeGoogleNews(),
      scrapeChangechecker(),
      scrapeWestminster(),
      scrapeCoinNewsUK(),
    ]);

    const sourceSummary = [gnResult, ccResult, wmResult, cnResult].map(r => ({
      source: r.source,
      found: r.coins.length,
      errors: r.errors,
    }));

    // Deduplicate across sources
    const allScraped = [...gnResult.coins, ...ccResult.coins, ...wmResult.coins, ...cnResult.coins];
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

    // Read name+year combos already in Variants AND inbox to catch same coin with different names
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
      const collection = 'Commemorative';
      const variantCode = buildVariantCode('D', c.denomination, c.year, c.name);

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
