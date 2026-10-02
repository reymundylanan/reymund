"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { computeServiceTiming } from "@/lib/serviceTiming";

/** Sidebar indicators: how many things need attention per menu item,
 * keyed by the item's href. Task counts (pending bookings, payments to
 * verify, waiting walk-ins, overdue services) clear when the task is done; "new" counts
 * (reviews, feedback, reports) clear once they're viewed. */
export type PortalBadges = Record<string, number>;

const REFRESH_MS = 60_000;
const REPORTS_SEEN_KEY = "glowsync-reports-seen-at";

// Walk-ins still needing the Front Desk: checked in / waiting / ready, or
// finished but not yet paid. (In-service ones count only once overdue.)
const WALKIN_OPEN = ["arrived", "waiting", "ready", "late_arrival", "completed"];

type InServiceRow = { visit_type: string | null; service_started_at: string | null; duration_minutes: number | null };

/** Sessions running past their expected end — the same rule as the
 * "Overdue" badge on Walk-Ins / Appointments. */
function countOverdue(rows: InServiceRow[], walkIn: boolean, now = new Date()) {
  return rows.filter(
    (r) => (r.visit_type === "walk_in") === walkIn && computeServiceTiming(r.service_started_at, r.duration_minutes ?? 60, now)?.kind === "overdue"
  ).length;
}

async function count(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: n, error } = await q;
  return error ? 0 : n ?? 0;
}

function readReportsSeen(userId: string): string {
  try {
    return localStorage.getItem(`${REPORTS_SEEN_KEY}-${userId}`) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function markReportsSeen(userId: string) {
  try {
    localStorage.setItem(`${REPORTS_SEEN_KEY}-${userId}`, new Date().toISOString());
  } catch {
    // Storage unavailable — the dot just comes back on the next load.
  }
}

async function frontDeskBadges(supabase: SupabaseClient, branchId: string | null): Promise<PortalBadges> {
  const today = toDateKey(new Date());
  let appts = supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending").gte("scheduled_date", today);
  let pay = supabase
    .from("payments")
    .select("id, appointment:appointments!inner(branch_id)", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("method", "gcash");
  let walk = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("visit_type", "walk_in")
    .eq("scheduled_date", today)
    .neq("status", "cancelled")
    .in("session_status", WALKIN_OPEN);
  let running = supabase
    .from("appointments")
    .select("visit_type, service_started_at, duration_minutes")
    .eq("scheduled_date", today)
    .eq("session_status", "in_service");
  if (branchId) {
    appts = appts.eq("branch_id", branchId);
    pay = pay.eq("appointment.branch_id", branchId);
    walk = walk.eq("branch_id", branchId);
    running = running.eq("branch_id", branchId);
  }
  const [a, p, w, inService] = await Promise.all([
    count(appts),
    count(pay),
    count(walk),
    running.then(({ data, error }) => (error ? [] : ((data ?? []) as InServiceRow[]))),
  ]);
  return {
    "/frontdesk/appointments": a + countOverdue(inService, false),
    "/frontdesk/payments": p,
    "/frontdesk/walk-ins": w + countOverdue(inService, true),
  };
}

async function adminBadges(supabase: SupabaseClient, userId: string, onReports: boolean): Promise<PortalBadges> {
  const today = toDateKey(new Date());
  const [bookings, payments, reviews, feedback, reports] = await Promise.all([
    count(supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending").gte("scheduled_date", today)),
    count(supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").eq("method", "gcash")),
    count(supabase.from("reviews").select("id", { count: "exact", head: true }).is("admin_seen_at", null)),
    count(supabase.from("site_feedback").select("id", { count: "exact", head: true }).is("read_at", null)),
    onReports
      ? Promise.resolve(0)
      : count(
          supabase
            .from("report_runs")
            .select("id", { count: "exact", head: true })
            .gt("created_at", readReportsSeen(userId))
            .neq("generated_by", userId)
        ),
  ]);
  return {
    "/admin/bookings": bookings,
    "/admin/payments": payments,
    "/admin/reviews": reviews,
    "/admin/notifications": feedback,
    "/admin/reports": reports,
  };
}

export function usePortalBadges(portal: "admin" | "frontdesk"): PortalBadges {
  const { profile } = useStaffProfile();
  const pathname = usePathname() ?? "";
  const [badges, setBadges] = useState<PortalBadges>({});
  const userId = profile?.id ?? null;
  const branchId = profile?.branchId ?? null;
  const onReports = pathname.startsWith("/admin/reports");

  const load = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    if (portal === "admin" && onReports) markReportsSeen(userId);
    setBadges(portal === "admin" ? await adminBadges(supabase, userId, onReports) : await frontDeskBadges(supabase, branchId));
  }, [portal, userId, branchId, onReports]);

  useEffect(() => {
    if (!userId) return;
    // Re-counted on every page change, every minute, and on live changes.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    const supabase = createClient();
    let channel = supabase.channel(`portal-badges-${portal}-${crypto.randomUUID()}`);
    const tables = portal === "admin" ? ["appointments", "payments", "reviews", "site_feedback", "report_runs"] : ["appointments", "payments"];
    for (const table of tables) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => load());
    channel.subscribe();
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [load, portal, userId, pathname]);

  return badges;
}
