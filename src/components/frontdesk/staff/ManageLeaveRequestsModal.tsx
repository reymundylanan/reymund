"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import {
  getLeaveRequestsForBranch,
  submitLeaveRequest,
  type LeaveRequest,
  type LeaveRequestStatus,
} from "@/lib/supabase/queries/leaveRequests";
import MonthCalendar from "@/components/frontdesk/staff/MonthCalendar";

type StaffRow = { id: string; full_name: string; department: string | null };

const STATUS_STYLES: Record<LeaveRequestStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  denied: "bg-red-50 text-red-600",
};

const STATUS_LABEL: Record<LeaveRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
};

function formatDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ManageLeaveRequestsModal({ onClose }: { onClose: () => void }) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [staffMemberId, setStaffMemberId] = useState("");
  const [rangeAnchor, setRangeAnchor] = useState<Date | null>(null);
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"submit" | "cancel" | null>(null);

  function pickRangeDay(day: Date) {
    if (!rangeAnchor) {
      setRangeAnchor(day);
      setStartDate(day);
      setEndDate(day);
      return;
    }
    let s = rangeAnchor;
    let e = day;
    if (e.getTime() < s.getTime()) {
      [s, e] = [e, s];
    }
    const diffDays = Math.round((e.getTime() - s.getTime()) / 86400000);
    if (diffDays > 6) {
      e = new Date(s);
      e.setDate(e.getDate() + 6);
    }
    setStartDate(s);
    setEndDate(e);
    setRangeAnchor(null);
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
      supabase
        .from("staff_members")
        .select("id, full_name, department")
        .eq("branch_id", profile.branchId)
        .order("full_name"),
      getLeaveRequestsForBranch(supabase, profile.branchId),
    ]).then(([staffRes, reqs]) => {
      if (cancelled) return;
      const rows = (staffRes.data as StaffRow[]) ?? [];
      setStaff(rows);
      if (rows.length > 0) setStaffMemberId((prev) => prev || rows[0].id);
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
    const reqs = await getLeaveRequestsForBranch(supabase, profile.branchId);
    setRequests(reqs);
  }

  async function submit() {
    if (!profile?.branchId || !staffMemberId) return;
    if (!reason.trim()) {
      setFormError("Please enter a reason.");
      return;
    }
    if (toDateKey(endDate) < toDateKey(startDate)) {
      setFormError("End date can't be before the start date.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const supabase = createClient();
    const { error } = await submitLeaveRequest(supabase, {
      staffMemberId,
      branchId: profile.branchId,
      startDate: toDateKey(startDate),
      endDate: toDateKey(endDate),
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
    setRangeAnchor(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Leave Requests</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
          {!showForm ? (
            <button
              onClick={() => {
                setShowForm(true);
                setRangeAnchor(null);
                const today = new Date();
                setStartDate(today);
                setEndDate(today);
                setReason("");
                setFormError(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-coral px-4 py-2 text-sm font-semibold text-coral-dark hover:bg-blush"
            >
              <Plus className="h-4 w-4" /> New Request
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-ink/10 p-4">
              <div>
                <label className="text-sm font-medium text-ink/70">Staff member</label>
                <select
                  value={staffMemberId}
                  onChange={(e) => setStaffMemberId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                      {s.department ? ` — ${s.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-ink/70">Dates (tap a day, then tap another to pick a range — up to 7 days)</label>
                <p className="mt-1 text-sm font-medium text-coral-dark">
                  {toDateKey(startDate) === toDateKey(endDate)
                    ? formatDate(toDateKey(startDate))
                    : `${formatDate(toDateKey(startDate))} – ${formatDate(toDateKey(endDate))}`}
                </p>
                <div className="mt-1">
                  <MonthCalendar rangeStart={startDate} rangeEnd={endDate} onSelect={pickRangeDay} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-ink/70">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Family event"
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
                  disabled={saving || !staffMemberId || !reason.trim()}
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
              <p className="py-3 text-sm text-ink/50">No leave requests yet.</p>
            ) : (
              requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{req.staff_member?.full_name ?? "Unknown"}</p>
                    <p className="text-xs text-ink/50">
                      {formatDate(req.start_date)}
                      {req.end_date !== req.start_date ? ` – ${formatDate(req.end_date)}` : ""}
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
                  This sends a leave request for{" "}
                  <span className="font-medium text-ink">
                    {staff.find((s) => s.id === staffMemberId)?.full_name ?? "this staff member"}
                  </span>{" "}
                  from {formatDate(toDateKey(startDate))} to {formatDate(toDateKey(endDate))}. It will show as
                  Pending until an admin approves or denies it — front desk can't decide this here.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-semibold text-ink">Discard this request?</h2>
                <p className="mt-2 text-sm text-ink/60">
                  What you've entered on this form will be lost.
                </p>
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
