"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { redeemReward, type RewardOption } from "@/lib/supabase/queries/vouchers";
import { CopyCodeButton } from "@/components/my-glow/MyVouchersList";

type Step =
  | { kind: "options" }
  | { kind: "confirm"; option: RewardOption }
  | { kind: "done"; option: RewardOption; code: string };

function validUntil(days: number): string {
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return end.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

export default function RedeemRewardsModal({
  balance,
  enabled,
  options,
  onClose,
}: {
  balance: number;
  enabled: boolean;
  options: RewardOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "options" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || busyRef.current) return;
      if (doneRef.current) router.refresh();
      onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Closing after a redemption refreshes the page so the balance and vouchers update.
  function close() {
    if (doneRef.current) router.refresh();
    onClose();
  }

  async function confirm(option: RewardOption) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    let result: Awaited<ReturnType<typeof redeemReward>>;
    try {
      result = await redeemReward(createClient(), option.id);
    } catch {
      result = { error: "Couldn't redeem this reward. Please try again." };
    }
    busyRef.current = false;
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    doneRef.current = true;
    setStep({ kind: "done", option, code: result.code });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) close();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Redeem rewards"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 outline-none sm:max-w-md sm:rounded-3xl"
      >
        {step.kind === "done" ? (
          <div className="text-center">
            <h3 className="text-xl font-semibold text-ink">🎉 Reward Unlocked!</h3>
            <p className="mt-1 text-sm text-ink/60">Your {step.option.name} GlowSync discount is now available.</p>
            <p className="mt-4 font-mono text-2xl tracking-widest text-ink">{step.code}</p>
            <div className="mt-2 flex justify-center">
              <CopyCodeButton code={step.code} />
            </div>
            <p className="mt-3 text-xs text-ink/60">Show this code at the front desk when you pay.</p>
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Done
            </button>
          </div>
        ) : step.kind === "confirm" ? (
          <div>
            <h3 className="text-lg font-semibold text-ink">Confirm redemption</h3>
            <p className="mt-2 text-sm text-ink/70">
              Use {step.option.pointsCost.toLocaleString()} GlowPoints for {step.option.name}? Valid until{" "}
              {validUntil(step.option.validDays)}.
            </p>
            {error && (
              <div role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep({ kind: "options" });
                }}
                disabled={saving}
                className="flex-1 rounded-full border border-ink/15 bg-white py-2 text-sm text-ink/60 hover:border-ink/30 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirm(step.option)}
                disabled={saving}
                className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
              >
                {saving ? "Redeeming…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-ink">Available Rewards</h3>
            <p className="mt-1 text-sm text-ink/60">You have {balance.toLocaleString()} GlowPoints.</p>
            {!enabled && <p className="mt-3 text-sm text-ink/60">Redemption is paused right now.</p>}
            {options.length === 0 && enabled && (
              <p className="mt-3 text-sm text-ink/60">No rewards are available right now.</p>
            )}
            <ul className="mt-4 space-y-3">
              {options.map((o) => {
                const short = o.pointsCost - balance;
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-rose/60 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{o.name}</p>
                      <p className="text-xs text-ink/60">{o.pointsCost.toLocaleString()} GlowPoints</p>
                      <p className="text-xs text-ink/50">Valid for {o.validDays} days</p>
                    </div>
                    {enabled && short <= 0 ? (
                      <button
                        type="button"
                        onClick={() => setStep({ kind: "confirm", option: o })}
                        className="shrink-0 rounded-full bg-coral px-4 py-1.5 text-sm font-semibold text-white hover:bg-coral-dark"
                      >
                        Redeem
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="shrink-0 cursor-not-allowed rounded-full bg-blush px-3 py-1.5 text-xs font-semibold text-ink/40"
                      >
                        {enabled ? `Earn ${short.toLocaleString()} more points` : "Redeem"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full rounded-full border border-ink/15 bg-white py-2 text-sm text-ink/60 hover:border-ink/30"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
