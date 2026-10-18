import type { SupabaseClient, User } from "@supabase/supabase-js";
import { recordLoginConsent } from "@/lib/auth/consent";
import { postLoginPath } from "@/lib/auth/oauthRedirect";

/** After a Google / Facebook sign-in: their GlowSync profile is found (or
 * created), the Terms / offers choice is saved, and the path to land on is
 * returned. Shared by the redirect callback and Google's on-site button. */
export async function finishLogin(supabase: SupabaseClient, user: User, params: URLSearchParams): Promise<string> {
  const { data: existingProfile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();

  if (!existingProfile) {
    await supabase.from("profiles").insert({
      id: user.id,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email,
      email: user.email,
      role: "customer",
      gdpr_consented: true,
    });
  }

  // Set by the login window once the Terms box is ticked.
  if (params.get("consent") === "1") {
    await recordLoginConsent(supabase, params.get("offers") === "1");
  }

  return postLoginPath(existingProfile?.role ?? "customer", params.get("next"));
}
