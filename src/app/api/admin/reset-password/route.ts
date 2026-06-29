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
      { error: "Only admins can reset passwords." },
      { status: 403 }
    );
  }

  const { userId, newPassword, currentPassword } = (await request.json()) as {
    userId: string;
    newPassword: string;
    currentPassword: string;
  };

  if (!userId || !newPassword || !currentPassword) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // Re-authenticate the requesting admin with their own current password
  // before allowing them to set anyone's new password.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: auth.user.email!,
    password: currentPassword,
  });

  if (verifyError) {
    return NextResponse.json(
      { error: "Your current password is incorrect." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
