import StaffScheduleHeader from "@/components/frontdesk/staff/StaffScheduleHeader";
import StaffCapacityStats from "@/components/frontdesk/staff/StaffCapacityStats";
import StaffShiftGrid from "@/components/frontdesk/staff/StaffShiftGrid";
import QuickActions from "@/components/frontdesk/staff/QuickActions";

export default function FrontDeskStaffPage() {
  return (
    <div className="space-y-6">
      <StaffScheduleHeader />
      <StaffCapacityStats />
      <StaffShiftGrid />
      <QuickActions />
    </div>
  );
}
