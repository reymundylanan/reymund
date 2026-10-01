import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardHeader from "@/components/frontdesk/dashboard/DashboardHeader";
import OperationsDashboard from "@/components/frontdesk/dashboard/OperationsDashboard";

export default async function FrontDeskDashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("branch_id, role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !["front_desk", "admin", "specialist"].includes(profile.role)) {
    redirect("/");
  }

  const branchId = profile.branch_id;

  return (
    <div className="space-y-6">
      <DashboardHeader />

      {!branchId ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-ink/50 shadow-sm">
          Your account isn&apos;t assigned to a branch yet, so branch-specific data
          can&apos;t be shown. Contact an admin to get assigned.
        </div>
      ) : (
        <OperationsDashboard branchId={branchId} />
      )}
    </div>
  );
}
