const { getStore } = require("@netlify/blobs");
const { verifyToken, json, sessionCookie } = require("./_auth-utils");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const token = body.token;
  const payload = verifyToken(token);

  if (!payload || payload.role !== "guest") {
    return json(401, { error: "Invalid or expired guest link" });
  }

  // Check token hasn't been revoked
  const store = getStore({ name: "coinhub-guests", consistency: "strong" });
  const meta = await store.get(payload.id, { type: "json" });
  if (!meta) {
    return json(401, { error: "This guest link has been revoked or has expired" });
  }

  const maxAge = payload.exp - Math.floor(Date.now() / 1000);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(token, maxAge),
    },
    body: JSON.stringify({ ok: true }),
  };
};
