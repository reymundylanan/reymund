import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { getTierProgress } from "@/lib/myGlowTiers";
import type { BriefingData } from "@/lib/welcomeBriefing";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (!v ? null : Array.isArray(v) ? (v[0] ?? null) : v);

/** Today in the spa's time zone, YYYY-MM-DD. */
export const spaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** Everything the "welcome back" briefing needs, for the signed-in client. Each
 * part fails soft (shows nothing) so one missing table never blocks the rest. */
export async function loadWelcomeBriefing(supabase: SupabaseClient, clientId: string): Promise<BriefingData> {
  const today = spaToday();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  const [upcomingRes, unreadRes, doneRes, voucherRes, rewardsRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, scheduled_date, start_time, status, notes, service:branch_services(name), branch:branches(name)")
      .eq("client_id", clientId)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_date", today)
      .order("scheduled_date")
      .order("start_time")
      .limit(1)
      .maybeSingle(),
    supabase.from("client_notifications").select("id", { count: "exact", head: true }).eq("client_id", clientId).is("read_at", null),
    supabase
      .from("appointments")
      .select("id, scheduled_date")
      .eq("client_id", clientId)
      .or("status.eq.completed,session_status.in.(completed,paid)")
      .gte("scheduled_date", monthAgo)
      .order("scheduled_date", { ascending: false })
      .limit(20),
    supabase.from("reward_vouchers").select("expires_at").eq("client_id", clientId).eq("status", "active").gte("expires_at", today).order("expires_at"),
    supabase.from("client_rewards").select("current_points, lifetime_earned").eq("client_id", clientId).maybeSingle(),
  ]);
  if (upcomingRes.error) logQueryError("welcomeBriefing upcoming", upcomingRes.error);
  if (unreadRes.error) logQueryError("welcomeBriefing notifications", unreadRes.error);
  if (doneRes.error) logQueryError("welcomeBriefing visits", doneRes.error);
  if (voucherRes.error) logQueryError("welcomeBriefing vouchers", voucherRes.error);
  if (rewardsRes.error) logQueryError("welcomeBriefing rewards", rewardsRes.error);

  // Completed visits in the last 30 days that have no review yet.
  const done = (doneRes.data ?? []) as { id: string; scheduled_date: string }[];
  let unreviewed = done;
  if (done.length) {
    const { data: reviewed, error } = await supabase
      .from("reviews")
      .select("appointment_id")
      .eq("client_id", clientId)
      .in("appointment_id", done.map((a) => a.id));
    if (error) logQueryError("welcomeBriefing reviews", error);
    const seen = new Set(((reviewed ?? []) as { appointment_id: string | null }[]).map((r) => r.appointment_id));
    unreviewed = error ? [] : done.filter((a) => !seen.has(a.id));
  }

  type Up = {
    id: string;
    scheduled_date: string;
    start_time: string;
    status: "pending" | "confirmed";
    notes: string | null;
    service: Rel<{ name: string }>;
    branch: Rel<{ name: string }>;
  };
  const u = upcomingRes.data as unknown as Up | null;
  const vouchers = (voucherRes.data ?? []) as { expires_at: string }[];
  const rewards = rewardsRes.data as { current_points: number; lifetime_earned: number } | null;

  return {
    upcoming: u
      ? {
          id: u.id,
          date: u.scheduled_date,
          time: u.start_time,
          status: u.status,
          // Older bookings keep their services as text ("A, B with Ms. X — ₱1,650.00"): drop the price.
          serviceName: one(u.service)?.name ?? u.notes?.replace(/\s*—\s*₱[\d,.]+\s*$/, "") ?? null,
          branchName: one(u.branch)?.name ?? null,
        }
      : null,
    unreadNotifications: unreadRes.count ?? 0,
    toReview: { count: unreviewed.length, firstAppointmentId: unreviewed[0]?.id ?? null },
    vouchers: { count: vouchers.length, soonestExpiry: vouchers[0]?.expires_at?.slice(0, 10) ?? null },
    points: rewards?.current_points ?? 0,
    tier: rewards ? getTierProgress(rewards.lifetime_earned).tier : null,
  };
}
