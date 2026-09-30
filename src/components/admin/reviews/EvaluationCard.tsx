"use client";

import { useState } from "react";
import { Check, CircleHelp, Minus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { breakdownRows, CRITERION_LABELS, type BreakdownRow, type Criterion } from "@/lib/reviewRewards";
import { overrideCriterion, type Decision, type EvaluationDetail } from "@/lib/supabase/queries/adminRewards";

const STATUS_PILL: Record<string, string> = {
  evaluated: "bg-green-100 text-green-700",
  needs_review: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-600",
  pending: "bg-blush text-ink/60",
  skipped: "bg-blush text-ink/60",
};
const STATUS_LABEL: Record<string, string> = {
  evaluated: "Evaluated",
  needs_review: "Needs review",
  failed: "Failed",
  pending: "Pending",
  skipped: "Skipped",
};
const DECISION_LABEL: Record<Decision, string> = { pass: "Approved", partial: "Partial", fail: "Rejected" };

function ResultIcon({ result }: { result: BreakdownRow["result"] }) {
  if (result === "pass") return <Check aria-label="Pass" className="h-4 w-4 text-green-600" />;
  if (result === "partial") return <Minus aria-label="Partial" className="h-4 w-4 text-amber-500" />;
  if (result === "needs_review") return <CircleHelp aria-label="Needs review" className="h-4 w-4 text-amber-600" />;
  return <X aria-label={result === "fail" ? "Fail" : "Not provided"} className="h-4 w-4 text-ink/30" />;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

function OverrideForm({ evaluationId, criterion, onChanged }: { evaluationId: string; criterion: Criterion; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    if (!reason.trim()) {
      setError("Add a reason for your decision.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await overrideCriterion(createClient(), evaluationId, criterion, decision, reason);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setReason("");
    onChanged();
  }

  const btn = "flex-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
  return (
    <div className="mt-2 space-y-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        maxLength={300}
        aria-label={`Reason for ${CRITERION_LABELS[criterion]}`}
        className="w-full rounded-lg border border-ink/15 px-3 py-1.5 text-xs"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => decide("pass")} className={`${btn} bg-coral text-white`}>
          Approve
        </button>
        <button disabled={busy} onClick={() => decide("partial")} className={`${btn} bg-blush text-coral-dark`}>
          Partial
        </button>
        <button disabled={busy} onClick={() => decide("fail")} className={`${btn} bg-red-600 text-white`}>
          Reject
        </button>
      </div>
    </div>
  );
}

export default function EvaluationCard({
  evaluation,
  admin,
  onChanged,
}: {
  evaluation: EvaluationDetail;
  admin: boolean;
  onChanged: () => void;
}) {
  const rows = breakdownRows(evaluation);
  return (
    <div className="rounded-xl border border-ink/10 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-ink/40">AI evaluation</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL[evaluation.status] ?? STATUS_PILL.pending}`}>
          {STATUS_LABEL[evaluation.status] ?? evaluation.status}
        </span>
      </div>
      {evaluation.ai_summary && <p className="mt-2 text-ink/70">{evaluation.ai_summary}</p>}

      {evaluation.status !== "failed" && (
        <ul className="mt-3 divide-y divide-ink/5">
          {rows.map((r) => {
            const confidence = evaluation[`${r.criterion}_confidence`];
            return (
              <li key={r.criterion} className="py-2">
                <div className="flex items-center gap-2">
                  <ResultIcon result={r.result} />
                  <span className="flex-1 font-medium text-ink">{r.label}</span>
                  {confidence && <span className="text-xs capitalize text-ink/40">{confidence} confidence</span>}
                  <span className="w-12 text-right text-xs font-semibold text-ink">+{r.points}</span>
                </div>
                {r.reason && <p className="ml-6 mt-0.5 text-xs text-ink/50">{r.reason}</p>}
                {admin && evaluation.status === "needs_review" && r.result === "needs_review" && (
                  <div className="ml-6">
                    <OverrideForm evaluationId={evaluation.id} criterion={r.criterion} onChanged={onChanged} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {evaluation.status === "failed" && evaluation.lastError && (
        <p className="mt-2 text-xs text-red-600">Last error: {evaluation.lastError}</p>
      )}

      <p className="mt-2 text-xs text-ink/50">Points awarded: {evaluation.points_awarded}</p>

      {evaluation.overrides.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-ink/40">Admin decisions</p>
          <ul className="mt-1 space-y-1">
            {evaluation.overrides.map((o) => (
              <li key={o.id} className="text-xs text-ink/60">
                <span className="font-medium text-ink">{CRITERION_LABELS[o.criterion]}</span>:{" "}
                <span className="capitalize">{(o.originalResult ?? "—").replace("_", " ")}</span> → {DECISION_LABEL[o.decision]} ({o.pointsDelta >= 0 ? "+" : ""}
                {o.pointsDelta}) — {o.reason}
                <span className="text-ink/40">
                  {" "}
                  · {o.adminName} · {formatTime(o.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
