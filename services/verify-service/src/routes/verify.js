import express from "express";
import { getContract } from "../contract.js";

const router = express.Router();

router.get("/health", (req, res) =>
  res.json({ status: "OK", service: "verify-service" }),
);

router.get("/:refId", async (req, res) => {
  try {
    const refId = req.params.refId;
    const contract = getContract();

    const exists = await contract.paymentExists(refId);
    if (!exists)
      return res
        .status(404)
        .json({ verified: false, error: "Not found on chain" });

    const [storedRefId, payer, amount, timestamp, txHash] =
      await contract.getPayment(refId);

    res.json({
      verified: true,
      refId: storedRefId,
      payer,
      amount: amount.toString(),
      timestamp: timestamp.toString(),
      txHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
