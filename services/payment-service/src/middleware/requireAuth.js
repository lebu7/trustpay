export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer "))
    return res.status(401).json({ error: "Missing token" });

  try {
    const resp = await fetch(`${process.env.AUTH_SERVICE_URL}/auth/me`, {
      headers: { Authorization: header },
    });

    if (!resp.ok) return res.status(401).json({ error: "Invalid token" });

    const data = await resp.json();
    req.user = data.user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Auth service error", details: err.message });
  }
}
