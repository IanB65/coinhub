exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const db_instance = process.env.NOTION_DB_INSTANCE || '1a605769-e1ee-80d2-b868-000b80373e62';

  const notionReq = async (method, path, body) => {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  let checks;
  try {
    checks = JSON.parse(event.body).checks || {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    // Fetch all instance pages to build formula_id → pageId map
    const pages = [];
    let cursor = null;
    while (true) {
      const q = { page_size: 100 };
      if (cursor) q.start_cursor = cursor;
      const result = await notionReq('POST', `/databases/${db_instance}/query`, q);
      pages.push(...(result.results || []));
      if (!result.has_more) break;
      cursor = result.next_cursor;
    }

    const idMap = {};
    pages.forEach(page => {
      const props = page.properties || {};
      const numProp = props.Number;
      let fid = '';
      if (numProp?.type === 'formula') {
        fid = numProp.formula?.string || String(numProp.formula?.number ?? '');
      }
      if (fid) {
        const currentLS = props['Last Stocktake']?.date?.start || '';
        idMap[fid] = { pageId: page.id, current: currentLS };
      }
    });

    let updated = 0, skipped = 0;
    const errors = [];

    await Promise.all(
      Object.entries(checks).map(async ([iid, dateStr]) => {
        const entry = idMap[iid];
        if (!entry) { skipped++; return; }
        if (entry.current === dateStr) { skipped++; return; }
        try {
          await notionReq('PATCH', `/pages/${entry.pageId}`, {
            properties: { 'Last Stocktake': { date: { start: dateStr } } },
          });
          updated++;
        } catch (e) {
          errors.push(`${iid}: ${e.message}`);
        }
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updated, skipped, errors }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
