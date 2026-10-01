import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_GRACE_PERIOD_MINUTES = 10;

export async function getGracePeriodMinutes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("spa_settings").select("grace_period_minutes").eq("id", true).maybeSingle();
  if (error) {
    console.error("getGracePeriodMinutes failed:", error);
    return DEFAULT_GRACE_PERIOD_MINUTES;
  }
  return data?.grace_period_minutes ?? DEFAULT_GRACE_PERIOD_MINUTES;
}

export async function updateGracePeriodMinutes(
  supabase: SupabaseClient,
  minutes: number
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("spa_settings").update({ grace_period_minutes: minutes }).eq("id", true);
  return { error: error?.message ?? null };
}
