"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { markPaid, updateSessionStatus } from "@/lib/supabase/queries/appointments";
import { clientInfo, appointmentStaffName, appointmentServiceName, type AppointmentRow } from "@/components/frontdesk/appointments/utils";

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quotedAmount(notes: string | null): number {
  const match = notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

export default function AppointmentPaymentModal({
  appointment,
  branchName,
  onClose,
  onPaid,
}: {
  appointment: AppointmentRow;
  branchName: string | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const client = clientInfo(appointment.client);
  const existingPayment = appointment.payments?.[0] ?? null;
  const alreadySettled = existingPayment?.status === "settled";
  const quoted = quotedAmount(appointment.notes);
  const servicePrice = Math.max(quoted - appointment.additional_charges, 0);

  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const [amountOverride, setAmountOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Math.max(servicePrice + appointment.additional_charges - discount, 0);
  const advance = alreadySettled ? existingPayment?.amount ?? 0 : 0;
  const balance = Math.max(total - advance, 0);
  const isFullyPaid = balance <= 0;
  const amount = amountOverride ?? balance.toFixed(2);

  async function confirmPayment() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const result = await markPaid(supabase, { appointmentId: appointment.id, amount: parsed, method });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onPaid();
  }

  async function acknowledgeFullyPaid() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const result = await updateSessionStatus(supabase, appointment.id, "paid");
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onPaid();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h2 className="font-semibold text-ink">Payment Summary</h2>
        <p className="mt-1 text-sm text-ink/60">{client.full_name}</p>
        <p className="text-xs text-ink/40">
          {appointmentServiceName(appointment)} · with {appointmentStaffName(appointment)} · {branchName ?? "—"}
        </p>

        <div className="mt-4 space-y-1.5 rounded-xl border border-ink/10 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/50">Service Price</span>
            <span className="text-ink">{peso(servicePrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Additional Charges</span>
            <span className="text-ink">{peso(appointment.additional_charges)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink/50">Discount / Promo</span>
            <input
              type="number"
              min={0}
              value={discount || ""}
              onChange={(e) => {
                setDiscount(Math.max(0, Number(e.target.value) || 0));
                setAmountOverride(null);
              }}
              placeholder="0.00"
              className="w-24 rounded-lg border border-ink/15 px-2 py-1 text-right text-sm outline-none focus:border-coral"
            />
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Advance Payment</span>
            <span className="text-ink">{peso(advance)}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-ink/10 pt-1.5 font-medium">
            <span className="text-ink">Total Amount</span>
            <span className="text-ink">{peso(total)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className="text-ink">Remaining Balance</span>
            <span className={isFullyPaid ? "text-green-600" : "text-coral-dark"}>{peso(balance)}</span>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {isFullyPaid ? (
          <>
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-green-50 py-3">
              <span className="text-sm font-semibold text-green-700">Paid in Advance / ₱0.00 Balance</span>
            </div>
            <button
              onClick={acknowledgeFullyPaid}
              disabled={saving}
              className="mt-4 w-full rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Done"}
            </button>
          </>
        ) : (
          <>
            <div className="mt-4 flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "gcash")}
                className="rounded-lg border border-ink/15 px-2 py-2 text-sm outline-none focus:border-coral"
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
              </select>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmountOverride(e.target.value)}
                className="flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>
            <button
              onClick={confirmPayment}
              disabled={saving}
              className="mt-3 w-full rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Recording..." : "Confirm Payment"}
            </button>
          </>
        )}

        <button
          onClick={onClose}
          disabled={saving}
          className="mt-2 w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
        >
          {isFullyPaid ? "Close" : "Collect Payment Later"}
        </button>
      </div>
    </div>
  );
}
