import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError } from "@/lib/supabase/logQueryError";

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

/** Minutes kept free after each booking before the therapist's next one
 * (088). Until 088 is applied it's 0, so booking works as it did before. */
export const DEFAULT_BOOKING_BUFFER_MINUTES = 10;

export async function getBookingBufferMinutes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("spa_settings").select("booking_buffer_minutes").eq("id", true).maybeSingle();
  if (error) {
    // The column doesn't exist until 088 is applied.
    if (!isNotMigratedError(error)) console.error("getBookingBufferMinutes failed:", error);
    return 0;
  }
  const n = Number((data as { booking_buffer_minutes?: number } | null)?.booking_buffer_minutes ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(60, Math.round(n)) : 0;
}

export async function updateBookingBufferMinutes(supabase: SupabaseClient, minutes: number): Promise<{ error: string | null }> {
  const { error } = await supabase.from("spa_settings").update({ booking_buffer_minutes: minutes }).eq("id", true);
  if (isNotMigratedError(error)) return { error: "Buffer time needs database migration 088 — apply it in Supabase first." };
  return { error: error?.message ?? null };
}
