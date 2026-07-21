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
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { userId, restrict } = (await request.json()) as { userId: string; restrict: boolean };

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  if (userId === auth.user.id) {
    return NextResponse.json({ error: "Cannot restrict your own account." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ restricted: restrict })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
