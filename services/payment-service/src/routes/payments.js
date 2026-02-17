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
    .prepare(
      `SELECT invoices.*,
              payments.risk_score,
              payments.risk_level
       FROM invoices
       LEFT JOIN payments
         ON payments.id = (
           SELECT id
           FROM payments
           WHERE invoice_id = invoices.id
           ORDER BY id DESC
           LIMIT 1
         )
       ORDER BY invoices.id DESC
       LIMIT 50`,
    )
    .all();

  res.json({ invoices: rows });
});

// ✅ Delete invoice (PENDING/FAILED only)
router.delete("/invoices/:id", requireAuth, (req, res) => {
  const invoiceId = Number(req.params.id);
  if (!invoiceId) return res.status(400).json({ error: "Invalid invoice id" });

  const invoice = db
    .prepare("SELECT * FROM invoices WHERE id = ?")
    .get(invoiceId);

  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  // Ownership rules: customers can only delete their own invoices
  if (
    req.user.role === "customer" &&
    Number(invoice.customer_id) !== Number(req.user.id)
  ) {
    return res
      .status(403)
      .json({ error: "Not authorized to delete this invoice" });
  }

  // Protect audit trail
  if (invoice.status === "VERIFIED" || invoice.status === "PROCESSING") {
    return res.status(403).json({
      error: `Cannot delete invoice with status ${invoice.status}`,
    });
  }

  // Only allow PENDING or FAILED
  if (invoice.status !== "PENDING" && invoice.status !== "FAILED") {
    return res.status(403).json({
      error: "Only PENDING or FAILED invoices can be deleted",
    });
  }

  try {
    // delete related payments first (FK safety)
    db.prepare("DELETE FROM payments WHERE invoice_id = ?").run(invoiceId);

    // then delete invoice
    db.prepare("DELETE FROM invoices WHERE id = ?").run(invoiceId);

    return res.json({ success: true, deleted_id: invoiceId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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

async function scoreInvoiceRisk({ invoice, userId, payerWallet }) {
  const defaults = {
    risk_score: 15,
    risk_level: "LOW",
    reasons: ["Scored during confirmation"],
  };

  try {
    const now = new Date();
    const hour_of_day = now.getHours();

    const attempts_last_10min =
      db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM payments
           WHERE created_at >= datetime('now', '-10 minutes')
             AND invoice_id IN (
               SELECT id FROM invoices WHERE customer_id = ?
             )`,
        )
        .get(userId)?.count || 0;

    const payments_last_24h =
      db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM payments
           WHERE created_at >= datetime('now', '-24 hours')
             AND invoice_id IN (
               SELECT id FROM invoices WHERE customer_id = ?
             )`,
        )
        .get(userId)?.count || 0;

    const resp = await fetch(`${process.env.AI_RISK_URL}/risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: invoice.amount,
        currency: invoice.currency,
        customer_id: userId,
        payer_wallet: payerWallet,
        attempts_last_10min,
        payments_last_24h,
        is_new_customer: false,
        hour_of_day,
      }),
    });

    if (!resp.ok) return defaults;

    const scored = await resp.json();
    return {
      risk_score: scored?.risk_score ?? defaults.risk_score,
      risk_level: scored?.risk_level || defaults.risk_level,
      reasons: Array.isArray(scored?.reasons)
        ? scored.reasons
        : defaults.reasons,
    };
  } catch {
    return defaults;
  }
}

// Confirm payment via verify-service
router.post("/confirm", requireAuth, async (req, res) => {
  const { reference, tx_hash } = req.body;

  if (!reference) return res.status(400).json({ error: "reference required" });
  if (!tx_hash || !String(tx_hash).startsWith("0x")) {
    return res.status(400).json({ error: "tx_hash (0x...) required" });
  }

  const invoice = db
    .prepare("SELECT * FROM invoices WHERE reference = ?")
    .get(reference);

  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  let verifiedData;
  try {
    const url =
      `${process.env.VERIFY_SERVICE_URL}/verify/tx/${tx_hash}` +
      `?refId=${encodeURIComponent(reference)}` +
      `&amount=${encodeURIComponent(String(invoice.amount))}`;

    const resp = await fetch(url);
    verifiedData = await resp.json();

    if (!resp.ok || !verifiedData?.verified) {
      return res.status(400).json({
        error: "Not verified on chain",
        details: verifiedData,
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: "Verify service error",
      details: err.message,
    });
  }

  db.prepare(`UPDATE invoices SET status = 'VERIFIED' WHERE id = ?`).run(
    invoice.id,
  );

  const chainPayer = verifiedData?.event?.payer || verifiedData?.from || null;

  const chainTimestamp =
    verifiedData?.event?.timestamp != null
      ? String(verifiedData.event.timestamp)
      : null;

  const latestPayment = db
    .prepare(
      "SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(invoice.id);

  const needsRiskScoring =
    !latestPayment ||
    latestPayment.risk_score === null ||
    latestPayment.risk_level === null;

  const confirmRisk = needsRiskScoring
    ? await scoreInvoiceRisk({
        invoice,
        userId: req.user.id,
        payerWallet: chainPayer || latestPayment?.payer_wallet || "0xUNKNOWN",
      })
    : null;

  if (latestPayment) {
    db.prepare(
      `UPDATE payments
       SET tx_hash = COALESCE(?, tx_hash),
           chain_payer = ?,
           chain_timestamp = ?,
           risk_score = COALESCE(?, risk_score),
           risk_level = COALESCE(?, risk_level),
           risk_reasons = COALESCE(?, risk_reasons)
       WHERE id = ?`,
    ).run(
      tx_hash,
      chainPayer,
      chainTimestamp,
      confirmRisk?.risk_score ?? null,
      confirmRisk?.risk_level ?? null,
      confirmRisk ? JSON.stringify(confirmRisk.reasons) : null,
      latestPayment.id,
    );
  } else {
    db.prepare(
      `INSERT INTO payments (
         invoice_id,
         payer_wallet,
         tx_hash,
         chain_payer,
         chain_timestamp,
         risk_score,
         risk_level,
         risk_reasons
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      invoice.id,
      chainPayer || "0xUNKNOWN",
      tx_hash,
      chainPayer,
      chainTimestamp,
      confirmRisk?.risk_score ?? 15,
      confirmRisk?.risk_level ?? "LOW",
      JSON.stringify(confirmRisk?.reasons || ["Scored during confirmation"]),
    );
  }

  const updatedInvoice = db
    .prepare(
      `SELECT invoices.*,
              payments.risk_score,
              payments.risk_level
       FROM invoices
       LEFT JOIN payments
         ON payments.id = (
           SELECT id
           FROM payments
           WHERE invoice_id = invoices.id
           ORDER BY id DESC
           LIMIT 1
         )
       WHERE invoices.id = ?`,
    )
    .get(invoice.id);

  return res.json({ invoice: updatedInvoice, chain: verifiedData });
});

export default router;
