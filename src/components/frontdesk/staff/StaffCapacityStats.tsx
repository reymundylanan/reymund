"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

export default function StaffCapacityStats() {
  const { profile } = useStaffProfile();
  const [staffCount, setStaffCount] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.branchId) return;
    const supabase = createClient();
    supabase
      .from("staff_members")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", profile.branchId)
      .then(({ count }) => setStaffCount(count ?? 0));
  }, [profile?.branchId]);

  const stats = [
    { label: "Staff Capacity", value: "85%" },
    { label: "Occupancy", value: "82%" },
    { label: "Rooms In Use", value: "6 / 8" },
    { label: "Staff On Duty", value: staffCount !== null ? String(staffCount) : "—" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-ink/50">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
