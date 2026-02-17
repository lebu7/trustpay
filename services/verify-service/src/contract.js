// services/verify-service/src/contract.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load verify-service .env
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/**
 * ✅ Minimal ABI (no hardhat artifacts needed)
 * Must match your PaymentProof.sol
 */
const abi = [
  "function getPayment(string refId) view returns (string,address,uint256,uint256,string)",
  "function paymentExists(string refId) view returns (bool)",
  "event PaymentRecorded(string refId,address payer,uint256 amount,uint256 timestamp,string txHash)",
];

function getProvider() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL missing in .env");

  // ethers v6 vs v5 support
  if (ethers.JsonRpcProvider) return new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

function getAddress() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS missing in .env");
  return contractAddress;
}

export function getContract() {
  const provider = getProvider();
  return new ethers.Contract(getAddress(), abi, provider);
}
