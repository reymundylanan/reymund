"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import type { GCashTransaction } from "@/lib/frontdeskData";

export default function MatchPaymentModal({
  transaction,
  onClose,
  onApprove,
}: {
  transaction: GCashTransaction;
  onClose: () => void;
  onApprove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Verify &amp; Match Payment</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-ink/50">
          Live GCash Reference #{transaction.reference} is yet to be matched.
        </p>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase text-ink/40">
            Search Existing Booking
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-2">
            <Search className="h-4 w-4 text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by Client Name or Booking ID..."
              className="w-full text-sm outline-none"
            />
          </div>
        </div>

        {transaction.suggestedClient && (
          <div className="mt-4 rounded-xl border border-coral/40 bg-blush p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-ink/40">
                Suggested Match (based on name)
              </p>
              <span className="rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-white">
                {transaction.matchConfidence}% Match
              </span>
            </div>
            <p className="mt-2 font-medium text-ink">
              {transaction.suggestedClient}
            </p>
            <p className="text-sm text-ink/60">
              Appointment #{transaction.suggestedBookingId} &bull;{" "}
              {transaction.suggestedTime}
            </p>
          </div>
        )}

        <p className="mt-4 text-xs text-ink/40">
          Confirming this will mark Appointment #{transaction.suggestedBookingId}{" "}
          as fully paid and notify the therapist of check-in readiness.
        </p>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
          >
            Cancel
          </button>
          <button
            onClick={() => onApprove(transaction.id)}
            className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            Complete Match &amp; Approve
          </button>
        </div>
      </div>
    </div>
  );
}
