import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordLoginConsent } from "@/lib/auth/consent";
import { authErrorPath, postLoginPath } from "@/lib/auth/oauthRedirect";

/**
 * Google / Facebook come back here. Supabase exchanges the one-time code on
 * the server — checking the provider's signed ID token — and the session is
 * for exactly the account the client chose there (never one just because it's
 * open in the browser). Their GlowSync account is found, or created, by that
 * verified identity.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", data.user.id)
        .single();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: data.user.id,
          full_name:
            data.user.user_metadata?.full_name ??
            data.user.user_metadata?.name ??
            data.user.email,
          email: data.user.email,
          role: "customer",
          gdpr_consented: true,
        });
      }

      // Set by the login window once the Terms box is ticked.
      if (searchParams.get("consent") === "1") {
        await recordLoginConsent(supabase, searchParams.get("offers") === "1");
      }

      return NextResponse.redirect(`${origin}${postLoginPath(existingProfile?.role ?? "customer", next)}`);
    }
  }

  // Cancelled at Google ("access_denied") or failed: back to where they were,
  // where the login window opens again with a message.
  return NextResponse.redirect(`${origin}${authErrorPath(next, searchParams.get("error"))}`);
}
