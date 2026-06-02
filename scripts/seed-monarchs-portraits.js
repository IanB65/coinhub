#!/usr/bin/env node
// One-off script: seeds portrait URLs into the Monarchs sheet tab.
// Run with: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=... GOOGLE_SHEET_ID=... node scripts/seed-monarchs-portraits.js

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const PORTRAITS = [
  ['King Charles III',   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/King_Charles_III_%28July_2023%29.jpg/500px-King_Charles_III_%28July_2023%29.jpg'],
  ['Queen Elizabeth II', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Queen_Elizabeth_II_on_her_Coronation_Day.jpg/500px-Queen_Elizabeth_II_on_her_Coronation_Day.jpg'],
  ['King George Vi',     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/King_George_VI_LOC_matpc.14736_A_%28cropped%29.jpg/500px-King_George_VI_LOC_matpc.14736_A_%28cropped%29.jpg'],
  ['King George V',      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/King_George_1923_LCCN2014715558_%28cropped%29.jpg/500px-King_George_1923_LCCN2014715558_%28cropped%29.jpg'],
  ['King George III',    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/King_George_III_of_England_by_Johann_Zoffany.jpg/500px-King_George_III_of_England_by_Johann_Zoffany.jpg'],
  ['King Edward VII',    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/King-Edward-VII_%28cropped%29_%28b%29.jpg/500px-King-Edward-VII_%28cropped%29_%28b%29.jpg'],
  ['Queen Victoria',     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Queen_Victoria_by_Bassano.jpg/500px-Queen_Victoria_by_Bassano.jpg'],
  ['King Edward VIII',   ''],
];

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

async function readTab(token, tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(tab)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Read failed: ${r.status} ${await r.text()}`);
  return (await r.json()).values || [];
}

async function writeRange(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  if (!r.ok) throw new Error(`Write failed: ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  if (!SHEET_ID) { console.error('GOOGLE_SHEET_ID not set'); process.exit(1); }

  const token = await getAccessToken();
  const rows = await readTab(token, 'Monarchs');

  console.log('Current Monarchs tab:');
  rows.forEach((r, i) => console.log(`  Row ${i}: ${JSON.stringify(r)}`));

  // Find header row to locate name/portraitUrl columns
  const headers = (rows[0] || []).map(h => h.trim().toLowerCase());
  const nameCol   = headers.indexOf('name');
  const portraitCol = headers.findIndex(h => h.includes('portrait') || h.includes('imageurl') || h.includes('image'));

  console.log(`\nHeader row: ${JSON.stringify(rows[0])}`);
  console.log(`name col: ${nameCol}, portrait col: ${portraitCol}`);

  if (nameCol === -1 || portraitCol === -1) {
    console.error('\nCould not find "name" and portrait columns in header row. Columns found:', headers);
    console.log('\nWill write from row 1 with headers: name | portraitUrl');

    // Write fresh with headers + data
    const values = [
      ['name', 'portraitUrl'],
      ...PORTRAITS,
    ];
    await writeRange(token, 'Monarchs!A1', values);
    console.log('Written', values.length, 'rows.');
    return;
  }

  // Build a map of existing rows by name
  const nameToRow = {};
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][nameCol]?.trim();
    if (name) nameToRow[name] = i;
  }

  // Update portraitUrl for each known monarch
  const colLetter = String.fromCharCode(65 + portraitCol);
  for (const [name, url] of PORTRAITS) {
    if (!url) continue;
    const rowIdx = nameToRow[name];
    if (rowIdx !== undefined) {
      const range = `Monarchs!${colLetter}${rowIdx + 1}`;
      await writeRange(token, range, [[url]]);
      console.log(`Updated ${name} → ${url}`);
    } else {
      // Append new row
      const newRow = new Array(Math.max(nameCol, portraitCol) + 1).fill('');
      newRow[nameCol] = name;
      newRow[portraitCol] = url;
      const nextRow = rows.length + 1;
      await writeRange(token, `Monarchs!A${nextRow}`, [newRow]);
      rows.push(newRow); // keep local count accurate
      console.log(`Appended ${name}`);
    }
  }

  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
