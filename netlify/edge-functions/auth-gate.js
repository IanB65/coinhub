import { getStore } from "@netlify/blobs";

// Paths that don't require authentication
function isPublic(pathname) {
  return (
    pathname === "/login" ||
    pathname === "/login.html" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/.netlify/functions/auth-")
  );
}

export default async (request, context) => {
  const url = new URL(request.url);

  if (isPublic(url.pathname)) {
    return context.next();
  }

  const token = getCookie(request, "chsid");
  if (!token) return redirectToLogin(url);

  const payload = await verifyToken(token);
  if (!payload) return redirectToLogin(url);

  // For guest tokens, verify the token hasn't been revoked
  if (payload.role === "guest") {
    try {
      const store = getStore({ name: "coinhub-guests", consistency: "strong" });
      const meta = await store.get(payload.id, { type: "json" });
      if (!meta) return redirectToLogin(url, "revoked");
    } catch {
      return redirectToLogin(url, "revoked");
    }
  }

  return context.next();
};

function redirectToLogin(url, reason) {
  const target = new URL("/login", url.origin);
  if (reason) target.searchParams.set("reason", reason);
  return Response.redirect(target.toString(), 302);
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function verifyToken(token) {
  try {
    const secret = Netlify.env.get("AUTH_SECRET");
    if (!secret) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = b64urlToBytes(sigB64);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export const config = { path: "/*" };
