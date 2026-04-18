const TABS = ['Variants', 'Instances', 'Images'];

module.exports = async function handler(req, res) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!apiKey || !sheetId) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY or GOOGLE_SHEET_ID env var not set' });
  }

  try {
    const results = await Promise.all(TABS.map(async tab => {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}?majorDimension=ROWS&key=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Sheet "${tab}" fetch failed: ${r.status}`);
      const data = await r.json();
      const rows = data.values || [];
      const width = rows[0]?.length || 0;
      return rows.map(r => {
        while (r.length < width) r.push('');
        return r;
      });
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      variants: results[0],
      instances: results[1],
      images: results[2],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
