import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..", "..");

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

function getProvider() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL missing in .env");
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

// ✅ write-enabled contract (local demo)
export function getWriteContract() {
  const provider = getProvider();
  const pk = process.env.SIGNER_PRIVATE_KEY;
  if (!pk) throw new Error("SIGNER_PRIVATE_KEY missing in .env");
  const wallet = new ethers.Wallet(pk, provider);
  return new ethers.Contract(getAddress(), abi, wallet);
}
