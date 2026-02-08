// frontend/src/wallet.js
import { ethers } from "ethers";

export const HARDHAT_CHAIN_ID_DEC = 31337;
export const HARDHAT_CHAIN_ID_HEX = "0x7a69";

export function hasMetaMask() {
  return (
    typeof window !== "undefined" && typeof window.ethereum !== "undefined"
  );
}

export async function ensureHardhatChain() {
  if (!hasMetaMask()) throw new Error("MetaMask not found.");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId === HARDHAT_CHAIN_ID_DEC) return chainId;

  // Try switch first
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_CHAIN_ID_HEX }],
    });
    return HARDHAT_CHAIN_ID_DEC;
  } catch (err) {
    // If chain not added, add it
    const code = err?.code;
    if (code !== 4902) throw err;

    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: HARDHAT_CHAIN_ID_HEX,
          chainName: "Hardhat Local",
          rpcUrls: ["http://127.0.0.1:8545"],
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        },
      ],
    });

    // After adding, switch
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_CHAIN_ID_HEX }],
    });

    return HARDHAT_CHAIN_ID_DEC;
  }
}

export async function connectWallet() {
  if (!hasMetaMask())
    throw new Error("MetaMask not found. Install the extension first.");

  // Request accounts
  await window.ethereum.request({ method: "eth_requestAccounts" });

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  return { address, chainId: Number(network.chainId) };
}

export async function getConnectedWallet() {
  if (!hasMetaMask()) return null;

  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (!accounts?.length) return null;

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();

  return { address: accounts[0], chainId: Number(network.chainId) };
}

export async function getSigner() {
  if (!hasMetaMask()) throw new Error("MetaMask not found.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}
