"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

const START_HOUR = 9;
const END_HOUR = 20.5;
const COL_WIDTH = 64;

const slots: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h += 0.5) slots.push(h);

function formatHour(h: number) {
  const hour24 = Math.floor(h);
  const min = h % 1 === 0 ? "00" : "30";
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${min}`;
}

type StaffRow = {
  id: string;
  full_name: string;
  department: string | null;
};

export default function StaffShiftGrid() {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("staff_members")
      .select("id, full_name, department")
      .eq("branch_id", profile.branchId)
      .order("full_name")
      .then(({ data }) => {
        setStaff((data as StaffRow[]) ?? []);
        setLoading(false);
      });
  }, [profile?.branchId]);

  const gridWidth = (slots.length - 1) * COL_WIDTH;

  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex">
        <div className="w-32 shrink-0" />
        <div className="flex" style={{ width: gridWidth }}>
          {slots.slice(0, -1).map((h) => (
            <div
              key={h}
              style={{ width: COL_WIDTH }}
              className="shrink-0 border-l border-ink/5 py-2 text-center text-[11px] text-ink/40"
            >
              {formatHour(h)}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 space-y-1">
        {loading && (
          <p className="py-6 text-center text-sm text-ink/40">Loading staff…</p>
        )}
        {!loading && staff.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">No staff assigned to this branch.</p>
        )}
        {staff.map((member) => {
          const shiftStart = 9;
          const shiftDuration = 9;
          const left = (shiftStart - START_HOUR) * COL_WIDTH * 2;
          const width = shiftDuration * COL_WIDTH * 2;
          return (
            <div key={member.id} className="flex items-center">
              <div className="w-32 shrink-0">
                <p className="text-sm font-medium text-ink/70">{member.full_name}</p>
                {member.department && (
                  <p className="text-[11px] text-ink/40">{member.department}</p>
                )}
              </div>
              <div className="relative h-12 border-t border-ink/5" style={{ width: gridWidth }}>
                <div
                  style={{ left, width, borderLeft: "4px solid #8D6F5D", backgroundColor: "#CFBCA8", color: "#8D6F5D" }}
                  className="absolute top-1 h-10 truncate rounded-md px-2 py-1 text-xs font-medium"
                >
                  On Shift
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
