import { useCallback, useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { apiFetch } from "./lib/api.js";
import { auth, firebaseConfigured } from "./lib/firebase.js";

const TOKEN_KEY = "b2c_accounting_staff_token";

const NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "pending", label: "Pending approval" },
  { id: "voucher", label: "New voucher" },
  { id: "marketplace", label: "Marketplace" },
  { id: "members", label: "Members" },
  { id: "coa", label: "Chart of accounts" },
  { id: "journals", label: "Journals" },
];

const DASHBOARD_CODES = [
  { code: "11110", label: "Cash on hand" },
  { code: "11130", label: "Cash in bank" },
  { code: "30130", label: "Share capital" },
  { code: "10000", label: "Total assets" },
];

function mapFirebaseAuthError(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password. Use your b2ccoop.com Firebase password.";
    case "auth/too-many-requests":
      return "Too many attempts — wait a few minutes or reset your password.";
    default:
      return code ? `Firebase: ${code}` : "Sign-in failed";
  }
}

function formatMoney(value, currency = "PHP") {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(n);
}

function emptyVoucher() {
  return {
    date: new Date().toISOString().slice(0, 10),
    reference: "",
    description: "",
    entries: [
      { accountId: "", debit: "", credit: "" },
      { accountId: "", debit: "", credit: "" },
    ],
  };
}

