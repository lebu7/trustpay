import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

// __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// repo root: trustpay/
const repoRoot = path.resolve(__dirname, "..", "..", "..");

// artifact path: trustpay/contracts/artifacts/...
const artifactPath = path.join(
  repoRoot,
  "contracts",
  "artifacts",
  "contracts",
  "PaymentProof.sol",
  "PaymentProof.json",
);

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abi = artifact.abi;

export function getContract() {
  // ✅ read env INSIDE function (after dotenv loads)
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl) throw new Error("RPC_URL missing in .env");
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS missing in .env");

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(contractAddress, abi, provider);
}
