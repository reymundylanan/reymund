"use client";

import Link from "next/link";
import { breakdownRows, pointsFor, type CriterionResult, type EvaluationRow } from "@/lib/reviewRewards";

const ICONS: Record<CriterionResult, { icon: string; className: string; label: string }> = {
  pass: { icon: "✓", className: "text-green-600", label: "Full points" },
  partial: { icon: "½", className: "text-amber-600", label: "Partial points" },
  fail: { icon: "✗", className: "text-ink/40", label: "No points" },
  needs_review: { icon: "⏳", className: "text-amber-600", label: "Needs review" },
  not_provided: { icon: "—", className: "text-ink/40", label: "Not provided" },
};

export default function RewardResultPanel({
  evaluation,
  balance,
  onClose,
}: {
  evaluation: EvaluationRow;
  balance?: number;
  onClose: () => void;
}) {
  const rows = breakdownRows(evaluation);
  const total = evaluation.points_awarded;
  const snapshot = evaluation.settings_snapshot;
  const pendingFull = snapshot
    ? rows.filter((r) => r.result === "needs_review").reduce((n, r) => n + pointsFor(r.criterion, "pass", snapshot), 0)
    : 0;
  const pending = snapshot ? Math.max(0, Math.min(pendingFull, snapshot.max_points - total)) : 0;
  return (
    <div className="space-y-4 py-2 text-center">
      <div>
        <h3 className="text-lg font-semibold text-ink">🎉 Review Evaluated!</h3>
        <p className="mt-1 text-sm text-ink/60">Thank you for sharing your experience.</p>
      </div>

      <div>
        <p className="text-3xl font-bold text-gold">+{total} GlowPoints</p>
        {balance !== undefined && (
          <p className="mt-1 text-sm text-ink/60">Your current balance: {balance} GlowPoints</p>
        )}
      </div>

      <ul className="space-y-2 rounded-2xl bg-blush/40 p-3 text-left text-sm">
        {rows.map((r) => {
          const meta = ICONS[r.result];
          return (
            <li key={r.criterion} className="flex items-start gap-2">
              <span
                role="img"
                aria-label={meta.label}
                className={`w-5 shrink-0 text-center font-semibold ${meta.className}`}
              >
                {meta.icon}
              </span>
              <span className="flex-1">
                <span className="font-medium text-ink">{r.label}</span>
                {r.result === "needs_review" && (
                  <span className="block text-xs text-amber-700">Our team will check this</span>
                )}
                {r.reason && <span className="block text-xs text-ink/60">{r.reason}</span>}
              </span>
              <span className="shrink-0 font-semibold text-ink/70">+{r.points}</span>
            </li>
          );
        })}
        <li className="flex items-center justify-between border-t border-ink/10 pt-2 font-semibold text-ink">
          <span>Total</span>
          <span>+{total} GlowPoints</span>
        </li>
      </ul>

      {evaluation.status === "needs_review" && (
        <p className="text-xs text-ink/60">
          {pending > 0
            ? `+${total} now, up to +${pending} more after our team checks.`
            : "Some points are waiting for our team to check."}
        </p>
      )}

      <div className="flex gap-2">
        <Link
          href="/my-glow#rewards"
          onClick={onClose}
          className="flex-1 rounded-full border border-ink/15 bg-white py-2 text-sm font-semibold text-ink/70 hover:border-ink/30"
        >
          View My Rewards
        </Link>
        <button
          onClick={onClose}
          className="flex-1 rounded-full bg-coral py-2 text-sm font-semibold text-white hover:bg-coral-dark"
        >
          Done
        </button>
      </div>
    </div>
  );
}