function buildAccountTree(accounts) {
  const byId = new Map(accounts.map((a) => [a.id, { ...a, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function CoaRow({ node, depth, balances }) {
  const balance = balances[node.code];
  return (
    <>
      <tr className="border-b border-gray-50">
        <td className="py-2 pr-4 font-mono text-xs" style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}>
          {node.code}
        </td>
        <td className="py-2 pr-4">{node.title ?? node.name}</td>
        <td className="py-2 pr-4 text-gray-600">{node.type}</td>
        <td className="py-2 text-right font-medium tabular-nums">
          {balance != null ? formatMoney(balance) : "…"}
        </td>
      </tr>
      {node.children.map((child) => (
        <CoaRow key={child.id} node={child} depth={depth + 1} balances={balances} />
      ))}
    </>
  );
}

function JournalCard({ journal }) {
  const when = journal.transactionDate ?? journal.occurredAt;
  const ref = journal.integrationEvent?.externalId ?? journal.reference ?? journal.externalId;
  const lines = journal.entries ?? journal.lines ?? [];
  return (
    <article className="border border-gray-100 rounded-lg p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="font-medium">{journal.source ?? journal.description}</span>
        <span className="text-gray-500">{when ? new Date(when).toLocaleString() : "—"}</span>
      </div>
      <p className="text-gray-600 mt-1">
        {journal.amount != null ? formatMoney(journal.amount, journal.currency) : null}
        {journal.memo ? ` · ${journal.memo}` : ""}
        {journal.status ? ` · ${journal.status}` : ""}
      </p>
      <p className="font-mono text-xs text-gray-400 mt-1 truncate">{ref}</p>
      <ul className="mt-2 space-y-1 text-xs text-gray-700">
        {lines.map((l) => (
          <li key={l.id}>
            {l.account?.code} {l.account?.title ?? l.account?.name}: Dr {String(l.debit)} Cr{" "}
            {String(l.credit)}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState("dashboard");

  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [pending, setPending] = useState([]);
  const [balances, setBalances] = useState({});
  const [coaBalances, setCoaBalances] = useState({});

  const [memberSearch, setMemberSearch] = useState({ firstName: "", lastName: "", memberId: "" });
  const [searchResults, setSearchResults] = useState([]);
  const [memberSummary, setMemberSummary] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [voucher, setVoucher] = useState(emptyVoucher);
  const [voucherSubmitting, setVoucherSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState({});
  const [actionLoading, setActionLoading] = useState(null);

  const [vendors, setVendors] = useState([]);
  const [vendorBalances, setVendorBalances] = useState({});
  const [saleForm, setSaleForm] = useState({
    vendorCode: "B2C-DEMO",
    grossAmount: "470",
    salesAmount: "70",
    vendorPayableAmount: "400",
    memo: "Demo marketplace sale",
    buyerParticipantId: "",
  });
  const [saleSubmitting, setSaleSubmitting] = useState(false);

  const leafAccounts = useMemo(
    () => accounts.filter((a) => !accounts.some((b) => b.parentId === a.id)),
    [accounts],
  );
  const accountTree = useMemo(() => buildAccountTree(accounts), [accounts]);

  const persistToken = useCallback((t) => {
    setToken(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  const exchangeFirebaseToken = useCallback(
    async (idToken) => {
      const session = await apiFetch("/auth/firebase/session", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
      persistToken(session.accessToken);
      setStaff({ email: session.email, role: session.role });
    },
    [persistToken],
  );

  useEffect(() => {
    if (!firebaseConfigured || !auth) return;
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!token) setStaff(null);
        return;
      }
      try {
        const idToken = await user.getIdToken();
        await exchangeFirebaseToken(idToken);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
        persistToken("");
        await signOut(auth);
      }
    });
  }, [exchangeFirebaseToken, persistToken, token]);

  const fetchBalances = useCallback(
    async (codes) => {
      const entries = await Promise.all(
        codes.map(async (code) => {
          try {
            const res = await apiFetch(`/ledger/accounts/${code}/balance`, { token });
            return [code, res.balance];
          } catch {
            return [code, null];
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    [token],
  );

  const loadCoreData = useCallback(async () => {
    if (!token) return;
    const [acct, jour, pend] = await Promise.all([
      apiFetch("/ledger/accounts", { token }),
      apiFetch("/ledger/journals?limit=30&status=POSTED", { token }),
      apiFetch("/ledger/vouchers/pending", { token }),
    ]);
    setAccounts(acct);
    setJournals(jour);
    setPending(pend);
    const dashBal = await fetchBalances(DASHBOARD_CODES.map((c) => c.code));
    setBalances(dashBal);
  }, [token, fetchBalances]);

  const loadCoaBalances = useCallback(async () => {
    if (!token || accounts.length === 0) return;
    const bal = await fetchBalances(accounts.map((a) => a.code));
    setCoaBalances(bal);
  }, [token, accounts, fetchBalances]);

  useEffect(() => {
    if (!token) return;
    loadCoreData().catch((e) => setError(e.message));
  }, [token, loadCoreData]);

  useEffect(() => {
    if (page === "coa" && token && accounts.length) {
      loadCoaBalances().catch((e) => setError(e.message));
    }
  }, [page, token, accounts.length, loadCoaBalances]);

  const loadVendors = useCallback(async () => {
    if (!token) return;
    const list = await apiFetch("/api/v1/finance/vendors", { token });
    setVendors(list);
    const balEntries = await Promise.all(
      list.map(async (v) => {
        try {
          const b = await apiFetch(`/api/v1/finance/vendors/${encodeURIComponent(v.code)}/ap-balance`, {
            token,
          });
          return [v.code, b.payableBalance];
        } catch {
          return [v.code, null];
        }
      }),
    );
    setVendorBalances(Object.fromEntries(balEntries));
  }, [token]);

  useEffect(() => {
    if (page === "marketplace" && token) {
      loadVendors().catch((e) => setError(e.message));
    }
  }, [page, token, loadVendors]);

  async function submitMarketplaceSale(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaleSubmitting(true);
    try {
      const gross = Number(saleForm.grossAmount);
      const sales = Number(saleForm.salesAmount);
      const payable = Number(saleForm.vendorPayableAmount);
      const externalId = `order:demo:${Date.now()}`;
      await apiFetch("/api/v1/finance/marketplace-sale", {
        method: "POST",
        token,
        body: JSON.stringify({
          externalId,
          occurredAt: new Date().toISOString(),
          currency: "PHP",
          grossAmount: gross,
          salesAmount: sales,
          vendorPayableAmount: payable,
          vendorCode: saleForm.vendorCode,
          buyerParticipantId: saleForm.buyerParticipantId.trim() || undefined,
          memo: saleForm.memo.trim() || undefined,
        }),
      });
      setNotice("Marketplace sale posted to the ledger.");
      await Promise.all([loadCoreData(), loadVendors()]);
      setPage("journals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale post failed");
    } finally {
      setSaleSubmitting(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!firebaseConfigured || !auth) {
        throw new Error("Configure VITE_FIREBASE_* in frontend/.env");
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
      setError(typeof code === "string" ? mapFirebaseAuthError(code) : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    persistToken("");
    setStaff(null);
    setAccounts([]);
    setJournals([]);
    setPending([]);
    setMemberSummary(null);
    setSearchResults([]);
    if (auth) await signOut(auth);
  }

  async function loadMemberSummary(participantId) {
    const summary = await apiFetch(`/integrations/v1/members/${participantId}/summary`, { token });
    setMemberSummary(summary);
  }

  async function searchMembers(e) {
    e.preventDefault();
    setError("");
    setMemberSummary(null);
    setSearchResults([]);
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      const first = memberSearch.firstName.trim();
      const last = memberSearch.lastName.trim();
      const id = memberSearch.memberId.trim();
      if (first) params.set("firstName", first);
      if (last) params.set("lastName", last);
      if (id) params.set("memberId", id);
      if (!first && !last && !id) {
        throw new Error("Enter a last name, first name, or member ID");
      }
      const data = await apiFetch(`/integrations/v1/members/search?${params.toString()}`, { token });
      setSearchResults(data.results ?? []);
      if (data.results?.length === 1 && data.results[0].hasLedgerActivity) {
        await loadMemberSummary(data.results[0].participantId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  async function selectMember(hit) {
    setError("");
    setMemberSummary(null);
    if (!hit.hasLedgerActivity) {
      setError("Member found in WebApp registry but no accounting ledger entries yet.");
      return;
    }
    try {
      await loadMemberSummary(hit.participantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ledger");
    }
  }

  async function approveVoucher(id) {
    setActionLoading(id);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/ledger/vouchers/${id}/approve`, { method: "POST", token });
      setNotice("Voucher approved and posted.");
      await loadCoreData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectVoucher(id) {
    const reason = (rejectReason[id] ?? "").trim();
    if (!reason) {
      setError("Enter a rejection reason.");
      return;
    }
    setActionLoading(id);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/ledger/vouchers/${id}/reject`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason }),
      });
      setNotice("Voucher rejected.");
      await loadCoreData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function submitVoucher(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setVoucherSubmitting(true);
    try {
      const entries = voucher.entries
        .filter((row) => row.accountId && (row.debit || row.credit))
        .map((row) => ({
          accountId: row.accountId,
          debit: Number(row.debit) || 0,
          credit: Number(row.credit) || 0,
        }));
      if (entries.length < 2) throw new Error("Add at least two journal lines.");
      await apiFetch("/ledger/vouchers", {
        method: "POST",
        token,
        body: JSON.stringify({
          date: voucher.date,
          reference: voucher.reference.trim(),
          description: voucher.description.trim(),
          entries,
        }),
      });
      setNotice("Voucher submitted for treasurer approval.");
      setVoucher(emptyVoucher());
      await loadCoreData();
      setPage("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setVoucherSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md bg-white rounded-xl shadow-sm border p-8 space-y-4"
          style={{ borderColor: "var(--b2c-border)" }}
        >
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--b2c-forest-950)" }}>
              B2CCoop Accounting
            </h1>
            <p className="text-sm mt-1 text-slate-600">Treasurer &amp; admin sign-in (Firebase)</p>
          </div>
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg text-white py-2.5 font-medium disabled:opacity-60 hover:opacity-95"
            style={{ background: "var(--b2c-forest-900)" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="w-full text-sm underline"
            style={{ color: "var(--b2c-forest-700)" }}
            disabled={loading || !email.trim()}
            onClick={async () => {
              setError("");
              try {
                if (!auth) throw new Error("Firebase not configured");
                await sendPasswordResetEmail(auth, email.trim().toLowerCase());
                setError("Password reset email sent — check your inbox.");
              } catch (err) {
                const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
                setError(typeof code === "string" ? mapFirebaseAuthError(code) : "Could not send reset email");
              }
            }}
          >
            Forgot password?
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0"
        style={{
          background: "linear-gradient(to bottom right, var(--b2c-forest-900), var(--b2c-forest-800), #0f172a)",
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">B2CCoop Accounting</h1>
          <p className="text-sm text-white/80">
            {staff?.email ?? "Staff"} · {staff?.role ?? "staff"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
        >
          Sign out
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav
          className="w-52 shrink-0 border-r bg-white p-4 hidden md:block"
          style={{ borderColor: "var(--b2c-border)" }}
        >
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPage(item.id);
                    setError("");
                    setNotice("");
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    page === item.id
                      ? "text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  style={page === item.id ? { background: "var(--b2c-forest-900)" } : undefined}
                >
                  {item.label}
                  {item.id === "pending" && pending.length > 0 ? (
                    <span className="ml-2 inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-500 px-1.5 text-xs text-white">
                      {pending.length}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="md:hidden flex flex-wrap gap-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  page === item.id ? "text-white" : "bg-white border text-slate-700"
                }`}
                style={
                  page === item.id
                    ? { background: "var(--b2c-forest-900)" }
                    : { borderColor: "var(--b2c-border)" }
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          {page === "dashboard" && (
            <section className="space-y-6">
              <h2 className="text-lg font-semibold">Treasurer dashboard</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {DASHBOARD_CODES.map(({ code, label }) => (
                  <div
                    key={code}
                    className="bg-white rounded-xl border p-4 shadow-sm"
                    style={{ borderColor: "var(--b2c-border)" }}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">
                      {balances[code] != null ? formatMoney(balances[code]) : "…"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 font-mono">{code}</p>
                  </div>
                ))}
              </div>
              <div
                className="bg-white rounded-xl border p-4 shadow-sm"
                style={{ borderColor: "var(--b2c-border)" }}
              >
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{pending.length}</span> voucher
                  {pending.length === 1 ? "" : "s"} awaiting approval
                </p>
                {pending.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPage("pending")}
                    className="mt-2 text-sm font-medium underline"
                    style={{ color: "var(--b2c-forest-900)" }}
                  >
                    Review pending queue
                  </button>
                )}
              </div>
            </section>
          )}

          {page === "pending" && (
            <section
              className="bg-white rounded-xl border p-6 shadow-sm space-y-4"
              style={{ borderColor: "var(--b2c-border)" }}
            >
              <h2 className="text-lg font-semibold">Pending approval</h2>
              {pending.length === 0 && (
                <p className="text-sm text-gray-500">No vouchers waiting for treasurer approval.</p>
              )}
              {pending.map((v) => {
                const totalDr = (v.entries ?? []).reduce((s, l) => s + Number(l.debit), 0);
                return (
                  <article key={v.id} className="border rounded-lg p-4 space-y-3" style={{ borderColor: "var(--b2c-border)" }}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-medium">{v.description}</p>
                        <p className="text-xs text-gray-500 font-mono">{v.reference}</p>
                      </div>
                      <p className="text-sm text-gray-600">
                        {v.transactionDate ? new Date(v.transactionDate).toLocaleDateString() : "—"} ·{" "}
                        {formatMoney(totalDr)}
                      </p>
                    </div>
                    <ul className="text-xs space-y-1 text-gray-700">
                      {(v.entries ?? []).map((l) => (
                        <li key={l.id}>
                          {l.account?.code} {l.account?.title}: Dr {String(l.debit)} Cr {String(l.credit)}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2 items-end">
                      <button
                        type="button"
                        disabled={actionLoading === v.id}
                        onClick={() => approveVoucher(v.id)}
                        className="rounded-lg text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                        style={{ background: "var(--b2c-forest-900)" }}
                      >
                        Approve &amp; post
                      </button>
                      <input
                        type="text"
                        placeholder="Rejection reason"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[12rem] flex-1"
                        value={rejectReason[v.id] ?? ""}
                        onChange={(ev) =>
                          setRejectReason((r) => ({ ...r, [v.id]: ev.target.value }))
                        }
                      />
                      <button
                        type="button"
                        disabled={actionLoading === v.id}
                        onClick={() => rejectVoucher(v.id)}
                        className="rounded-lg border border-red-200 text-red-700 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {page === "voucher" && (
            <section
              className="bg-white rounded-xl border p-6 shadow-sm"
              style={{ borderColor: "var(--b2c-border)" }}
            >
              <h2 className="text-lg font-semibold mb-4">New voucher</h2>
              <form onSubmit={submitVoucher} className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="block text-sm font-medium">
                    Date
                    <input
                      type="date"
                      required
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      value={voucher.date}
                      onChange={(ev) => setVoucher((v) => ({ ...v, date: ev.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium sm:col-span-2">
                    Reference
                    <input
                      required
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                      value={voucher.reference}
                      onChange={(ev) => setVoucher((v) => ({ ...v, reference: ev.target.value }))}
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Description
                  <input
                    required
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={voucher.description}
                    onChange={(ev) => setVoucher((v) => ({ ...v, description: ev.target.value }))}
                  />
                </label>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Journal lines</p>
                  {voucher.entries.map((row, idx) => (
                    <div key={idx} className="grid sm:grid-cols-4 gap-2">
                      <select
                        required={idx < 2}
                        className="sm:col-span-2 rounded-lg border border-gray-200 px-2 py-2 text-sm"
                        value={row.accountId}
                        onChange={(ev) => {
                          const accountId = ev.target.value;
                          setVoucher((v) => ({
                            ...v,
                            entries: v.entries.map((e, i) => (i === idx ? { ...e, accountId } : e)),
                          }));
                        }}
                      >
                        <option value="">Select account</option>
                        {leafAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.title}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Debit"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        value={row.debit}
                        onChange={(ev) => {
                          const debit = ev.target.value;
                          setVoucher((v) => ({
                            ...v,
                            entries: v.entries.map((e, i) => (i === idx ? { ...e, debit } : e)),
                          }));
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Credit"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        value={row.credit}
                        onChange={(ev) => {
                          const credit = ev.target.value;
                          setVoucher((v) => ({
                            ...v,
                            entries: v.entries.map((e, i) => (i === idx ? { ...e, credit } : e)),
                          }));
                        }}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm underline"
                    style={{ color: "var(--b2c-forest-700)" }}
                    onClick={() =>
                      setVoucher((v) => ({
                        ...v,
                        entries: [...v.entries, { accountId: "", debit: "", credit: "" }],
                      }))
                    }
                  >
                    + Add line
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={voucherSubmitting}
                  className="rounded-lg text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                  style={{ background: "var(--b2c-forest-900)" }}
                >
                  {voucherSubmitting ? "Submitting…" : "Submit for approval"}
                </button>
              </form>
            </section>
          )}

          {page === "marketplace" && (
            <section
              className="bg-white rounded-xl border p-6 shadow-sm space-y-6"
              style={{ borderColor: "var(--b2c-border)" }}
            >
              <div>
                <h2 className="text-lg font-semibold">Marketplace (Phase 2)</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Posts a balanced sale: Dr Cash · Cr Sales (40310) · Cr Vendor AP (21210). Store checkout will call the
                  same API.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Vendors</h3>
                <ul className="space-y-2 text-sm">
                  {vendors.map((v) => (
                    <li key={v.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--b2c-border)" }}>
                      <span className="font-mono text-xs text-gray-500">{v.code}</span> — {v.name}
                      {vendorBalances[v.code] != null ? (
                        <span className="block text-xs mt-1">
                          AP balance (21210): {formatMoney(vendorBalances[v.code])}
                        </span>
                      ) : null}
                      {v.products?.length ? (
                        <span className="block text-xs text-gray-500 mt-1">
                          {v.products.map((p) => `${p.sku} ₱${p.unitPrice}`).join(" · ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
              <form onSubmit={submitMarketplaceSale} className="space-y-3 max-w-lg">
                <h3 className="text-sm font-semibold">Post demo sale</h3>
                <label className="block text-sm font-medium">
                  Vendor
                  <select
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={saleForm.vendorCode}
                    onChange={(ev) => setSaleForm((s) => ({ ...s, vendorCode: ev.target.value }))}
                  >
                    {vendors.map((v) => (
                      <option key={v.id} value={v.code}>
                        {v.code} — {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-sm font-medium">
                    Gross
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                      value={saleForm.grossAmount}
                      onChange={(ev) => setSaleForm((s) => ({ ...s, grossAmount: ev.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Coop sales
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                      value={saleForm.salesAmount}
                      onChange={(ev) => setSaleForm((s) => ({ ...s, salesAmount: ev.target.value }))}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Vendor AP
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                      value={saleForm.vendorPayableAmount}
                      onChange={(ev) => setSaleForm((s) => ({ ...s, vendorPayableAmount: ev.target.value }))}
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Buyer participant UUID (optional)
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                    value={saleForm.buyerParticipantId}
                    onChange={(ev) => setSaleForm((s) => ({ ...s, buyerParticipantId: ev.target.value }))}
                  />
                </label>
                <button
                  type="submit"
                  disabled={saleSubmitting}
                  className="rounded-lg text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                  style={{ background: "var(--b2c-forest-900)" }}
                >
                  {saleSubmitting ? "Posting…" : "Post marketplace sale"}
                </button>
              </form>
            </section>
          )}

          {page === "members" && (
            <section
              className="bg-white rounded-xl border p-6 shadow-sm"
              style={{ borderColor: "var(--b2c-border)" }}
            >
              <h2 className="text-lg font-semibold mb-3">Member sub-ledger</h2>
              <p className="text-sm text-gray-600 mb-4">
                Search by last name, first name, or B2C member ID. Results come from the WebApp registry.
              </p>
              <form onSubmit={searchMembers} className="grid sm:grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Last name
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={memberSearch.lastName}
                    onChange={(ev) => setMemberSearch((s) => ({ ...s, lastName: ev.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium">
                  First name
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={memberSearch.firstName}
                    onChange={(ev) => setMemberSearch((s) => ({ ...s, firstName: ev.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  Member ID
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                    value={memberSearch.memberId}
                    onChange={(ev) => setMemberSearch((s) => ({ ...s, memberId: ev.target.value }))}
                  />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="rounded-lg text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                    style={{ background: "var(--b2c-forest-900)" }}
                  >
                    {searchLoading ? "Searching…" : "Search member"}
                  </button>
                </div>
              </form>
              {searchResults.length > 1 && (
                <ul className="mt-4 space-y-2">
                  {searchResults.map((hit) => (
                    <li key={hit.participantId}>
                      <button
                        type="button"
                        onClick={() => selectMember(hit)}
                        className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                        style={{ borderColor: "var(--b2c-border)" }}
                      >
                        <span className="font-medium">{hit.fullName || "Unknown name"}</span>
                        {hit.memberIdNo ? (
                          <span className="ml-2 font-mono text-xs text-gray-500">{hit.memberIdNo}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {memberSummary && (
                <dl className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500">Share capital balance</dt>
                    <dd className="font-semibold">
                      {formatMoney(memberSummary.shareCapitalBalance, memberSummary.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Cash received (ledger)</dt>
                    <dd className="font-semibold">
                      {formatMoney(memberSummary.cashReceivedTotal, memberSummary.currency)}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          )}

          {page === "coa" && (
            <section
              className="bg-white rounded-xl border p-6 shadow-sm overflow-x-auto"
              style={{ borderColor: "var(--b2c-border)" }}
            >
              <h2 className="text-lg font-semibold mb-3">Chart of accounts</h2>
              <table className="w-full text-sm min-w-[32rem]">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 text-right">Balance (posted)</th>
                  </tr>
                </thead>
                <tbody>
                  {accountTree.map((node) => (
                    <CoaRow key={node.id} node={node} depth={0} balances={coaBalances} />
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {page === "journals" && (
            <section
              className="bg-white rounded-xl border p-6 shadow-sm space-y-4"
              style={{ borderColor: "var(--b2c-border)" }}
            >
              <h2 className="text-lg font-semibold">Posted journals</h2>
              {journals.length === 0 && (
                <p className="text-sm text-gray-500">No entries yet — WebApp posts via integration API.</p>
              )}
              {journals.map((j) => (
                <JournalCard key={j.id} journal={j} />
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
