"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSecondClock } from "@/lib/serviceTiming";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { buildOps, type OpsInput } from "@/lib/frontdeskOps";
import { loadFrontDeskOps } from "@/lib/supabase/queries/frontdeskOps";
import {
  ComingUpCard,
  InServiceCard,
  NeedsAttentionCard,
  OverviewCards,
  PaymentsToVerifyCard,
  StaffOnDutyCard,
  TodayScheduleCard,
  WaitingQueueCard,
} from "@/components/frontdesk/dashboard/OpsSections";

const RELOAD_DEBOUNCE_MS = 400;
const SAFETY_POLL_MS = 60_000;

/** Front Desk Operations Dashboard. Reads today's existing records for the
 * branch and refreshes live when appointments, payments or staff
 * attendance change (plus a 1-minute safety poll). */
export default function OperationsDashboard({ branchId }: { branchId: string }) {
  const now = useSecondClock();
  const { profile } = useStaffProfile();
  const [input, setInput] = useState<OpsInput | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const next = await loadFrontDeskOps(createClient(), branchId);
      if (seq !== loadSeq.current) return;
      setInput(next);
      setError(false);
    } catch (e) {
      console.error("Front Desk dashboard load failed:", e);
      if (seq === loadSeq.current) setError(true);
    }
  }, [branchId]);

  const scheduleReload = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, RELOAD_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const supabase = createClient();
    const channel = supabase
      .channel(`frontdesk-ops-${branchId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `branch_id=eq.${branchId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance", filter: `branch_id=eq.${branchId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance_breaks" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shifts", filter: `branch_id=eq.${branchId}` }, scheduleReload)
      .subscribe();
    const poll = setInterval(load, SAFETY_POLL_MS);
    const onFocus = () => scheduleReload();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      clearTimeout(first);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [branchId, load, scheduleReload]);

  const ops = useMemo(() => (input ? buildOps(input, now) : null), [input, now]);

  if (!ops) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-ink/50 shadow-sm" role={error ? "alert" : "status"}>
        {error ? "Couldn't load today's dashboard. Check your connection — it will retry automatically." : "Loading today's dashboard…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-700">
          Live updates paused — showing the last loaded data. Retrying…
        </p>
      )}

      <OverviewCards ops={ops} />

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <TodayScheduleCard ops={ops} branchName={profile?.branchName ?? null} />
        <StaffOnDutyCard ops={ops} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <InServiceCard ops={ops} />
        <WaitingQueueCard ops={ops} />
        <ComingUpCard ops={ops} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PaymentsToVerifyCard ops={ops} />
        <NeedsAttentionCard ops={ops} />
      </div>
    </div>
  );
}
