import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";

/** Saves Terms acceptance (and the optional offers opt-in) on the
 * signed-in user's profile (066). Never blocks the login. */
export async function recordLoginConsent(supabase: SupabaseClient, offers: boolean) {
  const { error } = await supabase.rpc("record_login_consent", { p_offers: offers });
  logQueryError("recordLoginConsent", error);
}
