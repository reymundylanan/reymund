"use client";

import { useEffect, useState } from "react";
import { Hourglass, UserPlus, Wallet2 } from "lucide-react";
import PageHero, { HERO_CHIP } from "@/components/portal/PageHero";
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
    <PageHero
      icon={Wallet2}
      eyebrow="Front desk"
      title="Payments"
      subtitle="Online (GCash) and cash payment records."
      actions={
        <>
          <span className={HERO_CHIP}>
            <Hourglass className="h-4 w-4 text-amber-600" aria-hidden />
            <span className="font-semibold text-ink">{awaiting ?? "—"}</span>
            <span className="text-ink/50">awaiting verification</span>
          </span>
          <span className={HERO_CHIP}>
            <UserPlus className="h-4 w-4 text-coral-dark" aria-hidden />
            <span className="font-semibold text-ink">{walkinsToday ?? "—"}</span>
            <span className="text-ink/50">walk-ins today</span>
          </span>
        </>
      }
    />
  );
}
