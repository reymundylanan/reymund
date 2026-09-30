"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyVoucher,
  getDeskVouchers,
  undoVoucher,
  type DeskVoucher,
} from "@/lib/supabase/queries/frontdeskVouchers";
import { expiryLabel, normalizeVoucherCode, peso, voucherDiscount } from "@/lib/vouchers";

type Load =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ok"; applied: DeskVoucher | null; available: DeskVoucher[]; maxPerBooking: number };

/** ready = we know whether a voucher is attached; busy = an apply/undo is in flight. */
export type VoucherState = { ready: boolean; busy: boolean };

export default function VoucherSection({
  appointmentId,
  clientId,
  remainingBeforeVoucher,
  paid,
  onChange,
  onStateChange,
}: {
  appointmentId: string;
  clientId: string | null;
  remainingBeforeVoucher: number;
  paid: boolean;
  onChange: (discount: number) => void;
  onStateChange: (state: VoucherState) => void;
}) {
  const [state, setState] = useState<Load>({ status: "loading" });
  const [busy, setBusyState] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Notify the modal synchronously (not via an effect) so the payment buttons
  // lock in the same tick an action starts.
  const setBusy = useCallback(
    (next: boolean) => {
      setBusyState(next);
      onStateChange({ ready: true, busy: next });
    },
    [onStateChange]
  );

  const load = useCallback(async () => {
    if (!clientId) return;
    setState({ status: "loading" });
    onStateChange({ ready: false, busy: false });
    const result = await getDeskVouchers(createClient(), clientId, appointmentId);
    setState(result);
    setBusyState(false);
    onStateChange({ ready: result.status !== "error", busy: false });
    onChange(result.status === "ok" ? (result.applied?.discountApplied ?? 0) : 0);
  }, [appointmentId, clientId, onChange, onStateChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of this client's vouchers
    load();
  }, [load]);

  if (!clientId || state.status === "unavailable") return null;

  if (state.status === "loading") {
    return (
      <div className="mt-3 rounded-xl border border-ink/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">GlowPoints voucher</p>
        <p className="mt-2 text-sm text-ink/40">Loading vouchers...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mt-3 rounded-xl border border-ink/10 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">GlowPoints voucher</p>
        <p role="alert" className="mt-2 text-xs text-red-600">
          Couldn&apos;t load vouchers.{" "}
          <button onClick={load} className="font-semibold underline">
            Retry
          </button>
        </p>
      </div>
    );
  }

  const { applied, available, maxPerBooking } = state;

  async function apply(voucherCode: string) {
    const normalized = normalizeVoucherCode(voucherCode);
    const match = available.find((v) => v.code === normalized);
    if (match) {
      const amount = match.discountAmount;
      const allowed = voucherDiscount(amount, remainingBeforeVoucher, maxPerBooking);
      if (amount > allowed) {
        const ok = window.confirm(
          `This voucher is worth ${peso(amount)} but only ${peso(allowed)} can be used — the extra ${peso(amount - allowed)} will be lost.`
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    setError(null);
    const result = await applyVoucher(createClient(), appointmentId, normalized, remainingBeforeVoucher);
    if ("error" in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    setCode("");
    await load();
  }

  async function undo(voucherId: string) {
    setBusy(true);
    setError(null);
    const message = await undoVoucher(createClient(), voucherId);
    if (message) {
      setBusy(false);
      setError(message);
      return;
    }
    await load();
  }

  return (
    <div className="mt-3 rounded-xl border border-ink/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">GlowPoints voucher</p>
      {applied ? (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-ink">
            Voucher {applied.code} <span className="font-medium text-green-600">−{peso(applied.discountApplied ?? 0)}</span>
          </span>
          {!paid && (
            <button
              onClick={() => undo(applied.id)}
              disabled={busy}
              className="text-xs font-semibold text-coral-dark hover:underline disabled:opacity-50"
            >
              Undo
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {available.length > 0 ? (
            available.map((v) => {
              const exp = expiryLabel(v.expiresAt);
              return (
                <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="text-ink">
                      {v.name} <span className="text-[11px] text-ink/40">{v.code}</span>
                    </p>
                    <p className={`text-[11px] ${exp.soon ? "text-amber-600" : "text-ink/40"}`}>{exp.text}</p>
                  </div>
                  <button
                    onClick={() => apply(v.code)}
                    disabled={busy || paid}
                    className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-ink/40">No active vouchers.</p>
          )}
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizeVoucherCode(e.target.value))}
              placeholder="GLOW-XXXX-XXXX"
              aria-label="Voucher code"
              className="min-w-0 flex-1 rounded-lg border border-ink/15 px-2 py-1 text-sm outline-none focus:border-coral"
            />
            <button
              onClick={() => apply(code)}
              disabled={busy || paid || !code}
              className="rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
