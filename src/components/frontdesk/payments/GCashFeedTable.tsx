"use client";

import { useState } from "react";
import { CreditCard, Link2, Search } from "lucide-react";
import { gcashFeed, type GCashTransaction } from "@/lib/frontdeskData";
import MatchPaymentModal from "@/components/frontdesk/payments/MatchPaymentModal";

export default function GCashFeedTable() {
  const [transactions, setTransactions] = useState(gcashFeed);
  const [selected, setSelected] = useState<GCashTransaction | null>(null);

  function approveMatch(id: string) {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "verified" } : t))
    );
    setSelected(null);
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <CreditCard className="h-4 w-4" />
            </span>
            Incoming GCash Feed
          </h2>
          <p className="mt-1 text-xs text-ink/50">
            Verify and match digital payments to bookings
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            History
          </button>
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <Search className="h-4 w-4" /> Find Ref
          </button>
        </div>
      </div>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-ink/40">
            <th className="py-2 font-medium">Reference No.</th>
            <th className="py-2 font-medium">Sender Name</th>
            <th className="py-2 font-medium">Amount</th>
            <th className="py-2 font-medium">Time</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-t border-ink/5">
              <td className="py-3 font-medium text-ink">{t.reference}</td>
              <td className="py-3 text-ink/70">{t.sender}</td>
              <td className="py-3 font-medium text-teal-600">
                ₱{t.amount.toLocaleString()}
              </td>
              <td className="py-3 text-ink/50">{t.time}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    t.status === "verified"
                      ? "bg-green-100 text-green-700"
                      : "bg-teal-50 text-teal-700"
                  }`}
                >
                  {t.status}
                </span>
              </td>
              <td className="py-3">
                {t.status === "unmatched" ? (
                  <button
                    onClick={() => setSelected(t)}
                    className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Match
                  </button>
                ) : (
                  <span className="text-xs font-medium text-ink/40">Linked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <MatchPaymentModal
          transaction={selected}
          onClose={() => setSelected(null)}
          onApprove={approveMatch}
        />
      )}
    </div>
  );
}
