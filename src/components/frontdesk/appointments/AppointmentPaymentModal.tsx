"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDeskVouchers, voucherDiscountMatches } from "@/lib/supabase/queries/frontdeskVouchers";
import { markPaid, updateSessionStatus } from "@/lib/supabase/queries/appointments";
import VoucherSection, { type VoucherState } from "@/components/frontdesk/appointments/VoucherSection";
import { clientInfo, appointmentStaffName, appointmentServiceName, type AppointmentRow } from "@/components/frontdesk/appointments/utils";

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quotedAmount(notes: string | null): number {
  const match = notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function methodLabel(method: string) {
  return method === "gcash" ? "GCash" : method === "cash" ? "Cash" : method;
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
  const advancePayments = (appointment.payments ?? []).filter((p) => p.status === "settled");
  const advanceTotal = advancePayments.reduce((sum, p) => sum + p.amount, 0);
  const quoted = quotedAmount(appointment.notes);
  const servicePrice = Math.max(quoted - appointment.additional_charges, 0);

  const [discount, setDiscount] = useState(0);
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  // Walk-ins have no client, so there is no voucher to wait for.
  const [voucherState, setVoucherState] = useState<VoucherState>({ ready: !appointment.client_id, busy: false });
  const voucherPending = !voucherState.ready || voucherState.busy;
  const [recordingCash, setRecordingCash] = useState(false);
  const [cashReceived, setCashReceived] = useState("");
  const [cashJustRecorded, setCashJustRecorded] = useState(false);
  const [changeGiven, setChangeGiven] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voucherReloadKey, setVoucherReloadKey] = useState(0);

  const total = Math.max(servicePrice + appointment.additional_charges - discount - voucherDiscount, 0);
  const remainingBeforeVoucher = Math.max(servicePrice + appointment.additional_charges - discount - advanceTotal, 0);
  const remainingBalance = Math.max(total - advanceTotal, 0);
  const isFullyCoveredByAdvance = remainingBalance <= 0;
  // Advance payments alone settle it (no voucher needed); otherwise a voucher/discount did.
  const coveredByAdvanceOnly = advanceTotal > 0 && remainingBeforeVoucher <= 0;
  // A voucher that took effect leaves remainingBeforeVoucher > 0, so this only locks
  // undo once advance/cash payment (not the voucher) has settled the booking.
  const voucherLocked = cashJustRecorded || remainingBeforeVoucher <= 0 || appointment.session_status === "paid";
  const totalPaid = advanceTotal + (cashJustRecorded ? remainingBalance : 0);
  const cashReceivedNum = Number(cashReceived) || 0;
  const change = cashReceivedNum - remainingBalance;

  /** Re-reads the voucher from the server right before money moves; aborts and resyncs on any mismatch. */
  async function voucherStillCurrent(): Promise<boolean> {
    if (!appointment.client_id) return true;
    const fresh = await getDeskVouchers(createClient(), appointment.client_id, appointment.id);
    if (voucherDiscountMatches(fresh, voucherDiscount)) return true;
    setVoucherReloadKey((k) => k + 1);
    setError("The voucher changed — please check the total and try again.");
    return false;
  }

  async function confirmCash() {
    if (cashReceivedNum < remainingBalance) {
      setError("Cash received must cover the remaining balance.");
      return;
    }
    setSaving(true);
    setError(null);
    if (!(await voucherStillCurrent())) {
      setSaving(false);
      return;
    }
    const supabase = createClient();
    const result = await markPaid(supabase, { appointmentId: appointment.id, amount: remainingBalance, method: "cash" });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setChangeGiven(Math.max(change, 0));
    setCashJustRecorded(true);
    setRecordingCash(false);
  }

  async function acknowledgeFullyPaid() {
    setSaving(true);
    setError(null);
    if (!(await voucherStillCurrent())) {
      setSaving(false);
      return;
    }
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
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6">
        <h2 className="font-semibold text-ink">Payment Summary</h2>
        <p className="mt-1 text-sm text-ink/60">{client.full_name}</p>
        <p className="text-xs text-ink/40">
          {appointmentServiceName(appointment)} · with {appointmentStaffName(appointment)} · {branchName ?? "—"}
        </p>

        <div className="mt-4 rounded-xl border border-ink/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Advance / Online Payment</p>
          {advancePayments.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {advancePayments.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-ink">{methodLabel(p.method)}</p>
                    {p.reference_no && <p className="text-[11px] text-ink/40">Ref: {p.reference_no}</p>}
                  </div>
                  <span className="font-medium text-green-600">{peso(p.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-ink/10 pt-1.5">
                <span className="text-xs font-semibold text-green-700">✓ Advance Paid</span>
                <span className="text-xs font-semibold text-green-700">{peso(advanceTotal)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-ink/40">No advance payment recorded.</p>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-ink/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Cash Payment</p>
          {cashJustRecorded ? (
            <div className="mt-2 flex flex-col items-center justify-center gap-1 rounded-xl bg-green-50 py-3">
              <span className="text-sm font-semibold text-green-700">✓ Cash Paid</span>
              {changeGiven > 0 && <span className="text-xs text-green-700">Change given: {peso(changeGiven)}</span>}
            </div>
          ) : isFullyCoveredByAdvance ? (
            <p className="mt-1.5 text-sm text-ink/40">
              {coveredByAdvanceOnly ? "Fully covered by advance payment." : "Nothing left to pay."}
            </p>
          ) : !recordingCash ? (
            <>
              <p className="mt-1.5 text-sm text-ink/60">
                Balance due: <span className="font-semibold text-coral-dark">{peso(remainingBalance)}</span>
              </p>
              <button
                onClick={() => setRecordingCash(true)}
                disabled={voucherPending}
                className="mt-2 w-full rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Record Cash Payment
              </button>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <div>
                <label className="text-xs text-ink/50">Cash Received</label>
                <input
                  type="number"
                  min={0}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder={remainingBalance.toFixed(2)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>
              {cashReceivedNum > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-ink/50">Change</span>
                  <span className={change >= 0 ? "font-medium text-ink" : "font-medium text-red-600"}>
                    {peso(Math.max(change, 0))}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setRecordingCash(false);
                    setCashReceived("");
                  }}
                  className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCash}
                  disabled={saving || voucherPending || cashReceivedNum < remainingBalance}
                  className="flex-1 rounded-full bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? "Recording..." : "Confirm"}
                </button>
              </div>
            </div>
          )}
        </div>

        <VoucherSection
          appointmentId={appointment.id}
          clientId={appointment.client_id}
          remainingBeforeVoucher={remainingBeforeVoucher}
          paid={voucherLocked}
          onChange={setVoucherDiscount}
          onStateChange={setVoucherState}
          reloadKey={voucherReloadKey}
        />

        <div className="mt-3 space-y-1.5 rounded-xl bg-blush/40 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">Payment Summary</p>
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
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0.00"
              disabled={cashJustRecorded}
              className="w-24 rounded-lg border border-ink/15 px-2 py-1 text-right text-sm outline-none focus:border-coral disabled:opacity-50"
            />
          </div>
          {voucherDiscount > 0 && (
            <div className="flex justify-between">
              <span className="text-ink/50">Voucher</span>
              <span className="text-green-600">−{peso(voucherDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-ink/10 pt-1.5 font-medium">
            <span className="text-ink">Total</span>
            <span className="text-ink">{peso(total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Advance Paid</span>
            <span className="text-ink">{peso(advanceTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/50">Remaining Balance</span>
            <span className={isFullyCoveredByAdvance || cashJustRecorded ? "text-green-600" : "text-coral-dark"}>
              {peso(cashJustRecorded ? 0 : remainingBalance)}
            </span>
          </div>
          <div className="flex justify-between border-t border-ink/10 pt-1.5 font-semibold">
            <span className="text-ink">Total Paid</span>
            <span className="text-ink">{peso(totalPaid)}</span>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {(isFullyCoveredByAdvance && !cashJustRecorded) || cashJustRecorded ? (
          <button
            onClick={cashJustRecorded ? onPaid : acknowledgeFullyPaid}
            disabled={saving || (!cashJustRecorded && voucherPending)}
            className="mt-4 w-full rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Done"}
          </button>
        ) : (
          <button
            onClick={onClose}
            disabled={saving}
            className="mt-4 w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
          >
            Collect Payment Later
          </button>
        )}
      </div>
    </div>
  );
}
