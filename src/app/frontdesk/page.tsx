import DashboardHeader from "@/components/frontdesk/dashboard/DashboardHeader";
import DashboardStats from "@/components/frontdesk/dashboard/DashboardStats";
import TodaySchedule from "@/components/frontdesk/dashboard/TodaySchedule";
import LobbyQueue from "@/components/frontdesk/dashboard/LobbyQueue";
import TherapistsOnDuty from "@/components/frontdesk/dashboard/TherapistsOnDuty";
import AlertsPanel from "@/components/frontdesk/dashboard/AlertsPanel";

export default function FrontDeskDashboardPage() {
  return (
    <div className="space-y-6">
      <DashboardHeader />
      <DashboardStats />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <TodaySchedule />
        <div className="space-y-6">
          <LobbyQueue />
          <TherapistsOnDuty />
        </div>
      </div>

      <AlertsPanel />
    </div>
  );
}
