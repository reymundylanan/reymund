import type { SupabaseClient } from "@supabase/supabase-js";

export type MessengerStatus = "none" | "connected" | "paused";

export async function getMyMessengerStatus(supabase: SupabaseClient, userId: string): Promise<MessengerStatus> {
  const { data, error } = await supabase
    .from("messenger_subscriptions")
    .select("opted_out_at")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getMyMessengerStatus failed:", error);
    return "none";
  }
  if (!data) return "none";
  return data.opted_out_at ? "paused" : "connected";
}

export async function getMessengerAudience(admin: SupabaseClient): Promise<{ connected: number; reachableNow: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [all, recent] = await Promise.all([
    admin.from("messenger_subscriptions").select("profile_id", { count: "exact", head: true }).is("opted_out_at", null),
    admin
      .from("messenger_subscriptions")
      .select("profile_id", { count: "exact", head: true })
      .is("opted_out_at", null)
      .gte("last_inbound_at", since),
  ]);
  if (all.error) console.error("getMessengerAudience failed:", all.error);
  if (recent.error) console.error("getMessengerAudience (recent) failed:", recent.error);
  return { connected: all.count ?? 0, reachableNow: recent.count ?? 0 };
}

export type DispatchStatus = { lastRunAt: string | null; pendingCount: number; oldestPendingAt: string | null };

export async function getDispatchStatus(supabase: SupabaseClient): Promise<DispatchStatus> {
  const [run, pending, oldest] = await Promise.all([
    supabase.from("messenger_dispatch_runs").select("last_run_at").eq("id", true).maybeSingle(),
    supabase.from("messenger_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "sending"]),
    supabase
      .from("messenger_outbox")
      .select("next_attempt_at")
      .eq("status", "pending")
      .order("next_attempt_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (run.error) console.error("getDispatchStatus (run) failed:", run.error);
  if (pending.error) console.error("getDispatchStatus (pending) failed:", pending.error);
  if (oldest.error) console.error("getDispatchStatus (oldest) failed:", oldest.error);
  return {
    lastRunAt: run.data?.last_run_at ?? null,
    pendingCount: pending.count ?? 0,
    oldestPendingAt: oldest.data?.next_attempt_at ?? null,
  };
}

export type MessengerResults = { sent: number; skipped: number; failed: number; pending: number };

export async function getMessengerResultsByBroadcast(
  supabase: SupabaseClient,
  broadcastIds: string[]
): Promise<Record<string, MessengerResults>> {
  if (broadcastIds.length === 0) return {};
  const { data, error } = await supabase
    .from("messenger_broadcast_results")
    .select("broadcast_id, sent, skipped, failed, pending")
    .in("broadcast_id", broadcastIds);
  if (error) {
    console.error("getMessengerResultsByBroadcast failed:", error);
    return {};
  }
  return Object.fromEntries(
    ((data as ({ broadcast_id: string } & MessengerResults)[]) ?? []).map(({ broadcast_id, ...r }) => [broadcast_id, r])
  );
}
