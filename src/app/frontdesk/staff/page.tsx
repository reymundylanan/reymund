import StaffScheduleClient from "@/components/frontdesk/staff/StaffScheduleClient";
import StaffCapacityStats from "@/components/frontdesk/staff/StaffCapacityStats";
import QuickActions from "@/components/frontdesk/staff/QuickActions";

export default function FrontDeskStaffPage() {
  return (
    <div className="space-y-6">
      <StaffScheduleClient />
      <StaffCapacityStats />
      <QuickActions />
    </div>
  );
}
