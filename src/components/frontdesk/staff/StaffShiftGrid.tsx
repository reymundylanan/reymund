"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { getStaffShiftsForDate, removeStaffOff, toDateKey, type StaffOffRecord } from "@/lib/supabase/queries/staffShifts";

type StaffRow = { id: string; full_name: string; department: string | null };

const PERIOD_LABEL: Record<StaffOffRecord["period"], string> = {
  full_day: "Off (Full Day)",
  morning: "Off (Morning)",
  afternoon: "Off (Afternoon)",
};

export default function StaffShiftGrid({
  selectedDate,
  refreshKey,
  onChanged,
}: {
  selectedDate: Date;
  refreshKey: number;
  onChanged: () => void;
}) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [offRecords, setOffRecords] = useState<StaffOffRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const supabase = createClient();
    const dateKey = toDateKey(selectedDate);
    Promise.all([
      supabase
        .from("staff_members")
        .select("id, full_name, department")
        .eq("branch_id", profile.branchId)
        .order("full_name"),
      getStaffShiftsForDate(supabase, profile.branchId, dateKey),
    ]).then(([staffRes, records]) => {
      if (cancelled) return;
      setStaff((staffRes.data as StaffRow[]) ?? []);
      setOffRecords(records);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId, selectedDate, refreshKey]);

  async function handleRemove(id: string) {
    const supabase = createClient();
    await removeStaffOff(supabase, id);
    onChanged();
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-ink/50">Loading staff schedule...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">No staff assigned to this branch yet.</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {staff.map((member) => {
            const offRecord = offRecords.find((r) => r.staff_member_id === member.id);
            return (
              <div key={member.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{member.full_name}</p>
                  <p className="text-xs text-ink/50">{member.department ?? ""}</p>
                </div>
                {offRecord ? (
                  <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                    {PERIOD_LABEL[offRecord.period]}
                    <button
                      onClick={() => handleRemove(offRecord.id)}
                      aria-label={`Remove off block for ${member.full_name}`}
                      className="hover:text-red-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                    On Duty
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
