#!/usr/bin/env node
/**
 * fix-threepence-monarchs.js
 *
 * Fixes incorrect monarch and notes fields on pre-decimal threepence variants.
 *
 * Problems corrected:
 *   - UK-PD-THRE-1902- to UK-PD-THRE-1910-  → monarch: King Edward VII
 *   - UK-PD-THRE-1911- to UK-PD-THRE-1936-  → monarch: King George V
 *   - Notes field updated to match corrected monarch in each case
 *
 * Usage:
 *   node scripts/fix-threepence-monarchs.js [--dry-run]
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEET_ID
 */

const DRY_RUN = process.argv.includes('--dry-run');

// Maps year → correct monarch
function correctMonarch(year) {
  if (year >= 1902 && year <= 1910) return 'King Edward VII';
  if (year >= 1911 && year <= 1936) return 'King George V';
  return null; // no fix needed
}

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

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    console.error('Missing env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEET_ID');
    process.exit(1);
  }

  console.log(DRY_RUN ? '--- DRY RUN ---' : '--- LIVE RUN ---');

  const token = await getAccessToken();

  // Read full Variants tab
  const readResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!readResp.ok) throw new Error('Sheet read failed: ' + await readResp.text());
  const { values } = await readResp.json();

  const today = new Date().toISOString().slice(0, 10);
  const updates = []; // { range, values }
  let fixed = 0, skipped = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const variantCode = row[0]?.trim() ?? '';

    // Only process UK-PD-THRE- variants
    const match = variantCode.match(/^UK-PD-THRE-(\d{4})-$/);
    if (!match) continue;

    const year = parseInt(match[1], 10);
    const monarch = correctMonarch(year);
    if (!monarch) { skipped++; continue; }

    const currentMonarch = row[4]?.trim() ?? '';
    if (currentMonarch === monarch) {
      console.log(`  SKIP ${variantCode} — monarch already correct (${monarch})`);
      skipped++;
      continue;
    }

    const sheetRow = i + 1; // 1-based
    const newNotes = `A pre-decimal silver threepence from ${year}, struck during the reign of ${monarch}.`;

    console.log(`  FIX  ${variantCode}  "${currentMonarch}" → "${monarch}"`);

    updates.push(
      { range: `Variants!E${sheetRow}`, values: [[monarch]] },
      { range: `Variants!I${sheetRow}`, values: [[newNotes]] },
      { range: `Variants!K${sheetRow}`, values: [[today]] },
    );
    fixed++;
  }

  console.log(`\nFound ${fixed} variant(s) to fix, ${skipped} skipped.`);

  if (fixed === 0) { console.log('Nothing to do.'); return; }
  if (DRY_RUN) { console.log('Dry run — no changes written.'); return; }

  // Batch write all updates
  const batchResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
    }
  );
  if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

  console.log(`\nDone — ${fixed} variant(s) updated.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
