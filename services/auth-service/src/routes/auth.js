import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

router.post("/register", async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (existing) return res.status(409).json({ error: "Email exists" });

    const password_hash = await bcrypt.hash(password, 10);

    const info = db
      .prepare(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      )
      .run(full_name, email, password_hash, role || "customer");

    const user = db
      .prepare("SELECT id, full_name, email, role FROM users WHERE id = ?")
      .get(info.lastInsertRowid);

    const token = signToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const userRow = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);
    if (!userRow) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, userRow.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const user = {
      id: userRow.id,
      full_name: userRow.full_name,
      email: userRow.email,
      role: userRow.role,
    };

    const token = signToken(user);

    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
