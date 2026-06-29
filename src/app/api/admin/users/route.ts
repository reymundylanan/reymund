import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, full_name, username, email, role, branch_id, created_at, branches(name)"
    )
    .in("role", ["admin", "front_desk", "specialist"])
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  function extractBranchName(branches: unknown): string | null {
    if (Array.isArray(branches)) {
      return (branches[0] as { name?: string } | undefined)?.name ?? null;
    }
    return (branches as { name?: string } | null)?.name ?? null;
  }

  const users = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    branchName: extractBranchName(row.branches),
    createdAt: row.created_at,
  }));

  return NextResponse.json({ users });
}
