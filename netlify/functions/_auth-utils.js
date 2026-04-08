const crypto = require("crypto");

// ── TOTP (RFC 6238) ──────────────────────────────────────────────────────────

function base32Decode(s) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  s = s.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0;
  const output = [];
  for (let i = 0; i < s.length; i++) {
    const idx = chars.indexOf(s[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totpCode(secret, step) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[19] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret, provided) {
  const step = Math.floor(Date.now() / 30_000);
  const code = String(provided || "").replace(/\s/g, "");
  for (let i = -1; i <= 1; i++) {
    if (totpCode(secret, step + i) === code) return true;
  }
  return false;
}

// ── Session tokens (HMAC-SHA256 signed) ──────────────────────────────────────

function createToken(role, expiresInSeconds, extra = {}) {
  const secret = process.env.AUTH_SECRET;
  const id = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = { id, role, exp, ...extra };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return { token: `${payloadB64}.${sig}`, id, exp };
}

function verifyToken(rawToken) {
  try {
    const secret = process.env.AUTH_SECRET;
    const parts = (rawToken || "").split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSessionFromEvent(event) {
  const cookie = event.headers?.cookie || event.headers?.Cookie || "";
  const match = cookie.match(/(?:^|;\s*)chsid=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function safeCompare(a, b) {
  try {
    const ba = Buffer.from(String(a || ""));
    const bb = Buffer.from(String(b || ""));
    const len = Math.max(ba.length, bb.length, 1);
    const pa = Buffer.concat([ba, Buffer.alloc(len - ba.length)]);
    const pb = Buffer.concat([bb, Buffer.alloc(len - bb.length)]);
    return crypto.timingSafeEqual(pa, pb) && ba.length === bb.length;
  } catch {
    return false;
  }
}

function json(code, body, extraHeaders = {}) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function sessionCookie(token, maxAge) {
  return `chsid=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

module.exports = {
  verifyTotp,
  createToken,
  verifyToken,
  getSessionFromEvent,
  safeCompare,
  json,
  sessionCookie,
};
