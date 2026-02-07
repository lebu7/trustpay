import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import paymentsRoutes from "./routes/payments.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) =>
  res.json({ status: "OK", service: "payment-service" }),
);
app.use("/payments", paymentsRoutes);

const PORT = process.env.PORT || 4002;
app.listen(PORT, () =>
  console.log(`✅ payment-service running on http://localhost:${PORT}`),
);
