"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CreditCard, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOnlinePayments, type OnlinePayment } from "@/lib/supabase/queries/payNow";
import { dateRange, matchesPaymentSearch, type DateFilter } from "@/lib/onlinePaymentsFilter";
import { pesoAmount } from "@/lib/payNow";
import { formatAppointmentTime } from "@/lib/appointmentFormat";
import ReceiptViewer from "@/components/frontdesk/payments/ReceiptViewer";

const FILTERS: { key: DateFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom Date" },
];

function stamp(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function longStamp(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function apptStamp(p: OnlinePayment, long = false) {
  if (!p.scheduledDate) return "—";
  const [y, m, d] = p.scheduledDate.split("-").map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString("en-US", long ? { month: "long", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
  return `${date}${p.startTime ? `, ${formatAppointmentTime(p.startTime)}` : ""}`;
}

export function paymentStatus(p: Pick<OnlinePayment, "status" | "paymentType">): { label: string; style: string } {
  if (p.status === "settled") return { label: "Verified", style: "bg-green-100 text-green-700" };
  if (p.status === "pending") return { label: p.paymentType === "pay_now" ? "Payment Submitted" : "Pending", style: "bg-amber-100 text-amber-700" };
  if (p.status === "failed") return { label: "Not Received", style: "bg-red-100 text-red-600" };
  if (p.status === "refunded") return { label: "Refunded", style: "bg-ink/10 text-ink/60" };
  return { label: p.status, style: "bg-ink/10 text-ink/60" };
}

function typeLabel(p: OnlinePayment) {
  return p.paymentType === "pay_now" ? "GCash — Pay Now" : "GCash";
}

/** Payments → Online Payments: real GCash payments with search, date
 * filters and a details view with the attached receipt. */
export default function OnlinePaymentsTable({ branchId }: { branchId?: string | null }) {
  const [filter, setFilter] = useState<DateFilter>("today");
  const [custom, setCustom] = useState(() => {
    const t = new Date();
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    return { from: key, to: key };
  });
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<OnlinePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrated, setMigrated] = useState(true);
  const [selected, setSelected] = useState<OnlinePayment | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const { from, to } = dateRange(filter, new Date(), custom);
    const res = await getOnlinePayments(createClient(), { fromIso: from.toISOString(), toIso: to.toISOString(), branchId });
    if (mine !== seq.current) return;
    setRows(res.rows);
    setMigrated(res.migrated);
    setLoading(false);
  }, [filter, custom, branchId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const supabase = createClient();
    const channel = supabase
      .channel(`online-payments-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const visible = useMemo(() => rows.filter((r) => matchesPaymentSearch(r, query)), [rows, query]);
  const verifiedTotal = visible.filter((r) => r.status === "settled").reduce((s, r) => s + r.amount, 0);
  const waiting = visible.filter((r) => r.status === "pending").length;

  // Keep an open details view in sync with live updates.
  const current = selected ? rows.find((r) => r.id === selected.id) ?? selected : null;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <CreditCard className="h-4 w-4" />
            </span>
            Online Payments
          </h2>
          <p className="mt-1 text-xs text-ink/50">GCash payments from Pay Now bookings and the Front Desk</p>
        </div>
        <div className="flex items-center divide-x divide-ink/10 text-right">
          <div className="px-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Waiting Verification</p>
            <p className="text-lg font-semibold text-amber-600">{waiting}</p>
          </div>
          <div className="px-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Verified Total</p>
            <p className="text-lg font-semibold text-teal-600">{pesoAmount(verifiedTotal)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-56 flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, sender, reference, service or amount…"
            aria-label="Search payments"
            className="w-full text-sm text-ink outline-none placeholder:text-ink/40"
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => {
              setLoading(true);
              setFilter(f.key);
            }}
            className={`rounded-full border px-3 py-1.5 font-medium transition ${
              filter === f.key ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral"
            }`}
          >
            {f.label}
          </button>
        ))}
        {filter === "custom" && (
          <span className="flex items-center gap-1.5">
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              aria-label="From date"
              className="rounded-lg border border-ink/15 px-2 py-1 text-xs"
            />
            <span className="text-ink/40">to</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              aria-label="To date"
              className="rounded-lg border border-ink/15 px-2 py-1 text-xs"
            />
          </span>
        )}
      </div>

      {!migrated && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          Online payments will appear here once the Pay Now update (migration 059) is applied.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-xs text-ink/40">
              <th className="py-2 font-medium">Paid Date &amp; Time</th>
              <th className="py-2 font-medium">Client</th>
              <th className="py-2 font-medium">Reference</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 pl-4 font-medium">Method</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Appointment</th>
              <th className="py-2 font-medium" aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink/40">Loading…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink/40">
                  {query ? "No payments match your search." : "No online payments for this period."}
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((p) => {
                const st = paymentStatus(p);
                return (
                  <tr key={p.id} className="cursor-pointer border-t border-ink/5 hover:bg-blush/30" onClick={() => setSelected(p)}>
                    <td className="whitespace-nowrap py-3 text-ink/60">{stamp(p.createdAt)}</td>
                    <td className="py-3 font-medium text-ink">{p.clientName}</td>
                    <td className="py-3 font-mono text-xs text-ink/60">{p.referenceNo ?? "—"}</td>
                    <td className="whitespace-nowrap py-3 text-right font-semibold text-ink">{pesoAmount(p.amount)}</td>
                    <td className="py-3 pl-4 text-ink/60">{p.paymentType === "pay_now" ? "GCash · Pay Now" : "GCash"}</td>
                    <td className="py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${st.style}`}>{st.label}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 text-ink/60">{apptStamp(p)}</td>
                    <td className="py-3 text-right">
                      <button type="button" className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink/70 hover:border-coral">
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {current && <PaymentDetailsModal payment={current} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PaymentDetailsModal({ payment: p, onClose }: { payment: OnlinePayment; onClose: () => void }) {
  const st = paymentStatus(p);
  const rows: [string, string][] = [
    ["Client", p.clientName],
    ["Appointment", apptStamp(p, true)],
    ["Service", p.serviceName],
    ["Staff", p.staffName ?? "—"],
    ["Branch", p.branchName ?? "—"],
    ["Amount", pesoAmount(p.amount)],
    ["Payment Method", "GCash"],
    ["Payment Type", p.paymentType === "pay_now" ? "Pay Now" : "At the branch"],
    ["Reference No.", p.referenceNo ?? "—"],
    ["Sender", p.senderName ?? "—"],
    ["Paid Date & Time", longStamp(p.createdAt)],
    [p.status === "failed" ? "Checked Date & Time" : "Verified Date & Time", longStamp(p.verifiedAt)],
    [p.status === "failed" ? "Checked By" : "Verified By", p.verifiedByName ?? "—"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Payment details"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink">Payment Details</h3>
            <p className="text-xs text-ink/50">{typeLabel(p)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.style}`}>
              {p.status === "settled" ? "🟢 " : ""}
              {st.label}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-ink/5 rounded-xl border border-ink/10 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-ink/50">{k}</dt>
              <dd className="text-right font-medium text-ink">{v}</dd>
            </div>
          ))}
          {p.status === "failed" && p.rejectedReason && (
            <div className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-ink/50">Reason</dt>
              <dd className="text-right font-medium text-red-600">{p.rejectedReason}</dd>
            </div>
          )}
        </dl>

        {p.receiptPath && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-ink">Uploaded GCash Receipt</p>
            <ReceiptViewer path={p.receiptPath} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/frontdesk/appointments?id=${p.appointmentId}`}
            className="w-full rounded-full border border-ink/15 px-4 py-2 text-center text-sm font-semibold text-ink/70 hover:border-coral"
          >
            Open Appointment
          </Link>
        </div>
      </div>
    </div>
  );
}
