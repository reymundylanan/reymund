"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import {
  getOtherBranchStaff,
  getBranchTransferRequestsForBranch,
  submitBranchTransferRequest,
  type BranchTransferRequest,
  type BranchTransferStatus,
  type OtherBranchStaff,
} from "@/lib/supabase/queries/branchTransferRequests";
import MonthCalendar from "@/components/frontdesk/staff/MonthCalendar";

const MAX_DAYS = 15;

const STATUS_STYLES: Record<BranchTransferStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  denied: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<BranchTransferStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

function formatDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function BranchTransferRequestModal({ onClose }: { onClose: () => void }) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<OtherBranchStaff[]>([]);
  const [requests, setRequests] = useState<BranchTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [staffMemberId, setStaffMemberId] = useState("");
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => [new Date()]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"submit" | "cancel" | null>(null);

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

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      getOtherBranchStaff(supabase, profile.branchId),
      getBranchTransferRequestsForBranch(supabase, profile.branchId),
    ]).then(([staffRows, reqs]) => {
      if (cancelled) return;
      setStaff(staffRows);
      if (staffRows.length > 0) setStaffMemberId((prev) => prev || staffRows[0].id);
      setRequests(reqs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId]);

  async function refreshRequests() {
    if (!profile?.branchId) return;
    const supabase = createClient();
    const reqs = await getBranchTransferRequestsForBranch(supabase, profile.branchId);
    setRequests(reqs);
  }

  async function submit() {
    if (!profile?.branchId || !staffMemberId) return;
    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const { error } = await submitBranchTransferRequest(supabase, {
      staffMemberId,
      targetBranchId: profile.branchId,
      dates: selectedDates.map(toDateKey).sort(),
      reason,
    });
    setSaving(false);
    if (error) {
      setFormError(error);
      return;
    }
    setReason("");
    setShowForm(false);
    await refreshRequests();
  }

  function discardForm() {
    setShowForm(false);
    setReason("");
    setFormError(null);
    setPendingAction(null);
  }

  const selectedStaff = staff.find((s) => s.id === staffMemberId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Assign Branch Shifts</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-ink/50">
          Temporarily borrow a staff member from another branch to work at your branch. They&apos;ll be
          unavailable at their home branch on the days assigned here, and return automatically afterward.
        </p>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
          {!showForm ? (
            <button
              onClick={() => {
                setShowForm(true);
                setSelectedDates([new Date()]);
                setReason("");
                setFormError(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-coral px-4 py-2 text-sm font-semibold text-coral-dark hover:bg-blush"
            >
              <Plus className="h-4 w-4" /> New Request
            </button>
          ) : staff.length === 0 ? (
            <p className="rounded-xl border border-ink/10 p-4 text-sm text-ink/50">
              No staff found at other branches to borrow from.
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-ink/10 p-4">
              <div>
                <label className="text-sm font-medium text-ink/70">Staff member (from another branch)</label>
                <select
                  value={staffMemberId}
                  onChange={(e) => setStaffMemberId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                      {s.department ? ` — ${s.department}` : ""} · {s.branch_name}
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

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => setPendingAction("cancel")}
                  disabled={saving}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setPendingAction("submit")}
                  disabled={saving || !staffMemberId}
                  className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-ink/5">
            {loading ? (
              <p className="py-3 text-sm text-ink/50">Loading requests...</p>
            ) : requests.length === 0 ? (
              <p className="py-3 text-sm text-ink/50">No branch transfer requests yet.</p>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {req.staff_member?.full_name ?? "Unknown"}
                      {req.staff_member?.branch?.name ? ` (from ${req.staff_member.branch.name})` : ""}
                    </p>
                    <p className="text-xs text-ink/50">
                      {req.dates.map(formatDate).join(", ")}
                      {req.reason ? ` · ${req.reason}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[req.status]}`}>
                    {STATUS_LABEL[req.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            {pendingAction === "submit" ? (
              <>
                <h2 className="font-semibold text-ink">Submit this request?</h2>
                <p className="mt-2 text-sm text-ink/60">
                  This asks to temporarily borrow{" "}
                  <span className="font-medium text-ink">{selectedStaff?.full_name ?? "this staff member"}</span>{" "}
                  from <span className="font-medium text-ink">{selectedStaff?.branch_name ?? "their branch"}</span>{" "}
                  for {selectedDates.map((d) => formatDate(toDateKey(d))).join(", ")}. It will show as Pending
                  until an admin approves or denies it — front desk can't decide this here.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-ink">Discard this request?</h2>
                <p className="mt-2 text-sm text-ink/60">What you&apos;ve entered on this form will be lost.</p>
              </>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPendingAction(null)}
                disabled={saving}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                onClick={() => {
                  if (pendingAction === "submit") {
                    setPendingAction(null);
                    submit();
                  } else {
                    discardForm();
                  }
                }}
                disabled={saving}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  pendingAction === "submit" ? "bg-coral" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {pendingAction === "submit" ? "Yes, Submit" : "Yes, Discard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
