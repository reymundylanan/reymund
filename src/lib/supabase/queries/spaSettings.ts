import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_GRACE_PERIOD_MINUTES = 15;

export async function getGracePeriodMinutes(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("spa_settings").select("grace_period_minutes").eq("id", true).maybeSingle();
  if (error) {
    console.error("getGracePeriodMinutes failed:", error);
    return DEFAULT_GRACE_PERIOD_MINUTES;
  }
  return data?.grace_period_minutes ?? DEFAULT_GRACE_PERIOD_MINUTES;
}

const DEFAULT_BOOKING_WINDOW = { start: "08:00", end: "18:00" };

/** The spa's client-facing booking hours — separate from any individual
 * staff member's shift. Falls back to 8AM-6PM if the settings row or
 * columns aren't reachable, so booking/reschedule pickers always have a
 * sane range to build slots from. */
export async function getBookingWindow(supabase: SupabaseClient): Promise<{ start: string; end: string }> {
  const { data, error } = await supabase
    .from("spa_settings")
    .select("booking_window_start, booking_window_end")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("getBookingWindow failed:", error);
    return DEFAULT_BOOKING_WINDOW;
  }
  return {
    start: (data.booking_window_start as string)?.slice(0, 5) ?? DEFAULT_BOOKING_WINDOW.start,
    end: (data.booking_window_end as string)?.slice(0, 5) ?? DEFAULT_BOOKING_WINDOW.end,
  };
}

export async function updateGracePeriodMinutes(
  supabase: SupabaseClient,
  minutes: number
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("spa_settings").update({ grace_period_minutes: minutes }).eq("id", true);
  return { error: error?.message ?? null };
}
