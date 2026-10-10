import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BranchBoard from "@/components/admin/branchBoard/BranchBoard";

export const dynamic = "force-dynamic";

export default async function AdminBranchBoardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") redirect("/admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Branch Board</h1>
        <p className="text-sm text-ink/50">
          Every branch side by side. Drag a staff member or front desk account onto another branch to move or lend them.
        </p>
      </div>
      <BranchBoard />
    </div>
  );
}
