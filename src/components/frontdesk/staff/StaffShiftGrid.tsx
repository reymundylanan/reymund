"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { getStaffShiftsForDate, removeStaffOff, toDateKey, type StaffOffRecord } from "@/lib/supabase/queries/staffShifts";

type StaffRow = { id: string; full_name: string; department: string | null };

const PERIOD_LABEL: Record<StaffOffRecord["period"], string> = {
  full_day: "Off (Whole Day)",
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
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string; label: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    setRemoveError(null);
    const supabase = createClient();
    const { error } = await removeStaffOff(supabase, pendingRemove.id);
    setRemoving(false);
    if (error) {
      setRemoveError(error);
      return;
    }
    setPendingRemove(null);
    onChanged();
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-ink/50">Loading staff schedule...</p>
      </div>
    );
  }

  const filteredStaff = staff.filter((member) =>
    member.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      {staff.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name..."
            className="w-full rounded-full border border-ink/15 py-2 pl-9 pr-3 text-sm focus:border-coral focus:outline-none"
          />
        </div>
      )}
      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">No staff assigned to this branch yet.</p>
      ) : filteredStaff.length === 0 ? (
        <p className="text-sm text-ink/50">No staff match &quot;{search}&quot;.</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {filteredStaff.map((member) => {
            const offRecord = offRecords.find((r) => r.staff_member_id === member.id);
            return (
              <div key={member.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-base font-medium text-ink">{member.full_name}</p>
                  <p className="text-sm text-ink/50">{member.department ?? ""}</p>
                </div>
                {offRecord ? (
                  <span className="flex items-center gap-2 rounded-full bg-red-50 px-4 py-1.5 text-sm font-medium text-red-600">
                    {PERIOD_LABEL[offRecord.period]}
                    <button
                      onClick={() =>
                        setPendingRemove({
                          id: offRecord.id,
                          name: member.full_name,
                          label: PERIOD_LABEL[offRecord.period],
                        })
                      }
                      aria-label={`Remove off block for ${member.full_name}`}
                      className="hover:text-red-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <span className="rounded-full bg-green-50 px-4 py-1.5 text-sm font-medium text-green-700">
                    On Duty
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Remove this block?</h2>
            <p className="mt-2 text-sm text-ink/60">
              <span className="font-medium text-ink">{pendingRemove.name}</span> is currently marked{" "}
              <span className="font-medium text-red-600">{pendingRemove.label}</span> for this date. Removing
              it puts them back on duty and customers will be able to book them again.
            </p>

            {removeError && <p className="mt-2 text-xs text-red-600">{removeError}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setPendingRemove(null);
                  setRemoveError(null);
                }}
                disabled={removing}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={removing}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
