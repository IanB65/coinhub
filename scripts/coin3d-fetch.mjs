// Bulk image sourcing for the 3D coin viewer (runs on GitHub Actions).
//
// Reads the Variants tab of the Google Sheet (link-readable, no auth) via the
// gviz CSV endpoint, audits column H (imageUrl) for the selected collection,
// downloads the images into assets/coin3d/_inbox/ (the gitignored staging
// space consumed by scripts/coin3d-prepare.mjs), and writes a Markdown audit
// report to GITHUB_STEP_SUMMARY (stdout when unset).
//
// Configuration via env vars (spaces-safe for workflow inputs):
//   COLLECTION     collection name as in the sheet; empty/unset = sweep mode
//                  (all collections of the given denomination)
//   DENOMINATION   default '50p'
//   DRY_RUN        '1'/'true' = audit only, no image downloads
//   FORCE          '1'/'true' = re-fetch variants that already have a texture
//   CSV_FILE       read this local CSV instead of fetching the sheet (tests)
//   SHEET_ID       override the spreadsheet ID
//
// Exit code 0 even with partial download failures — the audit lists them and
// successes still flow into processing. Exits 1 only on structural problems
// (sheet unreadable, no rows match the filter).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEET_ID = process.env.SHEET_ID || '1rPiMIFhA0lPLGvPVgQKO6ZXu63QTsGFlPIE0P4OS2y4';
const INBOX = path.join(ROOT, 'assets/coin3d/_inbox');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const truthy = v => /^(1|true|yes)$/i.test(v || '');

// Column indexes in the Variants tab (A=0 … H=7)
const COL = { variantCode: 0, name: 1, denomination: 2, collection: 3, monarch: 4, year: 5, status: 6, imageUrl: 7 };

export async function fetchVariantsCsv() {
  if (process.env.CSV_FILE) return fs.readFileSync(path.resolve(ROOT, process.env.CSV_FILE), 'utf8');
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Variants&headers=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('Sheet returned HTML — is it still shared "anyone with link can view", and is the tab named "Variants"?');
  return text;
}

// Minimal RFC-4180 parser. gviz quotes every field, doubles embedded quotes,
// and fields may contain commas or newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(f => f.trim()));
}

// Returns data rows (header stripped) with their 1-based sheet row numbers.
export function filterRows(rows, collection, denomination) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.toLowerCase());
  if (!header.some(h => h.includes('variantcode') || h.includes('variant code'))) {
    throw new Error(`Unexpected header row: ${rows[0].join(', ')} — expected the Variants tab with variantCode in column A`);
  }
  const want = (collection || '').trim().toLowerCase();
  const denom = (denomination || '50p').trim().toLowerCase();
  return rows.slice(1)
    .map((r, i) => ({ row: r, sheetRow: i + 2 }))
    .filter(({ row }) => row[COL.variantCode])
    .filter(({ row }) => (row[COL.denomination] || '').trim().toLowerCase() === denom)
    .filter(({ row }) => !want || (row[COL.collection] || '').trim().toLowerCase() === want);
}

const MAGIC = [
  { ext: 'png', test: b => b[0] === 0x89 && b[1] === 0x50 },
  { ext: 'jpg', test: b => b[0] === 0xFF && b[1] === 0xD8 },
  { ext: 'gif', test: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { ext: 'webp', test: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 },
  { ext: 'avif', test: b => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 }
];
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  const m = MAGIC.find(m => m.test(buf));
  return m ? m.ext : null;
}

export function obverseKeyForYear(year) {
  return Number(year) >= 2023 ? 'kc3-obv' : 'qe2-obv';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadOne(url, destStem) {
  let res;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8', 'Referer': new URL(url).origin + '/' }, redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
  } catch (e) {
    return { outcome: e.name === 'AbortError' ? 'timeout' : 'error', detail: e.message };
  }
  if (!res.ok) return { outcome: `http-${res.status}` };
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = sniffImage(buf);
  if (!ext) return { outcome: 'not-an-image', detail: (res.headers.get('content-type') || '?') };
  if (buf.length < 5 * 1024) return { outcome: 'too-small', detail: `${buf.length}B` };
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(path.join(INBOX, `${destStem}.${ext}`), buf);
  return { outcome: 'downloaded', detail: `${Math.round(buf.length / 1024)}KB ${ext}` };
}

export async function auditAndDownload(entries, { dryRun, force } = {}) {
  const results = [];
  const lastHostHit = {};
  for (const { row, sheetRow } of entries) {
    const vc = row[COL.variantCode];
    const url = row[COL.imageUrl];
    const rec = { vc, name: row[COL.name], year: row[COL.year], sheetRow, url, host: '' };
    try { rec.host = url ? new URL(url).host : ''; } catch (e) { rec.host = '(bad url)'; }
    const hasTexture = fs.existsSync(path.join(ROOT, 'assets/coin3d', vc, 'reverse.webp'));
    if (!url) rec.outcome = 'no-url';
    else if (hasTexture && !force) rec.outcome = 'skipped-existing';
    else if (dryRun) rec.outcome = 'has-url';
    else {
      const wait = 1500 - (Date.now() - (lastHostHit[rec.host] || 0));
      if (wait > 0) await sleep(wait);
      lastHostHit[rec.host] = Date.now();
      Object.assign(rec, await downloadOne(url, vc));
      lastHostHit[rec.host] = Date.now();
    }
    results.push(rec);
    console.log(`  ${rec.outcome.padEnd(16)} ${vc}  ${rec.detail || ''}`);
  }
  return results;
}

