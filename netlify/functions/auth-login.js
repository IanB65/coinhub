const { verifyTotp, createToken, safeCompare, json, sessionCookie } = require("./_auth-utils");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
  const ADMIN_TOTP_SECRET = process.env.ADMIN_TOTP_SECRET || "";
  const AUTH_SECRET = process.env.AUTH_SECRET || "";

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_TOTP_SECRET || !AUTH_SECRET) {
    return json(500, { error: "Server not configured — set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOTP_SECRET, AUTH_SECRET in Netlify environment variables" });
  }

  // All three checks run regardless of earlier failures (timing safety)
  const emailOk = safeCompare(body.email, ADMIN_EMAIL);
  const passOk = safeCompare(body.password, ADMIN_PASSWORD);
  const totpOk = verifyTotp(ADMIN_TOTP_SECRET, body.totp);

  if (!emailOk || !passOk || !totpOk) {
    return json(401, { error: "Invalid credentials" });
  }

  const TTL = 8 * 3600; // 8 hours
  const { token } = createToken("owner", TTL);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(token, TTL),
    },
    body: JSON.stringify({ ok: true }),
  };
};
