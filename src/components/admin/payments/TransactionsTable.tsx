"use client";

import { useState } from "react";
import { BellRing, Check, Search, X } from "lucide-react";
import { paymentNoticeText, PAYMENT_NOTICE_MAX, type PaymentNoticePreset } from "@/lib/paymentNotice";
import type { AdminPaymentRow } from "@/lib/supabase/queries/adminPayments";

const statusStyles: Record<string, string> = {
  settled: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  refunded: "bg-red-100 text-red-600",
  failed: "bg-red-100 text-red-600",
};

const methodLabels: Record<string, string> = {
  gcash: "GCash",
  cash: "Cash",
};

export default function TransactionsTable({
  payments,
}: {
  payments: AdminPaymentRow[];
}) {
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [statusFilter, setStatusFilter] = useState("All");
  // "Notify client" on pending payments.
  const [notify, setNotify] = useState<AdminPaymentRow | null>(null);
  const [notified, setNotified] = useState<Record<string, true>>({});

  const branches = Array.from(new Set(payments.map((p) => p.branchName)));

  const filtered = payments.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.clientName.toLowerCase().includes(q) ||
      (p.reference_no ?? "").toLowerCase().includes(q) ||
      (p.bookingCode ?? "").toLowerCase().includes(q);
    const matchesBranch = branchFilter === "All Branches" || p.branchName === branchFilter;
    const matchesStatus = statusFilter === "All" || p.status === statusFilter.toLowerCase();
    return matchesQuery && matchesBranch && matchesStatus;
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Payments &amp; Financials</h2>
          <p className="text-sm text-ink/50">Real transactions recorded across both branches.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Reference ID, Customer, or Booking ID..."
            className="w-64 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 outline-none focus:border-coral"
          >
            <option>All Branches</option>
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 outline-none focus:border-coral"
          >
            <option>All</option>
            <option>Settled</option>
            <option>Pending</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">No transactions match these filters.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-ink/40">
              <th className="py-2">Booking</th>
              <th className="py-2">Customer &amp; Branch</th>
              <th className="py-2">Method</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Status</th>
              <th className="py-2 text-right">Client</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-ink/5">
                <td className="py-3 font-medium text-ink">{p.bookingCode ?? "—"}</td>
                <td className="py-3">
                  <p className="text-ink">{p.clientName}</p>
                  <p className="text-xs text-ink/50">
                    {p.branchName} · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </td>
                <td className="py-3 text-ink/70">{methodLabels[p.method] ?? p.method}</td>
                <td className="py-3 font-medium text-ink">₱{p.amount.toLocaleString()}</td>
                <td className="py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[p.status] ?? "bg-ink/10 text-ink/50"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {p.status === "pending" &&
                    (notified[p.id] ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                        <Check className="h-3.5 w-3.5" /> Notified
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNotify(p)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-coral/50 px-3 py-1.5 text-xs font-semibold text-coral-dark transition hover:bg-coral hover:text-white"
                      >
                        <BellRing className="h-3.5 w-3.5" /> Notify client
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-sm text-ink/50">
        Showing {filtered.length} of {payments.length} transactions
      </p>

      {notify && (
        <NotifyDialog
          payment={notify}
          onClose={() => setNotify(null)}
          onSent={() => {
            setNotified((n) => ({ ...n, [notify.id]: true }));
            setNotify(null);
          }}
        />
      )}
    </div>
  );
}

/** Pick a wording (or write your own) and send it to the client's bell, email and phone. */
function NotifyDialog({ payment: p, onClose, onSent }: { payment: AdminPaymentRow; onClose: () => void; onSent: () => void }) {
  const [preset, setPreset] = useState<PaymentNoticePreset>(p.method === "gcash" ? "verifying" : "complete");
  const textFor = (k: PaymentNoticePreset) => paymentNoticeText(k, { amount: p.amount, bookingCode: p.bookingCode, method: p.method, branchName: p.branchName });
  const [message, setMessage] = useState(() => textFor(p.method === "gcash" ? "verifying" : "complete"));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: p.id, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't send the notice.");
      else onSent();
    } catch {
      setError("Network error — please try again.");
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Notify client">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-coral-dark">Notify client</p>
            <h3 className="text-lg font-semibold text-ink">{p.clientName}</h3>
            <p className="text-sm text-ink/55">
              {p.bookingCode ?? "No booking code"} · ₱{p.amount.toLocaleString()} · {methodLabels[p.method] ?? p.method} · {p.branchName}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-full bg-cream p-1 text-sm">
          {(
            [
              ["verifying", "We're verifying it"],
              ["complete", "Please complete it"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setPreset(k);
                setMessage(textFor(k));
              }}
              className={`rounded-full py-1.5 font-semibold transition ${preset === k ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-ink/75">
          <span className="flex items-baseline justify-between">
            Message <span className="text-xs font-normal text-ink/40">{message.length}/{PAYMENT_NOTICE_MAX}</span>
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, PAYMENT_NOTICE_MAX))}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-xl border border-[#e8dcc0] px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/15"
          />
        </label>
        <p className="mt-2 text-xs text-ink/50">Goes to the client&apos;s GlowSync bell, and by email and phone notification when they&apos;ve turned those on. It opens this booking.</p>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/30">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !message.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" /> {sending ? "Sending…" : "Send notice"}
          </button>
        </div>
      </div>
    </div>
  );
}
