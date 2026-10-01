"use client";

import { useState } from "react";
import { CheckCircle2, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PAY_NOW_LABEL, PAY_NOW_STYLE, formatGcashNumber, pesoAmount } from "@/lib/payNow";
import { rejectPayNowPayment, verifyPayNowPayment } from "@/lib/supabase/queries/payNow";
import ReceiptViewer from "@/components/frontdesk/payments/ReceiptViewer";
import type { PaymentInfo } from "@/components/frontdesk/appointments/utils";

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function when(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const CHECKS = [
  "Was the payment actually received in the spa's GCash?",
  "Does the amount match?",
  "Does the sender match?",
  "Does the GCash reference number match (if given)?",
  "Does the date and time make sense?",
  "Was this payment already used for another booking?",
];

/** Front Desk view of a Pay Now payment inside the appointment panel:
 * receipt, the manual GCash check, then Verify Payment (or Not Received).
 * The system never verifies by itself. */
export default function PayNowReview({
  payment,
  clientName,
  branchName,
  onChanged,
}: {
  payment: PaymentInfo;
  clientName: string;
  branchName?: string | null;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState<"verify" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = payment.status === "settled" ? "verified" : payment.status === "pending" ? "submitted" : "not_received";
  const verifier = one(payment.verifier)?.full_name ?? null;

  async function act(kind: "verify" | "reject") {
    if (!payment.id) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = kind === "verify" ? await verifyPayNowPayment(supabase, payment.id) : await rejectPayNowPayment(supabase, payment.id, reason);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setConfirming(null);
    onChanged();
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-ink/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Smartphone className="h-4 w-4 text-coral-dark" /> GCash — Pay Now
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAY_NOW_STYLE[state]}`}>
          {state === "submitted" ? "🟡 " : state === "verified" ? "🟢 " : ""}
          {PAY_NOW_LABEL[state]}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-ink/45">Amount</dt>
        <dd className="text-right font-semibold text-ink">{pesoAmount(Number(payment.amount))}</dd>
        <dt className="text-ink/45">Submitted</dt>
        <dd className="text-right text-ink/70">{when(payment.created_at)}</dd>
        {branchName && (
          <>
            <dt className="text-ink/45">Branch</dt>
            <dd className="text-right text-ink/70">{branchName}</dd>
          </>
        )}
        {(payment.paid_to_account_name || payment.paid_to_number) && (
          <>
            <dt className="text-ink/45">Paid to</dt>
            <dd className="text-right text-ink/70">
              {payment.paid_to_account_name}
              {payment.paid_to_number ? ` · ${formatGcashNumber(payment.paid_to_number)}` : ""}
            </dd>
          </>
        )}
        {payment.reference_no && (
          <>
            <dt className="text-ink/45">Reference No.</dt>
            <dd className="text-right font-mono text-ink/70">{payment.reference_no}</dd>
          </>
        )}
        {payment.sender_name && (
          <>
            <dt className="text-ink/45">Sender</dt>
            <dd className="text-right text-ink/70">{payment.sender_name}</dd>
          </>
        )}
        {state !== "submitted" && (
          <>
            <dt className="text-ink/45">{state === "verified" ? "Verified" : "Checked"}</dt>
            <dd className="text-right text-ink/70">
              {when(payment.verified_at)}
              {verifier ? ` · ${verifier}` : ""}
            </dd>
          </>
        )}
        {state === "not_received" && payment.rejected_reason && (
          <>
            <dt className="text-ink/45">Reason</dt>
            <dd className="text-right text-red-600">{payment.rejected_reason}</dd>
          </>
        )}
      </dl>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink/60">GCash Payment Receipt</p>
        <ReceiptViewer path={payment.receipt_path} />
      </div>

      {state === "submitted" && (
        <>
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="h-4 w-4" /> Verify GCash Payment
            </p>
            <p className="mt-1">
              Open the business GCash account on your phone and compare the actual transaction with this receipt. The
              receipt alone is not proof of payment.
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {CHECKS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          {confirming === null && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming("reject")}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" /> Not Received
              </button>
              <button
                type="button"
                onClick={() => setConfirming("verify")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4" /> Verify Payment
              </button>
            </div>
          )}

          {confirming === "verify" && (
            <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-sm font-semibold text-green-800">Confirm Payment Verification</p>
              <p className="text-xs text-green-900">
                Have you checked the business GCash account and confirmed that this payment was received?
              </p>
              <dl className="grid grid-cols-2 gap-y-0.5 text-xs">
                <dt className="text-green-900/60">Client</dt>
                <dd className="text-right font-medium text-green-900">{clientName}</dd>
                <dt className="text-green-900/60">Amount</dt>
                <dd className="text-right font-medium text-green-900">{pesoAmount(Number(payment.amount))}</dd>
                <dt className="text-green-900/60">Payment</dt>
                <dd className="text-right font-medium text-green-900">GCash — Pay Now</dd>
              </dl>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(null)} className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => act("verify")}
                  disabled={busy}
                  className="flex-1 rounded-full bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Confirm Payment"}
                </button>
              </div>
            </div>
          )}

          {confirming === "reject" && (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-700">Payment not received?</p>
              <p className="text-xs text-red-700/80">
                Only do this after checking the spa&apos;s GCash. The booking stays Pending — contact the client, then cancel it
                or let them pay at the branch.
              </p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 200))}
                placeholder="Reason (e.g. no matching transaction in GCash)"
                className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(null)} className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => act("reject")}
                  disabled={busy}
                  className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Mark Not Received"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
