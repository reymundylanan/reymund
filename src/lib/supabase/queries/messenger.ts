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
