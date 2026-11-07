import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STAFF_ROLES = ["admin", "front_desk", "specialist"];
const invalid = () => NextResponse.json({ error: "Invalid username or password." }, { status: 401 });

/**
 * Staff sign-in by username. The username is turned into the account's email
 * here on the server and never sent back, so nobody can look up a staff
 * email from a username (the old browser lookup allowed that). The session
 * cookies are set on this response, exactly as a browser sign-in would.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password || username.length > 100 || password.length > 200) return invalid();

  const { data: staff, error: lookupError } = await createAdminClient()
    .from("profiles")
    .select("email, role")
    .eq("username", username)
    .in("role", STAFF_ROLES)
    .limit(1)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Couldn't sign in right now. Please try again." }, { status: 503 });
  // Same answer whether the username or the password is wrong.
  if (!staff?.email) return invalid();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: staff.email, password });
  if (error || !data.user) {
    if (error?.status === 429) return NextResponse.json({ error: "Too many sign-in attempts. Wait a few minutes and try again." }, { status: 429 });
    return invalid();
  }
  return NextResponse.json({ role: staff.role as string });
}
