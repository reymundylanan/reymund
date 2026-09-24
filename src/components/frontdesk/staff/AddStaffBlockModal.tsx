"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey, upsertStaffOff, type StaffOffPeriod } from "@/lib/supabase/queries/staffShifts";

type StaffRow = { id: string; full_name: string; department: string | null };

const PERIOD_OPTIONS: { value: StaffOffPeriod; label: string }[] = [
  { value: "full_day", label: "Whole Day" },
  { value: "morning", label: "Morning (before 1:00 PM)" },
  { value: "afternoon", label: "Afternoon (1:00 PM onward)" },
];

export default function AddStaffBlockModal({
  defaultDate,
  onClose,
  onSaved,
}: {
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffMemberId, setStaffMemberId] = useState("");
  const [shiftDate, setShiftDate] = useState(toDateKey(defaultDate));
  const [period, setPeriod] = useState<StaffOffPeriod>("full_day");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.branchId) return;
    const supabase = createClient();
    supabase
      .from("staff_members")
      .select("id, full_name, department")
      .eq("branch_id", profile.branchId)
      .order("full_name")
      .then(({ data }) => {
        const rows = (data as StaffRow[]) ?? [];
        setStaff(rows);
        if (rows.length > 0) setStaffMemberId((prev) => prev || rows[0].id);
      });
  }, [profile?.branchId]);

  async function submit() {
    if (!profile?.branchId || !staffMemberId || !shiftDate) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await upsertStaffOff(supabase, {
      staffMemberId,
      branchId: profile.branchId,
      shiftDate,
      period,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Add Block</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-ink/50">Staff member</label>
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
            <label className="text-xs font-medium text-ink/50">Date</label>
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink/50">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as StaffOffPeriod)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={saving || !staffMemberId || !shiftDate}
            className="w-full rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
