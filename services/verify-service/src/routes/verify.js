import express from "express";
import { ethers } from "ethers";
import { getContract } from "../contract.js";

const router = express.Router();

// ✅ Minimal ABI to decode tx input safely (works even if storage getters differ)
const PAYMENT_PROOF_MIN_ABI = [
  "function recordPayment(string refId, uint256 amount, string txHash)",
];

router.get("/health", (req, res) => {
  try {
    const contract = getContract();
    res.json({
      status: "OK",
      service: "verify-service",
      rpc: process.env.RPC_URL,
      contract: process.env.CONTRACT_ADDRESS,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "health failed" });
  }
});

/**
 * ✅ Verify by tx hash + validate it was a recordPayment(refId, amount, ..) call
 * GET /verify/tx/:txHash?refId=TP-...&amount=2500
 */
router.get("/tx/:txHash", async (req, res) => {
  try {
    const { txHash } = req.params;
    const { refId, amount } = req.query;

    if (!txHash || !txHash.startsWith("0x")) {
      return res.status(400).json({ error: "txHash must be a 0x... hash" });
    }
    if (!refId) {
      return res.status(400).json({ error: "refId query param required" });
    }
    if (amount == null) {
      return res.status(400).json({ error: "amount query param required" });
    }

    const contract = getContract();

    // ethers v5: contract.provider exists
    const provider = contract.provider;
    if (!provider?.getTransactionReceipt || !provider?.getTransaction) {
      return res.status(500).json({
        error: "Provider not found (check contract.js / ethers version)",
      });
    }

    // 1) receipt must exist and be successful
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return res.json({
        verified: false,
        reason: "Transaction not found / not mined yet",
        txHash,
      });
    }

    const status = Number(receipt.status);
    if (status !== 1) {
      return res.json({
        verified: false,
        reason: "Transaction reverted",
        txHash,
        receipt,
      });
    }

    // 2) tx must exist (to decode input)
    const tx = await provider.getTransaction(txHash);
    if (!tx) {
      return res.json({
        verified: false,
        reason: "Transaction details not available",
        txHash,
        receipt,
      });
    }

    // 3) Must target our contract address
    const expectedTo = (process.env.CONTRACT_ADDRESS || "").toLowerCase();
    const actualTo = (tx.to || "").toLowerCase();

    if (!expectedTo) {
      return res
        .status(500)
        .json({ error: "CONTRACT_ADDRESS missing in .env" });
    }

    if (actualTo !== expectedTo) {
      return res.json({
        verified: false,
        reason: "Tx was not sent to PaymentProof contract",
        txHash,
        expectedTo,
        actualTo,
      });
    }

    // 4) Decode input and verify it is recordPayment(refId, amount, ...)
    const iface = new ethers.utils.Interface(PAYMENT_PROOF_MIN_ABI);

    let decoded;
    try {
      decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
    } catch (e) {
      return res.json({
        verified: false,
        reason: "Tx input is not a recordPayment call (decode failed)",
        txHash,
        details: e?.message,
      });
    }

    if (decoded?.name !== "recordPayment") {
      return res.json({
        verified: false,
        reason: "Tx is not recordPayment(...)",
        txHash,
        decodedFunction: decoded?.name,
      });
    }

    const decodedRefId = decoded.args?.refId;
    const decodedAmount =
      decoded.args?.amount?.toString?.() ?? String(decoded.args?.amount);

    if (String(decodedRefId) !== String(refId)) {
      return res.json({
        verified: false,
        reason: "refId mismatch vs tx input",
        txHash,
        refId: String(refId),
        onTx: String(decodedRefId),
      });
    }

    if (String(decodedAmount) !== String(amount)) {
      return res.json({
        verified: false,
        reason: "amount mismatch vs tx input",
        txHash,
        amount: String(amount),
        onTx: String(decodedAmount),
      });
    }

    // ✅ All checks passed
    return res.json({
      verified: true,
      txHash,
      refId: String(refId),
      amount: String(decodedAmount),
      blockNumber: receipt.blockNumber,
      from: tx.from,
      to: tx.to,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Tx verify failed" });
  }
});

/**
 * Optional legacy endpoint (kept for compatibility)
 * GET /verify/:refId
 *
 * If your contract actually has getPayment, you can bring it back later.
 * Right now it fails due ABI/function mismatch, so return a helpful message.
 */
router.get("/:refId", async (req, res) => {
  return res.json({
    verified: false,
    refId: req.params.refId,
    reason:
      "This contract build does not expose getPayment(refId). Use /verify/tx/:txHash instead.",
  });
});

export default router;
