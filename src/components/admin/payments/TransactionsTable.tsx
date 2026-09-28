"use client";

import { useState } from "react";
import { Search } from "lucide-react";
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-sm text-ink/50">
        Showing {filtered.length} of {payments.length} transactions
      </p>
    </div>
  );
}
