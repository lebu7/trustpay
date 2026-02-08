import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import verifyRoutes from "./routes/verify.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

console.log("VERIFY ENV:", {
  PORT: process.env.PORT,
  RPC_URL: process.env.RPC_URL,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
});

const app = express();
app.use(cors());
app.use(express.json());

app.use("/verify", verifyRoutes);

const PORT = process.env.PORT || 4003;
app.listen(PORT, () =>
  console.log(`✅ verify-service running on http://localhost:${PORT}`),
);
