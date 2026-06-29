"use client";

import { useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { adminBookings } from "@/lib/adminData";
import RefundPanel from "@/components/admin/payments/RefundPanel";

const statusStyles: Record<string, string> = {
  Settled: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  Refunded: "bg-red-100 text-red-600",
};

export default function TransactionsTable() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof adminBookings)[number] | null>(
    null
  );

  const filtered = adminBookings.filter(
    (b) =>
      b.customer.toLowerCase().includes(query.toLowerCase()) ||
      b.id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Payments &amp; Financials</h2>
          <p className="text-sm text-ink/50">
            Monitor revenue, reconcile GCash logs, and manage customer refunds.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            <Plus className="h-4 w-4" /> New Adjustment
          </button>
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
          <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            All Branches
          </button>
          <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            Status: All
          </button>
        </div>
      </div>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-ink/40">
            <th className="py-2">Booking ID</th>
            <th className="py-2">Customer &amp; Date</th>
            <th className="py-2">Method</th>
            <th className="py-2">Amount</th>
            <th className="py-2">Status</th>
            <th className="py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((b) => (
            <tr key={b.id} className="border-t border-ink/5">
              <td className="py-3 font-medium text-ink">{b.id}</td>
              <td className="py-3">
                <p className="text-ink">{b.customer}</p>
                <p className="text-xs text-ink/50">{b.date}</p>
              </td>
              <td className="py-3 text-ink/70">{b.method}</td>
              <td className="py-3 font-medium text-ink">{b.amount}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[b.status]}`}
                >
                  {b.status}
                </span>
              </td>
              <td className="py-3">
                <button
                  onClick={() => setSelected(b)}
                  className="text-xs font-semibold text-coral-dark hover:underline"
                >
                  Refund
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-sm text-ink/50">
        Showing {filtered.length} of 1,248 transactions
      </p>

      {selected && (
        <RefundPanel booking={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
