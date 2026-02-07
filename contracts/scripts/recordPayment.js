const hre = require("hardhat");

async function main() {
  const refId = process.env.REF_ID;
  const amount = process.env.AMOUNT;
  const txHash = process.env.TX_HASH || "0xTEMP";

  if (!refId || !amount) {
    throw new Error("Set REF_ID and AMOUNT env vars");
  }

  const address = process.env.CONTRACT_ADDRESS;
  if (!address) throw new Error("CONTRACT_ADDRESS not set");

  const contract = await hre.ethers.getContractAt("PaymentProof", address);

  const tx = await contract.recordPayment(refId, amount, txHash);
  await tx.wait();

  console.log("✅ Recorded payment on-chain:", refId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
