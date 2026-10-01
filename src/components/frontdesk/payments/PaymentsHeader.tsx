"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getTodaysWalkins } from "@/lib/supabase/queries/walkins";

export default function PaymentsHeader() {
  const { profile } = useStaffProfile();
  const [walkinsToday, setWalkinsToday] = useState<number | null>(null);
  const [awaiting, setAwaiting] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.branchId) return;
    let cancelled = false;
    const supabase = createClient();
    const branchId = profile.branchId;
    getTodaysWalkins(supabase, branchId, toDateKey(new Date())).then((rows) => {
      if (!cancelled) setWalkinsToday(rows.filter((r) => r.status !== "cancelled").length);
    });
    // GCash payments waiting for the Front Desk to check them.
    const countAwaiting = () =>
      supabase
        .from("payments")
        .select("id, appointment:appointments!inner(branch_id)", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("method", "gcash")
        .eq("appointment.branch_id", branchId)
        .then(({ count }) => {
          if (!cancelled) setAwaiting(count ?? 0);
        });
    countAwaiting();
    const channel = supabase
      .channel(`payments-header-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => countAwaiting())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile?.branchId]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-ink">Payments</h1>
        <p className="text-sm text-ink/50">Online (GCash) and cash payment records.</p>
      </div>
      <div className="flex items-center divide-x divide-ink/10 text-right">
        <div className="px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Awaiting Verification</p>
          <p className="text-xl font-semibold text-amber-600">{awaiting ?? "—"}</p>
        </div>
        <div className="px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Walk-ins (Daily)</p>
          <p className="text-xl font-semibold text-pink-600">{walkinsToday ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
