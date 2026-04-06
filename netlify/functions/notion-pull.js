exports.handler = async (event) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const since = event.queryStringParameters?.since || null;

  const config = {
    db_instance: process.env.NOTION_DB_INSTANCE || '1a605769-e1ee-80d2-b868-000b80373e62',
    db_variant:  process.env.NOTION_DB_VARIANT  || '1bf05769-e1ee-81c7-81dc-000b9d014020',
  };

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

  const getPropStr = (prop) => {
    if (!prop) return '';
    const t = prop.type;
    if (t === 'rich_text') return prop.rich_text.map(r => r.plain_text).join('');
    if (t === 'title')     return prop.title.map(r => r.plain_text).join('');
    if (t === 'select')    return prop.select?.name || '';
    if (t === 'formula')   return prop.formula?.string || String(prop.formula?.number ?? '');
    if (t === 'date')      return prop.date?.start || '';
    if (t === 'relation')  return prop.relation?.[0]?.id || '';
    if (t === 'number')    return prop.number != null ? String(prop.number) : '';
    return '';
  };

  const nameCache = {};
  const resolveName = async (pageId) => {
    if (!pageId) return '';
    if (nameCache[pageId] !== undefined) return nameCache[pageId];
    try {
      const p = await notionReq('GET', `/pages/${pageId}`);
      nameCache[pageId] = p.properties?.Name?.title?.map(t => t.plain_text).join('') || '';
    } catch { nameCache[pageId] = ''; }
    return nameCache[pageId];
  };

  const vcCache = {};
  const resolveVariantCode = async (pageId) => {
    if (!pageId) return '';
    const key = 'vc:' + pageId;
    if (vcCache[key] !== undefined) return vcCache[key];
    try {
      const p = await notionReq('GET', `/pages/${pageId}`);
      vcCache[key] = p.properties?.ID?.title?.map(t => t.plain_text).join('') || '';
    } catch { vcCache[key] = ''; }
    return vcCache[key];
  };

  try {
    const bodyQ = { page_size: 100 };
    if (since) {
      bodyQ.filter = { timestamp: 'last_edited_time', last_edited_time: { after: since } };
    }

    const pages = [];
    let cursor = null;
    while (true) {
      const q = { ...bodyQ };
      if (cursor) q.start_cursor = cursor;
      const result = await notionReq('POST', `/databases/${config.db_instance}/query`, q);
      pages.push(...(result.results || []));
      if (!result.has_more) break;
      cursor = result.next_cursor;
    }

    const instances = await Promise.all(pages.map(async (page) => {
      const props = page.properties || {};
      const formulaId = getPropStr(props.Number);
      if (!formulaId) return null;

      const variantPageId = getPropStr(props['Coin Variant']);
      const variantCode   = await resolveVariantCode(variantPageId);

      const rel = async (key) => resolveName(getPropStr(props[key] || {}));

      return {
        id: formulaId,
        variantCode,
        cond:  await rel('Condition'),
        s1:    await rel('Storage 1'),
        s2:    await rel('Storage 2'),
        s3:    await rel('Storage 3'),
        notes: props.Notes?.rich_text?.map(r => r.plain_text).join('') || '',
        ptype: await rel('Preservation Type'),
        lastStocktake: getPropStr(props['Last Stocktake']),
        lastEdited: page.last_edited_time,
      };
    }));

    const pulledAt = new Date().toISOString();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: instances.filter(Boolean), pulledAt }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
