"use client";

import { X } from "lucide-react";
import { cashReceiptNo, type CashPaymentRow } from "@/lib/supabase/queries/frontdeskPayments";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CashPaymentDetailModal({
  payment,
  onClose,
}: {
  payment: CashPaymentRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <div className="flex items-start justify-between">
          <h2 className="font-semibold text-ink">Cash Receipt</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-ink/10 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/50">Receipt No.</span>
            <span className="font-medium text-ink">{cashReceiptNo(payment.id)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Client</span>
            <span className="font-medium text-ink">{payment.clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Service</span>
            <span className="font-medium text-ink">{payment.serviceName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Staff</span>
            <span className="font-medium text-ink">{payment.staffName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Date & Time</span>
            <span className="font-medium text-ink">{formatDateTime(payment.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Method</span>
            <span className="font-medium text-ink">Cash</span>
          </div>
          <div className="flex justify-between border-t border-ink/10 pt-2 font-semibold">
            <span className="text-ink">Amount</span>
            <span className="text-amber-600">₱{payment.amount.toLocaleString()}.00</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30"
        >
          Close
        </button>
      </div>
    </div>
  );
}
