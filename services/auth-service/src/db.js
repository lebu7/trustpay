import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "db", "auth.db");
const db = new Database(dbPath);

// Create table
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export default db;
