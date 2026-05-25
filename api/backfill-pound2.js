const crypto = require('crypto');

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
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

const QE2 = 'Queen Elizabeth II';
const KC3 = 'King Charles III';
const COMM = 'Commemorative';
const DEFS = 'Definitives';

const MASTER_LIST = [
  // Pre-1997 single-metal commemoratives
  { variantCode: 'UK-COMM-£2-1986-CG86-', name: 'XIII Commonwealth Games Edinburgh',            denomination: '£2', collection: COMM, monarch: QE2, year: '1986' },
  { variantCode: 'UK-COMM-£2-1989-BLRT-', name: 'Bill of Rights 300th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '1989' },
  { variantCode: 'UK-COMM-£2-1989-CLRT-', name: 'Claim of Right 300th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '1989' },
  { variantCode: 'UK-COMM-£2-1994-BKOE-', name: 'Bank of England 300th Anniversary',           denomination: '£2', collection: COMM, monarch: QE2, year: '1994' },
  { variantCode: 'UK-COMM-£2-1995-WW50-', name: 'WWII 50th Anniversary',                       denomination: '£2', collection: COMM, monarch: QE2, year: '1995' },
  { variantCode: 'UK-COMM-£2-1995-UN50-', name: 'United Nations 50th Anniversary',             denomination: '£2', collection: COMM, monarch: QE2, year: '1995' },
  { variantCode: 'UK-COMM-£2-1996-EUR6-', name: 'European Football Championship Euro 96',      denomination: '£2', collection: COMM, monarch: QE2, year: '1996' },

  // Definitives — Technology design (1997–2015)
  ...['1997','1998','1999','2000','2001','2002','2003','2004','2005',
      '2006','2007','2008','2009','2010','2011','2012','2013','2014','2015']
    .map(year => ({ variantCode: `UK-D-£2-${year}-TECH-`, name: 'Technology Advances',
      denomination: '£2', collection: DEFS, monarch: QE2, year })),

  // Definitives — Britannia design (2015–2022)
  ...['2015','2016','2017','2018','2019','2020','2021','2022']
    .map(year => ({ variantCode: `UK-D-£2-${year}-BRIT-`, name: 'Britannia',
      denomination: '£2', collection: DEFS, monarch: QE2, year })),

  // Definitives — National Flowers design (2023+, Charles III)
  ...['2023','2024','2025','2026']
    .map(year => ({ variantCode: `UK-D-£2-${year}-FLOR-`, name: 'National Flowers',
      denomination: '£2', collection: DEFS, monarch: KC3, year })),

  // Bimetallic commemoratives
  { variantCode: 'UK-COMM-£2-1999-RWCU-', name: 'Rugby World Cup',                                       denomination: '£2', collection: COMM, monarch: QE2, year: '1999' },
  { variantCode: 'UK-COMM-£2-2001-MARC-', name: 'Marconi Transatlantic Wireless 100th Anniversary',      denomination: '£2', collection: COMM, monarch: QE2, year: '2001' },
  { variantCode: 'UK-COMM-£2-2002-CGME-', name: 'Commonwealth Games Manchester — England',               denomination: '£2', collection: COMM, monarch: QE2, year: '2002' },
  { variantCode: 'UK-COMM-£2-2002-CGMW-', name: 'Commonwealth Games Manchester — Wales',                 denomination: '£2', collection: COMM, monarch: QE2, year: '2002' },
  { variantCode: 'UK-COMM-£2-2002-CGMS-', name: 'Commonwealth Games Manchester — Scotland',              denomination: '£2', collection: COMM, monarch: QE2, year: '2002' },
  { variantCode: 'UK-COMM-£2-2002-CGMN-', name: 'Commonwealth Games Manchester — Northern Ireland',      denomination: '£2', collection: COMM, monarch: QE2, year: '2002' },
  { variantCode: 'UK-COMM-£2-2003-DNA1-', name: 'Discovery of DNA 50th Anniversary',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2003' },
  { variantCode: 'UK-COMM-£2-2004-TREV-', name: "Trevithick's Steam Locomotive 200th Anniversary",       denomination: '£2', collection: COMM, monarch: QE2, year: '2004' },
  { variantCode: 'UK-COMM-£2-2005-WW60-', name: 'WWII 60th Anniversary',                                 denomination: '£2', collection: COMM, monarch: QE2, year: '2005' },
  { variantCode: 'UK-COMM-£2-2005-GUNP-', name: 'Gunpowder Plot 400th Anniversary',                      denomination: '£2', collection: COMM, monarch: QE2, year: '2005' },
  { variantCode: 'UK-COMM-£2-2006-BRNP-', name: 'Isambard Kingdom Brunel — Portrait',                    denomination: '£2', collection: COMM, monarch: QE2, year: '2006' },
  { variantCode: 'UK-COMM-£2-2006-BRNS-', name: 'Isambard Kingdom Brunel — Paddington Station',          denomination: '£2', collection: COMM, monarch: QE2, year: '2006' },
  { variantCode: 'UK-COMM-£2-2007-ACTU-', name: 'Act of Union 300th Anniversary',                        denomination: '£2', collection: COMM, monarch: QE2, year: '2007' },
  { variantCode: 'UK-COMM-£2-2007-ABST-', name: 'Abolition of the Slave Trade 200th Anniversary',        denomination: '£2', collection: COMM, monarch: QE2, year: '2007' },
  { variantCode: 'UK-COMM-£2-2008-OLHN-', name: 'Olympic Games Handover Beijing to London',              denomination: '£2', collection: COMM, monarch: QE2, year: '2008' },
  { variantCode: 'UK-COMM-£2-2009-BURN-', name: 'Robert Burns 250th Anniversary',                        denomination: '£2', collection: COMM, monarch: QE2, year: '2009' },
  { variantCode: 'UK-COMM-£2-2009-DARW-', name: 'Charles Darwin 200th Anniversary',                      denomination: '£2', collection: COMM, monarch: QE2, year: '2009' },
  { variantCode: 'UK-COMM-£2-2010-NGHT-', name: 'Florence Nightingale 100th Death Anniversary',          denomination: '£2', collection: COMM, monarch: QE2, year: '2010' },
  { variantCode: 'UK-COMM-£2-2011-KJBI-', name: 'King James Bible 400th Anniversary',                    denomination: '£2', collection: COMM, monarch: QE2, year: '2011' },
  { variantCode: 'UK-COMM-£2-2011-MARY-', name: 'Mary Rose 500th Anniversary',                           denomination: '£2', collection: COMM, monarch: QE2, year: '2011' },
  { variantCode: 'UK-COMM-£2-2012-DICK-', name: 'Charles Dickens 200th Birth Anniversary',               denomination: '£2', collection: COMM, monarch: QE2, year: '2012' },
  { variantCode: 'UK-COMM-£2-2012-OLHR-', name: 'Olympic Games Handover London to Rio',                  denomination: '£2', collection: COMM, monarch: QE2, year: '2012' },
  { variantCode: 'UK-COMM-£2-2013-UGTK-', name: 'London Underground 150th Anniversary — Train',          denomination: '£2', collection: COMM, monarch: QE2, year: '2013' },
  { variantCode: 'UK-COMM-£2-2013-UGRD-', name: 'London Underground 150th Anniversary — Roundel',        denomination: '£2', collection: COMM, monarch: QE2, year: '2013' },
  { variantCode: 'UK-COMM-£2-2013-GUIN-', name: 'Guinea 350th Anniversary',                              denomination: '£2', collection: COMM, monarch: QE2, year: '2013' },
  { variantCode: 'UK-COMM-£2-2014-WWIO-', name: 'First World War Outbreak 100th Anniversary',            denomination: '£2', collection: COMM, monarch: QE2, year: '2014' },
  { variantCode: 'UK-COMM-£2-2014-TRHS-', name: 'Trinity House 500th Anniversary',                       denomination: '£2', collection: COMM, monarch: QE2, year: '2014' },
  { variantCode: 'UK-COMM-£2-2015-MAGN-', name: 'Magna Carta 800th Anniversary',                         denomination: '£2', collection: COMM, monarch: QE2, year: '2015' },
  { variantCode: 'UK-COMM-£2-2015-RNVY-', name: 'WWI Centenary — Royal Navy',                            denomination: '£2', collection: COMM, monarch: QE2, year: '2015' },
  { variantCode: 'UK-COMM-£2-2016-SHKT-', name: 'Shakespeare 400th Anniversary — Tragedies',             denomination: '£2', collection: COMM, monarch: QE2, year: '2016' },
  { variantCode: 'UK-COMM-£2-2016-SHKC-', name: 'Shakespeare 400th Anniversary — Comedies',              denomination: '£2', collection: COMM, monarch: QE2, year: '2016' },
  { variantCode: 'UK-COMM-£2-2016-SHKH-', name: 'Shakespeare 400th Anniversary — Histories',             denomination: '£2', collection: COMM, monarch: QE2, year: '2016' },
  { variantCode: 'UK-COMM-£2-2016-ARMY-', name: 'WWI Centenary — The Army',                              denomination: '£2', collection: COMM, monarch: QE2, year: '2016' },
  { variantCode: 'UK-COMM-£2-2016-GFIR-', name: 'Great Fire of London 350th Anniversary',                denomination: '£2', collection: COMM, monarch: QE2, year: '2016' },
  { variantCode: 'UK-COMM-£2-2017-AUST-', name: 'Jane Austen 200th Death Anniversary',                   denomination: '£2', collection: COMM, monarch: QE2, year: '2017' },
  { variantCode: 'UK-COMM-£2-2017-WAVI-', name: 'WWI Centenary — Aviation',                              denomination: '£2', collection: COMM, monarch: QE2, year: '2017' },
  { variantCode: 'UK-COMM-£2-2018-RAF1-', name: 'Royal Air Force 100th Anniversary',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2018' },
  { variantCode: 'UK-COMM-£2-2018-ARMI-', name: 'WWI Armistice 100th Anniversary',                       denomination: '£2', collection: COMM, monarch: QE2, year: '2018' },
  { variantCode: 'UK-COMM-£2-2018-MSFR-', name: "Mary Shelley's Frankenstein 200th Anniversary",         denomination: '£2', collection: COMM, monarch: QE2, year: '2018' },
  { variantCode: 'UK-COMM-£2-2019-DDAY-', name: 'D-Day 75th Anniversary',                                denomination: '£2', collection: COMM, monarch: QE2, year: '2019' },
  { variantCode: 'UK-COMM-£2-2019-WEDG-', name: 'Josiah Wedgwood 260th Anniversary',                     denomination: '£2', collection: COMM, monarch: QE2, year: '2019' },
  { variantCode: 'UK-COMM-£2-2019-PEPY-', name: 'Samuel Pepys Diary 350th Anniversary',                  denomination: '£2', collection: COMM, monarch: QE2, year: '2019' },
  { variantCode: 'UK-COMM-£2-2020-AGAT-', name: 'Agatha Christie 100 Years of Mystery',                  denomination: '£2', collection: COMM, monarch: QE2, year: '2020' },
  { variantCode: 'UK-COMM-£2-2020-VEDA-', name: 'VE Day 75th Anniversary',                               denomination: '£2', collection: COMM, monarch: QE2, year: '2020' },
  { variantCode: 'UK-COMM-£2-2020-MAYF-', name: 'Mayflower 400th Anniversary',                           denomination: '£2', collection: COMM, monarch: QE2, year: '2020' },
  { variantCode: 'UK-COMM-£2-2021-HGWL-', name: 'H.G. Wells 75th Death Anniversary',                    denomination: '£2', collection: COMM, monarch: QE2, year: '2021' },
  { variantCode: 'UK-COMM-£2-2021-WSCO-', name: 'Sir Walter Scott 250th Birth Anniversary',              denomination: '£2', collection: COMM, monarch: QE2, year: '2021' },
  { variantCode: 'UK-COMM-£2-2022-VERL-', name: 'Dame Vera Lynn',                                        denomination: '£2', collection: COMM, monarch: QE2, year: '2022' },
  { variantCode: 'UK-COMM-£2-2022-BELL-', name: 'Alexander Graham Bell',                                 denomination: '£2', collection: COMM, monarch: QE2, year: '2022' },
  { variantCode: 'UK-COMM-£2-2022-25YR-', name: '25th Anniversary of the £2 Coin',                      denomination: '£2', collection: COMM, monarch: QE2, year: '2022' },
  { variantCode: 'UK-COMM-£2-2022-FACP-', name: 'FA Cup 150th Anniversary',                              denomination: '£2', collection: COMM, monarch: QE2, year: '2022' },
  { variantCode: 'UK-COMM-£2-2023-FSCO-', name: 'Flying Scotsman Centenary',                             denomination: '£2', collection: COMM, monarch: KC3, year: '2023' },
  { variantCode: 'UK-COMM-£2-2023-TOLK-', name: 'JRR Tolkien — Writer, Poet, Scholar',                   denomination: '£2', collection: COMM, monarch: KC3, year: '2023' },
  { variantCode: 'UK-COMM-£2-2024-CHRC-', name: 'Winston Churchill 150th Birth Anniversary',             denomination: '£2', collection: COMM, monarch: KC3, year: '2024' },
  { variantCode: 'UK-COMM-£2-2024-NTLG-', name: 'National Gallery 200th Anniversary',                    denomination: '£2', collection: COMM, monarch: KC3, year: '2024' },
  { variantCode: 'UK-COMM-£2-2025-ORWL-', name: 'George Orwell 75th Death Anniversary',                  denomination: '£2', collection: COMM, monarch: KC3, year: '2025' },
  { variantCode: 'UK-COMM-£2-2025-MDRW-', name: '200 Years of the Modern Railway',                       denomination: '£2', collection: COMM, monarch: KC3, year: '2025' },
  { variantCode: 'UK-COMM-£2-2025-ROBS-', name: 'Royal Observatory Greenwich 350th Anniversary',         denomination: '£2', collection: COMM, monarch: KC3, year: '2025' },
  { variantCode: 'UK-COMM-£2-2026-ZSLL-', name: '200 Years of ZSL — Zoological Society of London',      denomination: '£2', collection: COMM, monarch: KC3, year: '2026' },
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!verifyServiceKey(req)) return res.status(401).json({ error: 'Unauthorised' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !sheetId) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const token = await getAccessToken();

    // Read existing Variants + inbox to deduplicate
    const [variantsResp, inboxResp] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Variants!A:A?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/NewCoinsInbox?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const variantsData = variantsResp.ok ? await variantsResp.json() : { values: [] };
    const inboxData = inboxResp.ok ? await inboxResp.json() : { values: [] };
    const existingCodes = new Set([
      ...(variantsData.values || []).slice(1).map(r => r[0]).filter(Boolean),
      ...(inboxData.values || []).slice(1).map(r => r[0]).filter(Boolean),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const newRows = MASTER_LIST
      .filter(c => !existingCodes.has(c.variantCode))
      .map(c => [
        c.variantCode,
        c.name,
        c.denomination,
        c.collection,
        c.monarch,
        c.year,
        '', // imageUrl
        '', // sourceUrl
        '', // price
        'FALSE',
        today,
      ]);

    if (!newRows.length) {
      return res.status(200).json({ staged: 0, skipped: MASTER_LIST.length, message: 'All £2 variants already present' });
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

    // Add checkbox validation to column J of new rows
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
      skipped: MASTER_LIST.length - newRows.length,
      stagedCodes: newRows.map(r => r[0]),
    });
  } catch (e) {
    console.error('backfill-pound2 error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
