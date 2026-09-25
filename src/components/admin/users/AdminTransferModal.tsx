"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toDateKey, upsertStaffOff } from "@/lib/supabase/queries/staffShifts";
import { createApprovedTransfer } from "@/lib/supabase/queries/branchTransferRequests";
import MonthCalendar from "@/components/frontdesk/staff/MonthCalendar";

const MAX_DAYS = 15;

type Branch = { id: string; name: string };

function formatDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminTransferModal({
  staffMemberId,
  staffMemberName,
  homeBranchId,
  onClose,
  onSaved,
}: {
  staffMemberId: string;
  staffMemberName: string;
  homeBranchId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [targetBranchId, setTargetBranchId] = useState("");
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => [new Date()]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const rows = ((data as Branch[]) ?? []).filter((b) => b.id !== homeBranchId);
        setBranches(rows);
        if (rows.length > 0) setTargetBranchId((prev) => prev || rows[0].id);
      });
  }, [homeBranchId]);

  function toggleDate(day: Date) {
    const key = toDateKey(day);
    setSelectedDates((prev) => {
      const exists = prev.some((d) => toDateKey(d) === key);
      if (exists) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => toDateKey(d) !== key);
      }
      if (prev.length >= MAX_DAYS) return prev;
      return [...prev, day].sort((a, b) => a.getTime() - b.getTime());
    });
  }

  const targetBranchName = branches.find((b) => b.id === targetBranchId)?.name ?? "the target branch";

  async function submit() {
    if (!homeBranchId || !targetBranchId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const dateKeys = selectedDates.map(toDateKey).sort();

    for (const dateKey of dateKeys) {
      const { error: shiftError } = await upsertStaffOff(supabase, {
        staffMemberId,
        branchId: homeBranchId,
        shiftDate: dateKey,
        period: "full_day",
      });
      if (shiftError) {
        setSaving(false);
        setError(shiftError);
        return;
      }
    }

    const { error: logError } = await createApprovedTransfer(supabase, {
      staffMemberId,
      targetBranchId,
      dates: dateKeys,
      reason,
    });
    setSaving(false);
    setConfirming(false);
    if (logError) {
      setError(logError);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="scrollbar-hidden flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Transfer</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-ink/70">Staff member</label>
            <select
              disabled
              value={staffMemberId}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-ink/5 px-3 py-2 text-sm text-ink/70"
            >
              <option value={staffMemberId}>{staffMemberName}</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-ink/70">Transfer to branch</label>
            <select
              value={targetBranchId}
              onChange={(e) => setTargetBranchId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-ink/70">
              Dates (tap each day you need — up to {MAX_DAYS})
            </label>
            <p className="mt-1 text-sm font-medium text-coral-dark">
              {selectedDates.map((d) => formatDate(toDateKey(d))).join(", ")}
              {selectedDates.length >= MAX_DAYS && " (max reached)"}
            </p>
            <div className="mt-1">
              <MonthCalendar selectedDates={selectedDates} onSelect={toggleDate} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-ink/70">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Covering a busy weekend"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          {!homeBranchId && (
            <p className="text-sm text-red-600">
              This staff member has no home branch assigned — set one via Edit before transferring.
            </p>
          )}
          {branches.length === 0 && (
            <p className="text-sm text-red-600">No other branches to transfer this staff member to.</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={saving || !homeBranchId || !targetBranchId}
              className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Done"}
            </button>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Transfer this staff member?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This immediately transfers{" "}
              <span className="font-medium text-ink">{staffMemberName}</span> to{" "}
              <span className="font-medium text-ink">{targetBranchName}</span> for{" "}
              {selectedDates.map((d) => formatDate(toDateKey(d))).join(", ")}. They&apos;ll become
              bookable there and unavailable at their home branch on those dates. Front desk at both
              branches will be notified.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Yes, Done"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
