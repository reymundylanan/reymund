import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { recordLoginConsent } from "@/lib/auth/consent";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
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

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
