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

type State = { applied: DeskVoucher | null; available: DeskVoucher[]; maxPerBooking: number };

export default function VoucherSection({
  appointmentId,
  clientId,
  remainingBeforeVoucher,
  paid,
  onChange,
}: {
  appointmentId: string;
  clientId: string | null;
  remainingBeforeVoucher: number;
  paid: boolean;
  onChange: (discount: number) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const result = await getDeskVouchers(createClient(), clientId, appointmentId);
    setState(result);
    onChange(result?.applied?.discountApplied ?? 0);
  }, [appointmentId, clientId, onChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of this client's vouchers
    load();
  }, [load]);

  if (!clientId || !state) return null;

  async function apply(voucherCode: string, amount: number | null) {
    if (!state) return;
    if (amount !== null) {
      const allowed = voucherDiscount(amount, remainingBeforeVoucher, state.maxPerBooking);
      if (amount > allowed) {
        const ok = window.confirm(
          `This voucher is worth ${peso(amount)} but only ${peso(allowed)} can be used — the extra ${peso(amount - allowed)} will be lost.`
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    setError(null);
    const result = await applyVoucher(createClient(), appointmentId, voucherCode, remainingBeforeVoucher);
    if ("error" in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    setCode("");
    await load();
    setBusy(false);
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
    setBusy(false);
  }

  const { applied, available } = state;

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
                    onClick={() => apply(v.code, v.discountAmount)}
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
              onClick={() => apply(code, null)}
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
