#!/usr/bin/env node
/**
 * set-lotr-notes.js
 *
 * Sets the notes field on the three Lord of the Rings 50p variants.
 * Run AFTER the coins have been approved into the Variants sheet.
 *
 * Usage:
 *   node scripts/set-lotr-notes.js
 *
 * Env vars required (same as the API):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEET_ID
 */

const NOTES = {
  'UK-COMM-50P-2026-LOTB-': 'First in a 7-coin collection marking 25 years of the LotR film trilogy. Fellowship of the Ring coins released 2026, Two Towers 2027, Return of the King 2028. Features the One Ring with caustic technology revealing the Eye of Sauron.',
  'UK-COMM-50P-2026-LOTC-': 'Limited edition of 20,000. First in a 7-coin collection marking 25 years of the LotR film trilogy. Fellowship of the Ring coins released 2026, Two Towers 2027, Return of the King 2028.',
  'UK-COMM-50P-2026-LOTS-': 'Limited edition of 7,500. .925 sterling silver with colour printing. First in a 7-coin collection marking 25 years of the LotR film trilogy. Fellowship of the Ring coins released 2026, Two Towers 2027, Return of the King 2028.',
};

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

async function main() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    console.error('Missing env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEET_ID');
    process.exit(1);
  }

  const token = await getAccessToken();

  // Read all variant codes from column A
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error('Sheet read failed: ' + await resp.text());
  const { values } = await resp.json();

  let updated = 0;
  for (const [code, notes] of Object.entries(NOTES)) {
    const rowIndex = (values || []).findIndex((r, i) => i > 0 && r[0]?.trim() === code);
    if (rowIndex === -1) {
      console.log(`  SKIP  ${code} — not found in Variants (not approved yet?)`);
      continue;
    }
    const sheetRow = rowIndex + 1; // 1-based
    const writeResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!I${sheetRow}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[notes]] }),
      }
    );
    if (!writeResp.ok) throw new Error(`Write failed for ${code}: ` + await writeResp.text());
    console.log(`  OK    ${code}`);
    updated++;
  }

  console.log(`\nDone. Updated notes on ${updated} of ${Object.keys(NOTES).length} variants.`);
  if (updated < Object.keys(NOTES).length) {
    console.log('Re-run after approving remaining coins from the inbox.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
