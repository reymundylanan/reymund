import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishLogin } from "@/lib/auth/finishLogin";
import { authErrorPath } from "@/lib/auth/oauthRedirect";

/**
 * Google's on-site button signs in in the browser (signInWithIdToken), then
 * comes here — same profile / Terms / landing steps as the redirect callback.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(`${origin}${authErrorPath(searchParams.get("next"), null)}`);
  return NextResponse.redirect(`${origin}${await finishLogin(supabase, data.user, searchParams)}`);
}
