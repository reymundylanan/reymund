"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toDateKey, upsertStaffOff } from "@/lib/supabase/queries/staffShifts";
import { createApprovedLeave } from "@/lib/supabase/queries/leaveRequests";
import MonthCalendar from "@/components/frontdesk/staff/MonthCalendar";

const MAX_DAYS = 7;

function formatDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminLeaveRequestModal({
  staffMemberId,
  staffMemberName,
  branchId,
  onClose,
  onSaved,
}: {
  staffMemberId: string;
  staffMemberName: string;
  branchId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => [new Date()]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  async function submit() {
    if (!reason.trim() || !branchId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const dateKeys = selectedDates.map(toDateKey).sort();

    for (let i = 0; i < dateKeys.length; i++) {
      const { error: shiftError } = await upsertStaffOff(supabase, {
        staffMemberId,
        branchId,
        shiftDate: dateKeys[i],
        period: "full_day",
        source: "leave",
      });
      if (shiftError) {
        setSaving(false);
        setError(
          i === 0
            ? shiftError
            : `Saved ${i} of ${dateKeys.length} dates before an error occurred: ${shiftError}. The already-saved dates are still in effect — you can retry to finish the rest.`
        );
        return;
      }
    }

    const { error: logError } = await createApprovedLeave(supabase, {
      staffMemberId,
      branchId,
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
          <h2 className="font-semibold text-ink">Leave</h2>
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
            <label className="text-sm font-medium text-ink/70">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Family event"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          {!branchId && (
            <p className="text-sm text-red-600">
              This staff member has no branch assigned — set one via Edit before requesting leave.
            </p>
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
              disabled={saving || !reason.trim() || !branchId}
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
            <h2 className="font-semibold text-ink">Mark this leave?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This immediately marks{" "}
              <span className="font-medium text-ink">{staffMemberName}</span> as on leave (unavailable
              for booking) for {selectedDates.map((d) => formatDate(toDateKey(d))).join(", ")}. Front
              desk at their branch will be notified.
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
