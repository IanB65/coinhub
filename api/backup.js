const crypto = require('crypto');

const ALL_TABS = [
  'Variants', 'Instances', 'Images',
  'Storage', 'Storage1', 'Storage2', 'Storage3',
  'Values', 'Conditions', 'PreservationTypes',
  'ChangeLog', 'NewCoinsInbox'
];

const CONFIG_TABS = ['Config'];

function verifyServiceKey(req) {
  const key = req.headers['x-service-key'] || '';
  const expected = process.env.COINHUB_SERVICE_KEY || '';
  if (!key || !expected || key.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  } catch { return false; }
}

async function fetchTab(sheetId, apiKey, tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?majorDimension=ROWS&key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheet "${tab}" fetch failed: ${r.status}`);
  const data = await r.json();
  const rows = data.values || [];
  const width = rows[0]?.length || 0;
  return rows.map(row => { while (row.length < width) row.push(''); return row; });
}

async function fetchOptional(sheetId, apiKey, tab) {
  try { return await fetchTab(sheetId, apiKey, tab); } catch { return []; }
}

module.exports = async function handler(req, res) {
  if (!verifyServiceKey(req)) return res.status(401).json({ error: 'Unauthorised' });

  const apiKey = process.env.GOOGLE_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!apiKey || !sheetId) return res.status(500).json({ error: 'Missing env vars' });

  try {
    const tabsToFetch = [...ALL_TABS, ...CONFIG_TABS];
    const results = await Promise.all(tabsToFetch.map(t => fetchOptional(sheetId, apiKey, t)));

    const byName = {};
    tabsToFetch.forEach((name, i) => { byName[name] = results[i]; });

    const sheetsData = {};
    ALL_TABS.forEach(name => { sheetsData[name] = byName[name]; });

    const configData = {};
    CONFIG_TABS.forEach(name => { configData[name] = byName[name]; });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      sheetsData,
      configData
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
