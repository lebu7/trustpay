// frontend/src/App.jsx
import { useEffect, useState, useCallback } from "react";
import { api, setAuthToken } from "./api";
import {
  connectWallet,
  getConnectedWallet,
  hasMetaMask,
  ensureHardhatChain,
  getSigner,
  HARDHAT_CHAIN_ID_DEC,
} from "./wallet";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

// Minimal ABI for recordPayment(refId, amount, txHash)
const PAYMENT_PROOF_ABI = [
  "function recordPayment(string refId, uint256 amount, string txHash) public",
];

function Badge({ status }) {
  const map = {
    VERIFIED: "bg-green-100 text-green-800 border-green-200",
    PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
    FAILED: "bg-red-100 text-red-800 border-red-200",
    PROCESSING: "bg-blue-100 text-blue-800 border-blue-200",
  };
  const cls = map[status] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

function RiskBadge({ level, score }) {
  if (!level) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        Not scored
      </span>
    );
  }

  const map = {
    LOW: "bg-emerald-100 text-emerald-800 border-emerald-200",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
    HIGH: "bg-rose-100 text-rose-800 border-rose-200",
  };
  const cls = map[level] || "bg-gray-100 text-gray-800 border-gray-200";
  const scoreLabel =
    score !== null && score !== undefined ? ` (${score})` : "";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {level}
      {scoreLabel}
    </span>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [email, setEmail] = useState("admin@trustpay.com");
  const [password, setPassword] = useState("Pass1234");

  const [me, setMe] = useState(null);
  const [amount, setAmount] = useState(2500);
  const [desc, setDesc] = useState("Hair service booking");

  const [invoice, setInvoice] = useState(null);
  const [confirmRef, setConfirmRef] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);

  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [wallet, setWallet] = useState(null);
  const [walletErr, setWalletErr] = useState("");

  // ✅ stores MetaMask transaction hash for the on-chain recordPayment tx
  const [recordTxHash, setRecordTxHash] = useState("");

  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setMe(res.data.user);
    } catch {
      setMe(null);
    }
  }, []);

  const withCustomerName = useCallback(
    (inv) => ({
      ...inv,
      customer_name:
        inv.customer_name ||
        (me && Number(inv.customer_id) === Number(me.id) ? me.full_name : ""),
    }),
    [me],
  );

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setLoadingInvoices(true);
    try {
      const res = await api.get("/payments/invoices");
      const nextInvoices = (res.data.invoices || []).map(withCustomerName);
      setInvoices(nextInvoices);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }, [token, withCustomerName]);

  // Keep axios auth header + localStorage in sync with token
  useEffect(() => {
    if (token) {
      setAuthToken(token);
      localStorage.setItem("token", token);
    } else {
      setAuthToken("");
      localStorage.removeItem("token");
    }
  }, [token]);

  // When token changes, fetch /me and invoices
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setErr("");
      setNotice("");

      if (!token) {
        setMe(null);
        setInvoices([]);
        return;
      }

      try {
        const res = await api.get("/auth/me");
        if (!cancelled) setMe(res.data.user);
      } catch {
        if (!cancelled) setMe(null);
      }

      if (!cancelled) loadInvoices();
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, loadInvoices]);

  // Wallet auto-detect + listeners (MetaMask)
  useEffect(() => {
    let mounted = true;

    async function initWallet() {
      try {
        const w = await getConnectedWallet();
        if (mounted) setWallet(w);
      } catch {
        // ignore
      }
    }

    initWallet();

    if (hasMetaMask()) {
      const onAccountsChanged = () => initWallet();
      const onChainChanged = () => window.location.reload();

      window.ethereum.on("accountsChanged", onAccountsChanged);
      window.ethereum.on("chainChanged", onChainChanged);

      return () => {
        mounted = false;
        window.ethereum?.removeListener("accountsChanged", onAccountsChanged);
        window.ethereum?.removeListener("chainChanged", onChainChanged);
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  async function login(e) {
    e.preventDefault();
    setErr("");
    setNotice("");
    setBusy(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      setToken(res.data.token);
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    setErr("");
    setNotice("");
    setConfirmResult(null);
    setRecordTxHash(""); // reset
    setBusy(true);

    try {
      const res = await api.post("/payments/invoices", {
        amount: Number(amount),
        currency: "KES",
        description: desc,
      });

      setInvoice(withCustomerName(res.data.invoice));
      setConfirmRef(res.data.invoice.reference);

      setNotice("Invoice created. Record on-chain (MetaMask), then Confirm.");
      loadInvoices();
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Create invoice failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConnectWallet() {
    setWalletErr("");
    setErr("");
    setNotice("");

    try {
      await ensureHardhatChain();
      const w = await connectWallet();
      setWallet(w);

      if (w.chainId !== HARDHAT_CHAIN_ID_DEC) {
        setWalletErr(
          `Wrong chain. Please switch to Hardhat Local (31337). Current: ${w.chainId}`
        );
      } else {
        setNotice("Wallet connected on Hardhat Local.");
      }
    } catch (e) {
      setWalletErr(e?.message || "Failed to connect wallet");
    }
  }

  function shortAddr(a) {
    if (!a) return "";
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  }

  async function recordOnChain() {
    setErr("");
    setNotice("");
    setConfirmResult(null);
    setBusy(true);

    try {
      if (!CONTRACT_ADDRESS) {
        setErr("Missing VITE_CONTRACT_ADDRESS in frontend/.env");
        return;
      }

      if (!confirmRef) {
        setErr("Reference is required.");
        return;
      }

      if (!wallet) {
        setErr("Connect MetaMask first.");
        return;
      }

      await ensureHardhatChain();

      const signer = await getSigner();
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        PAYMENT_PROOF_ABI,
        signer
      );

      const amt = BigInt(Number(invoice?.amount ?? amount));

      // ✅ This value is just stored in the contract as metadata (demo)
      const proofTxHashValue = "0xTEMP";

      setNotice("Sending transaction in MetaMask...");
      const tx = await contract.recordPayment(confirmRef, amt, proofTxHashValue);

      // ✅ store MetaMask tx hash for confirm()
      setRecordTxHash(tx.hash);

      setNotice(
        `Transaction sent. Waiting for confirmation... (${tx.hash.slice(
          0,
          10
        )}...)`
      );

      const receipt = await tx.wait();

      setNotice(
        `Recorded on-chain ✅ (block ${receipt.blockNumber}). Now click Confirm.`
      );
    } catch (e2) {
      const msg =
        e2?.shortMessage ||
        e2?.info?.error?.message ||
        e2?.message ||
        "Failed to record on-chain";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setErr("");
    setNotice("");
    setConfirmResult(null);
    setBusy(true);

    try {
      if (!confirmRef) {
        setErr("Reference is required.");
        return;
      }

      // ✅ Require a real MetaMask tx hash (prevents 400 + “Not verified”)
      if (!recordTxHash) {
        setErr("Record on-chain first (MetaMask) to generate a tx hash.");
        return;
      }

      const res = await api.post("/payments/confirm", {
        reference: confirmRef,
        tx_hash: recordTxHash,
      });

      setConfirmResult(res.data);
      if (res.data?.invoice) setInvoice(withCustomerName(res.data.invoice));

      setNotice("Payment confirmed and verified on-chain ✅");
      loadInvoices();
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Not verified on chain");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setToken("");
    setMe(null);
    setInvoice(null);
    setConfirmResult(null);
    setConfirmRef("");
    setInvoices([]);
    setRecordTxHash("");
    setErr("");
    setNotice("");
    setWalletErr("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              TrustPay Dashboard
            </h1>
            <p className="mt-2 text-slate-600">
              Blockchain payment proof verification + microservices + AI risk
              scoring (demo).
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Contract:{" "}
              <span className="font-mono">
                {CONTRACT_ADDRESS || "(missing)"}
              </span>
            </p>

            {recordTxHash && (
              <p className="mt-1 text-xs text-slate-500">
                Last MetaMask tx:{" "}
                <span className="font-mono break-all">{recordTxHash}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {wallet ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                Wallet:{" "}
                <span className="font-mono">{shortAddr(wallet.address)}</span>
                <span className="ml-2 rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  Chain {wallet.chainId}
                </span>
              </div>
            ) : (
              <button
                onClick={onConnectWallet}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Connect MetaMask
              </button>
            )}

            {token && (
              <button
                onClick={logout}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Wallet error */}
        {walletErr && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {walletErr}
          </div>
        )}

        {/* App notices */}
        {(err || notice) && (
          <div className="mt-6 space-y-2">
            {err && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {err}
              </div>
            )}
            {notice && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {notice}
              </div>
            )}
          </div>
        )}

        {/* Logged out view */}
        {!token ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Login</h2>
              <p className="mt-1 text-sm text-slate-600">
                Use your admin credentials.
              </p>

              <form onSubmit={login} className="mt-4 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="text-slate-700">Email</span>
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@trustpay.com"
                    autoComplete="email"
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-slate-700">Password</span>
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busy ? "Signing in..." : "Login"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                What you can do
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                <li>Create an invoice (business reference)</li>
                <li>Record proof on blockchain (MetaMask → Hardhat Local)</li>
                <li>
                  Confirm payment → verify-service checks tx input → invoice becomes VERIFIED
                </li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Don’t use Hardhat test keys on real networks.
              </p>
            </div>
          </div>
        ) : (
          /* Logged in view */
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {/* Left column */}
            <div className="space-y-6 lg:col-span-1">
              {/* Account */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Account
                  </h2>
                  <button
                    onClick={loadMe}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-4 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name</span>
                    <span className="font-medium">{me?.full_name || "..."}</span>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-slate-500">Role</span>
                    <span className="font-medium">{me?.role || "..."}</span>
                  </div>
                </div>
              </div>

              {/* Create Invoice */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Create Invoice
                </h2>

                <div className="mt-4 grid gap-3 text-sm">
                  <label className="grid gap-1">
                    <span className="text-slate-700">Amount (KES)</span>
                    <input
                      className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-slate-700">Description</span>
                    <input
                      className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                    />
                  </label>

                  <button
                    onClick={createInvoice}
                    disabled={busy}
                    className="mt-1 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {busy ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>

              {/* Confirm Payment */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Confirm Payment
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Flow: MetaMask record on-chain → confirm → VERIFIED.
                </p>

                <div className="mt-4 grid gap-3 text-sm">
                  <label className="grid gap-1">
                    <span className="text-slate-700">Reference</span>
                    <input
                      className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                      value={confirmRef}
                      onChange={(e) => {
                        setConfirmRef(e.target.value);
                        setRecordTxHash("");
                      }}
                      placeholder="TP-..."
                    />
                  </label>

                  <div className="flex gap-2">
                    <button
                      onClick={recordOnChain}
                      disabled={busy || !confirmRef}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {busy ? "Working..." : "Record on-chain"}
                    </button>

                    <button
                      onClick={confirm}
                      disabled={busy || !confirmRef || !recordTxHash}
                      className="flex-1 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                      title={!recordTxHash ? "Record on-chain first" : ""}
                    >
                      {busy ? "Working..." : "Confirm"}
                    </button>
                  </div>

                  {recordTxHash && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <div className="font-semibold text-slate-600">
                        MetaMask tx hash used for confirm:
                      </div>
                      <div className="mt-1 font-mono break-all">
                        {recordTxHash}
                      </div>
                    </div>
                  )}
                </div>

                {confirmResult && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(confirmResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6 lg:col-span-2">
              {/* Invoices */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Invoices
                  </h2>
                  <button
                    onClick={loadInvoices}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {loadingInvoices ? "Loading..." : "Refresh"}
                  </button>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Risk</th>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="cursor-pointer transition hover:bg-slate-50"
                          onClick={() => {
                            setInvoice(inv);
                            setConfirmRef(inv.reference);
                            setRecordTxHash("");
                          }}
                        >
                          <td className="px-4 py-3 font-mono text-xs">
                            {inv.reference}
                          </td>
                          <td className="px-4 py-3">
                            {inv.amount} {inv.currency}
                          </td>
                          <td className="px-4 py-3">
                            <Badge status={inv.status} />
                          </td>
                          <td className="px-4 py-3">
                            <RiskBadge
                              level={inv.risk_level}
                              score={inv.risk_score}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {inv.customer_name || `Customer #${inv.customer_id}`}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {inv.created_at}
                          </td>
                        </tr>
                      ))}

                      {invoices.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-slate-500" colSpan={6}>
                            No invoices yet. Create one to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {invoice && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Selected invoice
                        </p>
                        <p className="mt-1 font-mono text-sm text-slate-900">
                          {invoice.reference}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge status={invoice.status} />
                        <RiskBadge
                          level={invoice.risk_level}
                          score={invoice.risk_score}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Amount</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {invoice.amount} {invoice.currency}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Created</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {invoice.created_at}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Customer</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {invoice.customer_name || `Customer #${invoice.customer_id}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">
                          AI Risk
                        </span>
                        <RiskBadge
                          level={invoice.risk_level}
                          score={invoice.risk_score}
                        />
                      </div>
                      <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                          View full invoice JSON
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                          {JSON.stringify(invoice, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Next improvement
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  You can now show VERIFIED instantly after Confirm. Later, you can store tx hash
                  in the invoice row too (so refresh persists it).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
