"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getRewardAccess, setRewardAccess, type RewardAccess } from "@/lib/supabase/queries/clientRewardAccess";

/** Admin: turn the AI GlowPoints scorer on or off for one client. */
export default function RewardAccessSwitch({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [access, setAccess] = useState<RewardAccess | null | undefined>(undefined);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRewardAccess(createClient(), clientId).then((a) => {
      if (!cancelled) setAccess(a);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function save(enabled: boolean) {
    setSaving(true);
    setError(null);
    const err = await setRewardAccess(createClient(), clientId, enabled, enabled ? "" : reason);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setAccess(enabled ? { enabled: true, reason: null, pausedAt: null } : { enabled: false, reason: reason.trim() || null, pausedAt: new Date().toISOString() });
    setConfirmingOff(false);
    setReason("");
  }

  const on = access?.enabled ?? true;

  return (
    <div className="mt-4 rounded-xl border border-ink/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-coral-dark" aria-hidden /> AI GlowPoints for reviews
          </p>
          <p className="mt-0.5 text-xs text-ink/50">
            {access === undefined
              ? "Loading…"
              : access === null
                ? "Couldn't load this setting."
                : on
                  ? "The AI scores this client's reviews and gives GlowPoints."
                  : `Off since ${new Date(access.pausedAt ?? "").toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}${access.reason ? ` — ${access.reason}` : ""}. Reviews are saved but earn no points.`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`AI GlowPoints for ${clientName}`}
          disabled={access == null || saving}
          onClick={() => (on ? setConfirmingOff(true) : save(true))}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-50 ${on ? "bg-coral" : "bg-ink/20"}`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </button>
      </div>

      {confirmingOff && (
        <div className="mt-3 space-y-2 rounded-lg bg-cream p-3">
          <p className="text-xs text-ink/70">
            Turn off AI GlowPoints for {clientName}? Their new reviews won&apos;t earn points. Points they already have stay.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Reason (optional, e.g. fake or spam reviews)"
            aria-label="Reason for turning off AI GlowPoints"
            className="w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmingOff(false);
                setReason("");
              }}
              className="flex-1 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(false)}
              className="flex-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Turn off"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
