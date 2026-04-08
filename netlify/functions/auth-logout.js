exports.handler = async () => ({
  statusCode: 302,
  headers: {
    Location: "/login",
    "Set-Cookie": "chsid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  },
  body: "",
});
