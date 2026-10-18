import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishLogin } from "@/lib/auth/finishLogin";
import { authErrorPath } from "@/lib/auth/oauthRedirect";

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
      return NextResponse.redirect(`${origin}${await finishLogin(supabase, data.user, searchParams)}`);
    }
  }

  // Cancelled at Google ("access_denied") or failed: back to where they were,
  // where the login window opens again with a message.
  return NextResponse.redirect(`${origin}${authErrorPath(next, searchParams.get("error"))}`);
}
