import { useEffect, useState, useCallback } from "react";
import { api, setAuthToken } from "./api";

function Badge({ status }) {
  const map = {
    VERIFIED: "bg-green-100 text-green-800 border-green-200",
    PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
    FAILED: "bg-red-100 text-red-800 border-red-200",
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

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setLoadingInvoices(true);
    try {
      const res = await api.get("/payments/invoices");
      setInvoices(res.data.invoices || []);
    } catch (e) {
      setErr(e?.response?.data?.error || "Failed to load invoices");
    } finally {
      setLoadingInvoices(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      setAuthToken(token);
      localStorage.setItem("token", token);
    } else {
      setAuthToken("");
      localStorage.removeItem("token");
    }
  }, [token]);

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
    setBusy(true);

    try {
      const res = await api.post("/payments/invoices", {
        amount: Number(amount),
        currency: "KES",
        description: desc,
      });

      setInvoice(res.data.invoice);
      setConfirmRef(res.data.invoice.reference);
      setNotice("Invoice created. Record on-chain, then Confirm.");
      loadInvoices();
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Create invoice failed");
    } finally {
      setBusy(false);
    }
  }

  async function recordOnChain() {
    setErr("");
    setNotice("");
    setConfirmResult(null);
    setBusy(true);

    try {
      if (!confirmRef) {
        setErr("Reference is required.");
        return;
      }

      // uses selected invoice amount if available, else form amount
      const amt = Number(invoice?.amount ?? amount);

      await api.post("/verify/record", {
        refId: confirmRef,
        amount: amt,
        txHash: "0xTEMP",
      });

      setNotice("Recorded on-chain (local signer). Now click Confirm.");
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Failed to record on-chain");
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
      const res = await api.post("/payments/confirm", {
        reference: confirmRef,
        tx_hash: "0xTEMP",
      });

      setConfirmResult(res.data);
      if (res.data?.invoice) setInvoice(res.data.invoice);

      setNotice("Payment confirmed and verified on-chain.");
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
    setErr("");
    setNotice("");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              TrustPay Dashboard
            </h1>
            <p className="mt-2 text-slate-600">
              Blockchain payment proof verification + microservices + AI risk scoring (demo).
            </p>
          </div>

          {token && (
            <button
              onClick={logout}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Logout
            </button>
          )}
        </div>

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

        {!token ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Login</h2>
              <p className="mt-1 text-sm text-slate-600">Use your admin credentials.</p>

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
              <h2 className="text-lg font-semibold text-slate-900">What you can do</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                <li>Create an invoice (business reference)</li>
                <li>Record proof on blockchain (dev signer now, MetaMask later)</li>
                <li>Confirm payment → verify-service checks the chain → invoice becomes VERIFIED</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Account</h2>
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

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Create Invoice</h2>

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

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Confirm Payment</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Flow: record on-chain → confirm → VERIFIED.
                </p>

                <div className="mt-4 grid gap-3 text-sm">
                  <label className="grid gap-1">
                    <span className="text-slate-700">Reference</span>
                    <input
                      className="rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                      value={confirmRef}
                      onChange={(e) => setConfirmRef(e.target.value)}
                      placeholder="TP-..."
                    />
                  </label>

                  <div className="flex gap-2">
                    <button
                      onClick={recordOnChain}
                      disabled={busy || !confirmRef}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Record on-chain
                    </button>

                    <button
                      onClick={confirm}
                      disabled={busy || !confirmRef}
                      className="flex-1 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                    >
                      Confirm
                    </button>
                  </div>
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

            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Invoices</h2>
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
                        <th className="px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => {
                            setInvoice(inv);
                            setConfirmRef(inv.reference);
                          }}
                        >
                          <td className="px-4 py-3 font-mono text-xs">{inv.reference}</td>
                          <td className="px-4 py-3">
                            {inv.amount} {inv.currency}
                          </td>
                          <td className="px-4 py-3">
                            <Badge status={inv.status} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{inv.created_at}</td>
                        </tr>
                      ))}

                      {invoices.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-slate-500" colSpan={4}>
                            No invoices yet. Create one to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {invoice && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold">Selected invoice</span>
                      <Badge status={invoice.status} />
                    </div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(invoice, null, 2)}</pre>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Next: MetaMask record button
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Later we’ll replace the dev signer endpoint with MetaMask and send the transaction
                  directly from the browser using ethers + window.ethereum.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
