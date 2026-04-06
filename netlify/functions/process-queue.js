// Handles: POST /api/process-queue and POST /api/save-audit-log
// Uses Netlify Blobs for persistent queue storage

exports.handler = async (event) => {
  const path = event.path.replace(/^\/api\//, '').replace(/^\.netlify\/functions\/[^/]+\/?/, '');
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const dbs = {
    variant:           process.env.NOTION_DB_VARIANT   || '1bf05769-e1ee-81c7-81dc-000b9d014020',
    instance:          process.env.NOTION_DB_INSTANCE  || '1a605769-e1ee-80d2-b868-000b80373e62',
    storage_container: process.env.NOTION_DB_S1        || '',
    storage_page:      process.env.NOTION_DB_S2        || '',
    storage_slot:      process.env.NOTION_DB_S3        || '',
    condition:         process.env.NOTION_DB_COND      || '1d805769-e1ee-80f2-b71b-000b9932007f',
    ptype:             process.env.NOTION_DB_PTYPE     || '1d905769-e1ee-804e-8473-000b2f0e2f2f',
  };

  const notionReq = async (method, npath, body) => {
    const res = await fetch(`https://api.notion.com/v1${npath}`, {
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

  const lookupPage = async (dbId, name) => {
    if (!name || !dbId) return null;
    try {
      const r = await notionReq('POST', `/databases/${dbId}/query`, {
        filter: { property: 'Name', title: { equals: name } }
      });
      return r.results?.[0]?.id || null;
    } catch { return null; }
  };

  // ── SAVE AUDIT LOG ────────────────────────────────────────────────────────
  if (path === 'save-audit-log') {
    // Just acknowledge — in serverless we can't write to disk
    // The audit log lives in the user's localStorage
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // ── PROCESS QUEUE ─────────────────────────────────────────────────────────
  // Queue items come in the POST body (sent from approveAllSync in the app)
  let items = [];
  try {
    const body = JSON.parse(event.body || '{}');
    items = body.items || [];
  } catch {}

  if (!items.length) {
    return { statusCode: 200, body: JSON.stringify({ processed: 0, errors: [], remaining: 0 }) };
  }

  let processed = 0;
  const errors = [];
  const remaining = [];

  for (const item of items) {
    try {
      const t = item.type;

      if (t === 'delete_variant') {
        const r = await notionReq('POST', `/databases/${dbs.variant}/query`, {
          filter: { property: 'userDefined:ID', title: { equals: item.variantCode } }
        });
        for (const page of r.results || []) {
          await notionReq('PATCH', `/pages/${page.id}`, { archived: true });
        }
        processed++;

      } else if (t === 'add_instance') {
        // add_instance is handled by Claude MCP — skip
        processed++;

      } else if (t === 'remove_instance') {
        const instId = item.instId || item.inst?.id;
        if (instId) {
          const r = await notionReq('POST', `/databases/${dbs.instance}/query`, {
            filter: { property: 'ID', formula: { string: { equals: instId } } }
          });
          for (const page of r.results || []) {
            await notionReq('PATCH', `/pages/${page.id}`, { archived: true });
          }
          processed++;
        }

      } else if (t === 'edit_instance') {
        const inst = item.inst || {};
        const instId = inst.id;
        if (instId) {
          const r = await notionReq('POST', `/databases/${dbs.instance}/query`, {
            filter: { property: 'ID', formula: { string: { equals: instId } } }
          });
          for (const page of r.results || []) {
            const props = {};
            const condId = await lookupPage(dbs.condition, inst.cond);
            if (condId) props['Condition'] = { relation: [{ id: condId }] };
            const ptypeId = await lookupPage(dbs.ptype, inst.ptype);
            if (ptypeId) props['Preservation Type'] = { relation: [{ id: ptypeId }] };
            if (dbs.storage_container) {
              const s1Id = await lookupPage(dbs.storage_container, inst.s1);
              if (s1Id) props['Storage 1'] = { relation: [{ id: s1Id }] };
            }
            if (dbs.storage_page) {
              const s2Id = await lookupPage(dbs.storage_page, inst.s2);
              if (s2Id) props['Storage 2'] = { relation: [{ id: s2Id }] };
            }
            if (dbs.storage_slot) {
              const s3Id = await lookupPage(dbs.storage_slot, inst.s3);
              if (s3Id) props['Storage 3'] = { relation: [{ id: s3Id }] };
            }
            if (Object.keys(props).length) {
              await notionReq('PATCH', `/pages/${page.id}`, { properties: props });
            }
          }
          processed++;
        }

      } else if (t === 'variant_edit') {
        const r = await notionReq('POST', `/databases/${dbs.variant}/query`, {
          filter: { property: 'userDefined:ID', title: { equals: item.variantCode } }
        });
        for (const page of r.results || []) {
          const props = {};
          if (item.status)     props['Status']     = { select: { name: item.status } };
          if (item.collection) props['Collection'] = { select: { name: item.collection } };
          if (Object.keys(props).length) {
            await notionReq('PATCH', `/pages/${page.id}`, { properties: props });
          }
        }
        processed++;

      } else {
        remaining.push(item);
      }
    } catch (e) {
      errors.push(`${item.type}: ${e.message}`);
      remaining.push(item);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processed, errors, remaining: remaining.length }),
  };
};
