#!/usr/bin/env node
/**
 * rename-lotr-variants.js
 *
 * Renames the 3 LOTR variant codes from UK-COMM-50P-2026-LOT{B,C,S}-
 * to UK-D-50P-2026-LOT{B,C,S}- in both the Variants and Instances tabs.
 *
 * Usage:
 *   node scripts/rename-lotr-variants.js [--dry-run]
 *
 * Env vars required:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEET_ID
 */

const DRY_RUN = process.argv.includes('--dry-run');

const RENAMES = [
  { from: 'UK-COMM-50P-2026-LOTB-', to: 'UK-D-50P-2026-LOTB-' },
  { from: 'UK-COMM-50P-2026-LOTC-', to: 'UK-D-50P-2026-LOTC-' },
  { from: 'UK-COMM-50P-2026-LOTS-', to: 'UK-D-50P-2026-LOTS-' },
];

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
  if (!process.env.GOOGLE_CLIENT_ID || !sheetId) {
    console.error('Required env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEET_ID');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Dry run — renames that would be applied:');
    RENAMES.forEach(r => console.log(`  ${r.from}  →  ${r.to}`));
    return;
  }

  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

  // ── Read Variants col A ────────────────────────────────────────────────────
  const varResp = await fetch(`${base}/values/Variants!A:A`, { headers });
  if (!varResp.ok) throw new Error('Read Variants failed: ' + await varResp.text());
  const varRows = (await varResp.json()).values || [];

  // ── Read Instances col A+B ─────────────────────────────────────────────────
  const insResp = await fetch(`${base}/values/Instances!A:B`, { headers });
  if (!insResp.ok) throw new Error('Read Instances failed: ' + await insResp.text());
  const insRows = (await insResp.json()).values || [];

  const updates = [];

  for (const { from, to } of RENAMES) {
    // Variants tab — column A
    const vIdx = varRows.findIndex((r, i) => i > 0 && r[0]?.trim() === from);
    if (vIdx === -1) {
      console.warn(`  WARN: ${from} not found in Variants tab — skipping`);
      continue;
    }
    const vRow = vIdx + 1; // 1-based
    updates.push({ range: `Variants!A${vRow}`, values: [[to]] });
    console.log(`  Variants row ${vRow}: ${from}  →  ${to}`);

    // Instances tab — column B (variantCode)
    for (let i = 1; i < insRows.length; i++) {
      if (insRows[i][1]?.trim() === from) {
        const iRow = i + 1;
        updates.push({ range: `Instances!B${iRow}`, values: [[to]] });
        console.log(`  Instances row ${iRow} (${insRows[i][0]}): ${from}  →  ${to}`);
      }
    }
  }

  if (updates.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  const batchResp = await fetch(`${base}/values:batchUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
  });
  if (!batchResp.ok) throw new Error('Batch update failed: ' + await batchResp.text());

  console.log(`Done. ${updates.length} cell(s) updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