// Shared obverse textures: make sure each monarch era used by this batch has
// one, downloading from scripts/coin3d-sources/shared-obverses.json if a URL
// has been filled in there.
export async function ensureSharedObverses(entries, { dryRun } = {}) {
  const needed = [...new Set(entries.map(({ row }) => obverseKeyForYear(row[COL.year])))];
  let urls = {};
  try { urls = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/coin3d-sources/shared-obverses.json'), 'utf8')); } catch (e) {}
  const warnings = [];
  for (const key of needed) {
    const have = fs.existsSync(path.join(ROOT, 'assets/coin3d/_shared', `${key}.webp`))
      || (key === 'kc3-obv' && fs.existsSync(path.join(ROOT, 'assets/coin3d/_shared/obverse-kc3-50p.png')))
      || fs.existsSync(path.join(INBOX, `${key}.png`)) || fs.existsSync(path.join(INBOX, `${key}.jpg`)) || fs.existsSync(path.join(INBOX, `${key}.webp`));
    if (have) continue;
    if (urls[key] && !dryRun) {
      const r = await downloadOne(urls[key], key);
      if (r.outcome === 'downloaded') { console.log(`  downloaded shared obverse ${key} (${r.detail})`); continue; }
      warnings.push(`Shared obverse **${key}** download failed (${r.outcome}) from ${urls[key]}`);
    } else {
      warnings.push(`Shared obverse **${key}** texture is missing — these coins will show a placeholder heads side. Fill its URL in \`scripts/coin3d-sources/shared-obverses.json\` or drop an image named \`${key}.png\` into \`assets/coin3d/_inbox/\`.`);
    }
  }
  return warnings;
}

export function buildSummary({ collection, denomination, dryRun, force }, results, warnings) {
  const count = o => results.filter(r => r.outcome === o).length;
  const lines = [];
  lines.push(`## Coin3D image audit — ${collection || 'ALL collections (sweep)'} / ${denomination}`);
  lines.push('');
  if (dryRun) lines.push('**Dry run** — column H audited, nothing downloaded.');
  if (force) lines.push('**Force** — existing textures re-fetched.');
  lines.push(`${results.length} variants matched · downloaded ${count('downloaded')} · already done ${count('skipped-existing')} · no URL ${count('no-url')} · failed ${results.filter(r => /^(http-|not-an-image|too-small|timeout|error)/.test(r.outcome)).length}`);
  lines.push('');
  for (const w of warnings) lines.push(`> ⚠️ ${w}`);
  if (warnings.length) lines.push('');
  const hosts = {};
  results.filter(r => r.host).forEach(r => {
    hosts[r.host] = hosts[r.host] || { ok: 0, bad: 0, other: 0 };
    if (r.outcome === 'downloaded' || r.outcome === 'has-url' || r.outcome === 'skipped-existing') hosts[r.host].ok++;
    else if (r.outcome === 'no-url') hosts[r.host].other++;
    else hosts[r.host].bad++;
  });
  lines.push('### Image sources (column H hosts)');
  lines.push('| Host | OK | Failed |');
  lines.push('|------|----|--------|');
  Object.keys(hosts).sort().forEach(h => lines.push(`| ${h} | ${hosts[h].ok} | ${hosts[h].bad} |`));
  lines.push('');
  lines.push('### Per-variant outcomes');
  lines.push('| Variant | Name | Sheet row | Host | Outcome |');
  lines.push('|---------|------|-----------|------|---------|');
  results.forEach(r => lines.push(`| ${r.vc} | ${r.name} | ${r.sheetRow} | ${r.host || '—'} | ${r.outcome}${r.detail ? ' (' + r.detail + ')' : ''} |`));
  const fixes = results.filter(r => r.outcome === 'no-url' || /^(http-|not-an-image|too-small|timeout|error)/.test(r.outcome));
  if (fixes.length) {
    lines.push('');
    lines.push('### Needs fixing in the sheet (Variants tab, column H)');
    fixes.forEach(r => lines.push(`- **Row ${r.sheetRow}** — ${r.name} (\`${r.vc}\`): ${r.outcome === 'no-url' ? 'no imageUrl' : `URL failed (${r.outcome})`}`));
    lines.push('');
    lines.push('Fix the URLs and re-run this workflow (or wait for the weekly sweep) — already-processed coins are skipped automatically.');
  }
  return lines.join('\n');
}

async function main() {
  const collection = (process.env.COLLECTION || '').trim();
  const denomination = (process.env.DENOMINATION || '50p').trim();
  const dryRun = truthy(process.env.DRY_RUN);
  const force = truthy(process.env.FORCE);

  console.log(`Coin3D fetch: collection=${collection || '(sweep: all)'} denomination=${denomination} dryRun=${dryRun} force=${force}`);
  const csv = await fetchVariantsCsv();
  const rows = parseCsv(csv);
  const entries = filterRows(rows, collection, denomination);
  if (!entries.length) {
    console.error(`No variants match collection="${collection}" denomination="${denomination}" — check the spelling against the sheet.`);
    process.exit(1);
  }
  console.log(`${entries.length} variants matched.`);

  const results = await auditAndDownload(entries, { dryRun, force });
  const warnings = await ensureSharedObverses(entries.filter((e, i) => results[i].outcome === 'downloaded' || results[i].outcome === 'skipped-existing' || results[i].outcome === 'has-url'), { dryRun });

  const summary = buildSummary({ collection, denomination, dryRun, force }, results, warnings);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  else console.log('\n' + summary);

  if (process.env.GITHUB_OUTPUT) {
    const out = [
      `downloaded=${results.filter(r => r.outcome === 'downloaded').length}`,
      `failed=${results.filter(r => /^(http-|not-an-image|too-small|timeout|error)/.test(r.outcome)).length}`,
      `skipped=${results.filter(r => r.outcome === 'skipped-existing').length}`,
      `nourl=${results.filter(r => r.outcome === 'no-url').length}`
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, out.join('\n') + '\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
