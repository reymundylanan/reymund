import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Branch Board: moves a front desk / specialist account to another branch
 * (or to no branch). Only the branch changes — nothing else on the profile. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (requesterProfile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can move accounts." }, { status: 403 });
  }

  const { userId, branchId } = (await request.json()) as { userId?: string; branchId?: string | null };
  if (!userId || branchId === undefined) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (branchId) {
    const { data: branch } = await admin.from("branches").select("id").eq("id", branchId).maybeSingle();
    if (!branch) return NextResponse.json({ error: "That branch doesn't exist." }, { status: 400 });
  }

  // Admin accounts aren't tied to one branch, so they're never moved here.
  const { data, error } = await admin
    .from("profiles")
    .update({ branch_id: branchId })
    .eq("id", userId)
    .in("role", ["front_desk", "specialist"])
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Only front desk and specialist accounts can be moved." }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
