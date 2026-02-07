import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

function genReference() {
  return `TP-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

// Create invoice
router.post("/invoices", requireAuth, (req, res) => {
  const { amount, currency = "KES", description = "" } = req.body;
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ error: "amount required" });

  const reference = genReference();

  try {
    const info = db
      .prepare(
        `INSERT INTO invoices (reference, customer_id, description, amount, currency)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(reference, req.user.id, description, amount, currency);

    const invoice = db
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json({ invoice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List invoices (latest first)
router.get("/invoices", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM invoices ORDER BY id DESC LIMIT 50")
    .all();
  res.json({ invoices: rows });
});

// Record payment attempt + call AI
router.post("/pay", requireAuth, async (req, res) => {
  const {
    reference,
    payer_wallet,
    tx_hash = null,
    attempts_last_10min = 0,
    payments_last_24h = 0,
    hour_of_day = 12,
  } = req.body;

  if (!reference || !payer_wallet)
    return res
      .status(400)
      .json({ error: "reference and payer_wallet required" });

  const invoice = db
    .prepare("SELECT * FROM invoices WHERE reference = ?")
    .get(reference);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  // Call AI risk service
  let risk = { risk_score: 0, risk_level: "LOW", reasons: ["Normal behavior"] };

  try {
    const resp = await fetch(`${process.env.AI_RISK_URL}/risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: invoice.amount,
        currency: invoice.currency,
        customer_id: req.user.id,
        payer_wallet,
        attempts_last_10min,
        payments_last_24h,
        is_new_customer: false,
        hour_of_day,
      }),
    });

    if (resp.ok) risk = await resp.json();
  } catch {
    // keep default risk
  }

  const info = db
    .prepare(
      `INSERT INTO payments (invoice_id, payer_wallet, tx_hash, risk_score, risk_level, risk_reasons)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      invoice.id,
      payer_wallet,
      tx_hash,
      risk.risk_score,
      risk.risk_level,
      JSON.stringify(risk.reasons),
    );

  // Update invoice status (for now)
  db.prepare(`UPDATE invoices SET status = 'PROCESSING' WHERE id = ?`).run(
    invoice.id,
  );

  const payment = db
    .prepare("SELECT * FROM payments WHERE id = ?")
    .get(info.lastInsertRowid);

  res
    .status(201)
    .json({ invoice: { ...invoice, status: "PROCESSING" }, payment, risk });
});

// Confirm payment on blockchain + mark invoice VERIFIED
router.post("/confirm", requireAuth, async (req, res) => {
  const { reference, tx_hash } = req.body;
  if (!reference) return res.status(400).json({ error: "reference required" });

  const invoice = db
    .prepare("SELECT * FROM invoices WHERE reference = ?")
    .get(reference);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  // Verify on-chain via verify-service
  let verifiedData;
  try {
    const resp = await fetch(
      `${process.env.VERIFY_SERVICE_URL}/verify/${reference}`,
    );
    if (!resp.ok)
      return res.status(400).json({ error: "Not verified on chain" });
    verifiedData = await resp.json();
    if (!verifiedData.verified)
      return res.status(400).json({ error: "Not verified on chain" });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Verify service error", details: err.message });
  }

  // Update invoice + attach chain proof
  db.prepare(`UPDATE invoices SET status = 'VERIFIED' WHERE id = ?`).run(
    invoice.id,
  );

  // Update latest payment row for that invoice (or create one if missing)
  const latestPayment = db
    .prepare(
      "SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(invoice.id);

  if (latestPayment) {
    db.prepare(
      `UPDATE payments
       SET tx_hash = COALESCE(?, tx_hash),
           chain_payer = ?,
           chain_timestamp = ?
       WHERE id = ?`,
    ).run(
      tx_hash || null,
      verifiedData.payer,
      String(verifiedData.timestamp),
      latestPayment.id,
    );
  } else {
    db.prepare(
      `INSERT INTO payments (invoice_id, payer_wallet, tx_hash, chain_payer, chain_timestamp)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      invoice.id,
      verifiedData.payer,
      tx_hash || verifiedData.txHash,
      verifiedData.payer,
      String(verifiedData.timestamp),
    );
  }

  const updatedInvoice = db
    .prepare("SELECT * FROM invoices WHERE id = ?")
    .get(invoice.id);
  res.json({ invoice: updatedInvoice, chain: verifiedData });
});

export default router;
