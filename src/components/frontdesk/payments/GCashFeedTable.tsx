"use client";

import { useState } from "react";
import { Search, UserPlus2 } from "lucide-react";
import { gcashFeed, type GCashTransaction } from "@/lib/frontdeskData";
import MatchPaymentModal from "@/components/frontdesk/payments/MatchPaymentModal";
import WalkinModal from "@/components/frontdesk/payments/WalkinModal";

export default function GCashFeedTable() {
  const [transactions, setTransactions] = useState(gcashFeed);
  const [selected, setSelected] = useState<GCashTransaction | null>(null);
  const [showWalkin, setShowWalkin] = useState(false);

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
          <h2 className="font-semibold text-ink">Incoming GCash Feed</h2>
          <p className="text-xs text-ink/50">
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
          <button
            onClick={() => setShowWalkin(true)}
            className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            <UserPlus2 className="h-4 w-4" /> Walk-in Registration
          </button>
        </div>
      </div>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-ink/40">
            <th className="py-2">Reference No.</th>
            <th className="py-2">Sender Name</th>
            <th className="py-2">Amount</th>
            <th className="py-2">Time</th>
            <th className="py-2">Status</th>
            <th className="py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-t border-ink/5">
              <td className="py-3 font-medium text-ink">{t.reference}</td>
              <td className="py-3 text-ink/70">{t.sender}</td>
              <td className="py-3 font-medium text-ink">
                ₱{t.amount.toLocaleString()}
              </td>
              <td className="py-3 text-ink/50">{t.time}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    t.status === "verified"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {t.status}
                </span>
              </td>
              <td className="py-3">
                {t.status === "unmatched" ? (
                  <button
                    onClick={() => setSelected(t)}
                    className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark"
                  >
                    Match
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
      {showWalkin && <WalkinModal onClose={() => setShowWalkin(false)} />}
    </div>
  );
}
