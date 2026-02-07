const hre = require("hardhat");

async function main() {
  const PaymentProof = await hre.ethers.getContractFactory("PaymentProof");
  const contract = await PaymentProof.deploy();
  await contract.deployed();

  console.log("✅ PaymentProof deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
