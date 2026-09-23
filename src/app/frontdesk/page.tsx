import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getFrontDeskStats,
  getTodaySchedule,
  getStaffRoster,
  getPaymentVerifications,
} from "@/lib/supabase/queries/frontdeskDashboard";
import DashboardHeader from "@/components/frontdesk/dashboard/DashboardHeader";
import DashboardStats from "@/components/frontdesk/dashboard/DashboardStats";
import TodaySchedule from "@/components/frontdesk/dashboard/TodaySchedule";
import TherapistsOnDuty from "@/components/frontdesk/dashboard/TherapistsOnDuty";
import AlertsPanel from "@/components/frontdesk/dashboard/AlertsPanel";
import LobbyQueue from "@/components/frontdesk/dashboard/LobbyQueue";

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

  const [stats, schedule, roster, verifications] = branchId
    ? await Promise.all([
        getFrontDeskStats(supabase, branchId),
        getTodaySchedule(supabase, branchId),
        getStaffRoster(supabase, branchId),
        getPaymentVerifications(supabase, branchId),
      ])
    : [[], [], [], []];

  return (
    <div className="space-y-6">
      <DashboardHeader />

      {!branchId ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-ink/50 shadow-sm">
          Your account isn&apos;t assigned to a branch yet, so branch-specific data
          can&apos;t be shown. Contact an admin to get assigned.
        </div>
      ) : (
        <>
          <DashboardStats stats={stats} />

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <TodaySchedule schedule={schedule} />
            <TherapistsOnDuty roster={roster} />
          </div>

          <AlertsPanel verifications={verifications} />

          <LobbyQueue />
        </>
      )}
    </div>
  );
}
