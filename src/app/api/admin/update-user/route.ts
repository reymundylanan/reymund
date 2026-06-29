import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    return NextResponse.json(
      { error: "Only admins can update staff profiles." },
      { status: 403 }
    );
  }

  const { userId, fullName, username, email, role, branchId } =
    (await request.json()) as {
      userId: string;
      fullName: string;
      username: string;
      email: string;
      role: "admin" | "front_desk";
      branchId: string | null;
    };

  if (!userId || !fullName || !username || !email || !role) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Keep the Auth login email in sync with the profile's email — username
  // login resolves to this same column, so they must never diverge.
  const { error: authEmailError } = await admin.auth.admin.updateUserById(
    userId,
    { email, email_confirm: true }
  );

  if (authEmailError) {
    return NextResponse.json({ error: authEmailError.message }, { status: 400 });
  }

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      username,
      email,
      role,
      branch_id: branchId,
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
