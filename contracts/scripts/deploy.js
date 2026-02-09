const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function writeEnvFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`✅ Wrote ${path.relative(process.cwd(), filePath)}`);
}

async function main() {
  const PaymentProof = await hre.ethers.getContractFactory("PaymentProof");
  const contract = await PaymentProof.deploy();
  await contract.deployed();

  console.log("✅ PaymentProof deployed to:", contract.address);

  const repoRoot = path.resolve(__dirname, "../..");
  const frontendEnv = path.join(repoRoot, "frontend", ".env");
  const verifyEnv = path.join(
    repoRoot,
    "services",
    "verify-service",
    ".env"
  );

  writeEnvFile(
    frontendEnv,
    `VITE_CONTRACT_ADDRESS=${contract.address}\n`
  );
  writeEnvFile(verifyEnv, `CONTRACT_ADDRESS=${contract.address}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
