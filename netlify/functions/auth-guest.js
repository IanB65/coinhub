const { getStore } = require("@netlify/blobs");
const { createToken, verifyToken, getSessionFromEvent, json } = require("./_auth-utils");

async function requireOwner(event) {
  const token = getSessionFromEvent(event);
  const payload = verifyToken(token);
  if (!payload || payload.role !== "owner") return null;
  return payload;
}

exports.handler = async (event) => {
  const owner = await requireOwner(event);
  if (!owner) return json(403, { error: "Admin access required" });

  const store = getStore("coinhub-guests");

  // GET — list all guest tokens
  if (event.httpMethod === "GET") {
    const { blobs } = await store.list();
    const guests = await Promise.all(
      blobs.map(async ({ key }) => store.get(key, { type: "json" }))
    );
    const now = Math.floor(Date.now() / 1000);
    return json(200, {
      guests: guests
        .filter(Boolean)
        .map((g) => ({ ...g, expired: g.exp < now }))
        .sort((a, b) => b.createdAt - a.createdAt),
    });
  }

  // POST — create a new guest token
  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON" });
    }

    const label = String(body.label || "Guest").slice(0, 60);
    const expiresInSeconds = Math.min(
      Math.max(parseInt(body.expiresInSeconds) || 24 * 3600, 300), // min 5 min
      365 * 24 * 3600 // max 1 year
    );

    const { token, id, exp } = createToken("guest", expiresInSeconds, { label });
    const meta = { id, label, exp, createdAt: Math.floor(Date.now() / 1000) };
    await store.set(id, JSON.stringify(meta));

    const host = event.headers.host || event.headers.Host || "";
    const protocol = host.includes("localhost") ? "http" : "https";
    const link = `${protocol}://${host}/login?guest=${encodeURIComponent(token)}`;

    return json(200, { id, label, exp, link });
  }

  // DELETE — revoke a guest token
  if (event.httpMethod === "DELETE") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON" });
    }
    if (!body.id) return json(400, { error: "id required" });
    await store.delete(body.id);
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
};
