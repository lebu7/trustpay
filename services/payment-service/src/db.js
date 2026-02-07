import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "db", "payments.db");
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  description TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  payer_wallet TEXT NOT NULL,
  tx_hash TEXT,
  chain_payer TEXT,
  chain_timestamp TEXT,
  risk_score INTEGER,
  risk_level TEXT,
  risk_reasons TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);
`);
export default db;
