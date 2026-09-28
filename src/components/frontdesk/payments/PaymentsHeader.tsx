"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getTodaysWalkins } from "@/lib/supabase/queries/walkins";
import { gcashFeed } from "@/lib/frontdeskData";

const unmatchedToday = gcashFeed.filter((t) => t.status === "unmatched").length;

export default function PaymentsHeader() {
  const { profile } = useStaffProfile();
  const [walkinsToday, setWalkinsToday] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.branchId) return;
    let cancelled = false;
    const supabase = createClient();
    getTodaysWalkins(supabase, profile.branchId, toDateKey(new Date())).then((rows) => {
      if (!cancelled) setWalkinsToday(rows.filter((r) => r.status !== "cancelled").length);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-ink">Payments</h1>
        <p className="text-sm text-ink/50">
          Manage daily digital transactions and cash payments.
        </p>
      </div>
      <div className="flex items-center divide-x divide-ink/10 text-right">
        <div className="px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
            Unmatched Today
          </p>
          <p className="text-xl font-semibold text-teal-600">{unmatchedToday.toString().padStart(2, "0")}</p>
        </div>
        <div className="px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
            Walk-ins (Daily)
          </p>
          <p className="text-xl font-semibold text-pink-600">{walkinsToday ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
