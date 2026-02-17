// services/payment-service/src/middleware/requireAuth.js
export async function requireAuth(req, res, next) {
  const incoming = req.headers.authorization || "";
  if (!incoming.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = incoming.slice(7).trim(); // ✅ extract raw token

  const base = (
    process.env.AUTH_SERVICE_URL || "http://auth-service:4001"
  ).replace(/\/+$/, "");

  try {
    const resp = await fetch(`${base}/auth/me`, {
      headers: {
        // ✅ re-add Bearer (standardized)
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return res.status(401).json({ error: data?.error || "Invalid token" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    return res.status(500).json({
      error: "Auth service error",
      details: err?.message || "fetch failed",
    });
  }
}
