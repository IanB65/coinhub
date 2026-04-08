const { verifyToken, getSessionFromEvent, json } = require("./_auth-utils");

exports.handler = async (event) => {
  const token = getSessionFromEvent(event);
  const payload = verifyToken(token);
  if (!payload) return json(401, { error: "Not authenticated" });

  const response = { role: payload.role, exp: payload.exp };

  // For guests, include expiry as milliseconds for the banner display
  if (payload.role === "guest") {
    response.guestExpires = payload.exp * 1000;
  }

  return json(200, response);
};
