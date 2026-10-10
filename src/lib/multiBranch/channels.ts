import type { SupabaseClient } from "@supabase/supabase-js";

export type Channels = { inApp: boolean; email: boolean; messenger: boolean; summary: string };

/** How a client will hear about a change (in-app always; Gmail when they have an
 * email and haven't turned it off; Messenger when they've linked it). */
export async function clientChannels(admin: SupabaseClient, clientId: string | null): Promise<Channels> {
  if (!clientId) return { inApp: false, email: false, messenger: false, summary: "Walk-in without an account — call them" };
  const [profile, prefs, messenger] = await Promise.all([
    admin.from("profiles").select("email").eq("id", clientId).maybeSingle(),
    admin.from("notification_preferences").select("email_enabled").eq("profile_id", clientId).maybeSingle(),
    admin.from("messenger_subscriptions").select("profile_id").eq("profile_id", clientId).is("opted_out_at", null).maybeSingle(),
  ]);
  const email = !!(profile.data as { email?: string | null } | null)?.email && (prefs.data as { email_enabled?: boolean } | null)?.email_enabled !== false;
  const hasMessenger = !messenger.error && !!messenger.data;
  const parts = ["In-app notice", ...(email ? ["Gmail"] : []), ...(hasMessenger ? ["Messenger"] : [])];
  return { inApp: true, email, messenger: hasMessenger, summary: parts.join(" + ") };
}
