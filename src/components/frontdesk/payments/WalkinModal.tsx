"use client";

import { useState } from "react";
import { Banknote, Smartphone, X } from "lucide-react";

export default function WalkinModal({ onClose }: { onClose: () => void }) {
  const [method, setMethod] = useState<"gcash" | "cash">("gcash");
  const [fee, setFee] = useState(0);
  const [discount, setDiscount] = useState(0);

  const total = Math.max(fee - discount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">New Walk-in Registration</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-ink/50">
          Capture client details and assign service providers.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Client Name
            </label>
            <input
              placeholder="e.g. Maria Clara"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Contact Number
            </label>
            <input
              placeholder="09XX XXX XXXX"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Desired Service
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Staff Assignment
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
        </div>

        <p className="mt-4 text-xs font-semibold uppercase text-ink/40">
          Payment Details
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMethod("gcash")}
            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium ${
              method === "gcash" ? "border-coral bg-blush text-coral-dark" : "border-ink/10 text-ink/60"
            }`}
          >
            <Smartphone className="h-4 w-4" /> GCash Transfer
          </button>
          <button
            onClick={() => setMethod("cash")}
            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium ${
              method === "cash" ? "border-coral bg-blush text-coral-dark" : "border-ink/10 text-ink/60"
            }`}
          >
            <Banknote className="h-4 w-4" /> Cash Payment
          </button>
        </div>

        <div className="mt-3 space-y-2 rounded-xl border border-ink/10 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink/50">Service Fee</span>
            <input
              type="number"
              value={fee}
              onChange={(e) => setFee(Number(e.target.value) || 0)}
              className="w-24 rounded border border-ink/15 px-2 py-1 text-right text-sm outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink/50">Discount</span>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="w-24 rounded border border-ink/15 px-2 py-1 text-right text-sm outline-none"
            />
          </div>
          <div className="flex items-center justify-between border-t border-ink/10 pt-2 font-semibold text-ink">
            <span>Total Amount</span>
            <span>₱{total.toLocaleString()}.00</span>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
          >
            Cancel
          </button>
          <button className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
            Process &amp; Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
