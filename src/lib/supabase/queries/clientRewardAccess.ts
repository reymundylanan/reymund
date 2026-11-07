import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

// Per-client switch for the AI GlowPoints scorer (migration 087).

export type RewardAccess = {
  /** True when the AI scorer gives this client points for reviews. */
  enabled: boolean;
  reason: string | null;
  pausedAt: string | null;
};

const ON: RewardAccess = { enabled: true, reason: null, pausedAt: null };

/** null when it couldn't be read (or 087 isn't applied yet). */
export async function getRewardAccess(supabase: SupabaseClient, clientId: string): Promise<RewardAccess | null> {
  const { data, error } = await supabase
    .from("review_reward_paused_clients")
    .select("reason, paused_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    if (!isNotMigratedError(error)) logQueryError("getRewardAccess", error);
    return null;
  }
  if (!data) return ON;
  const row = data as { reason: string | null; paused_at: string };
  return { enabled: false, reason: row.reason, pausedAt: row.paused_at };
}

export function rewardAccessError(error: { message?: string; code?: string } | null): string | null {
  if (!error) return null;
  if (isNotMigratedError(error) || /set_client_review_rewards/.test(error.message ?? "")) {
    return "This needs migration 087 in Supabase first.";
  }
  if (error.message?.includes("REVIEW_FORBIDDEN")) return "Only admins can change this.";
  if (error.message?.includes("REVIEW_INVALID")) return "This client couldn't be found.";
  return "Couldn't save. Please try again.";
}

/** Returns an error message, or null when saved. */
export async function setRewardAccess(
  supabase: SupabaseClient,
  clientId: string,
  enabled: boolean,
  reason: string
): Promise<string | null> {
  const { error } = await supabase.rpc("set_client_review_rewards", {
    p_client: clientId,
    p_enabled: enabled,
    p_reason: reason.trim().slice(0, 300),
  });
  if (error) logQueryError("setRewardAccess", error);
  return rewardAccessError(error);
}
