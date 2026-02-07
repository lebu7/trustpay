import express from "express";
import { getContract, getWriteContract } from "../contract.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "OK", service: "verify-service" });
});

router.get("/:refId", async (req, res) => {
  const { refId } = req.params;
  const contract = getContract();

  const proof = await contract.getPayment(refId);
  const payer = proof[0];
  const amount = proof[1].toString();
  const timestamp = proof[2].toString();
  const txHash = proof[3];

  const verified = payer !== "0x0000000000000000000000000000000000000000";
  return res.json({ verified, refId, payer, amount, timestamp, txHash });
});

// ✅ Local demo endpoint: record proof on-chain
router.post("/record", async (req, res) => {
  const { refId, amount, txHash = "0xTEMP" } = req.body;
  if (!refId || amount == null)
    return res.status(400).json({ error: "refId and amount required" });

  const contract = getWriteContract();
  const tx = await contract.recordPayment(refId, String(amount), txHash);
  const receipt = await tx.wait();

  res.json({ ok: true, refId, txHash, txReceiptHash: receipt.transactionHash });
});

export default router;
