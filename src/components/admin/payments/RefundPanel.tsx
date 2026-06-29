"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { adminBookings } from "@/lib/adminData";

type Booking = (typeof adminBookings)[number];

export default function RefundPanel({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(booking.amount.replace(/[₱,]/g, ""));
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Secure Refund Workflow</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-ink/40">
            Customer Information
          </p>
          <p className="mt-2 font-medium text-ink">
            {booking.customer.toUpperCase()}
          </p>
          <p className="text-sm text-ink/50">
            {booking.customer.toLowerCase().replace(" ", ".")}@glowsync.com
          </p>
        </div>

        <div className="mt-4 rounded-xl bg-blush p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/50">Payment Method</span>
            <span className="font-medium text-ink">
              {booking.method === "GCash" ? "GCash Direct (E-Wallet)" : booking.method}
            </span>
          </div>
          {booking.method === "GCash" && (
            <div className="mt-1 flex justify-between">
              <span className="text-ink/50">Provider Details</span>
              <span className="font-medium text-ink">Gateway: PayMongo v2.1</span>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Booking ID
            </label>
            <input
              readOnly
              value={booking.id}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-ink/5 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Refund Amount (PHP)
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Reason for Refund
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer cancellation > 24h, Staff unavailability..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <p className="text-xs text-ink/40">
            All refunds require a valid reason code and are logged in the
            admin audit trail.
          </p>
        </div>

        <div className="mt-6 flex gap-3 border-t border-ink/10 pt-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Process Refund
          </button>
        </div>
      </div>
    </div>
  );
}
