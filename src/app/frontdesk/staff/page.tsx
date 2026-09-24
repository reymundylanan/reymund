import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StaffScheduleClient from "@/components/frontdesk/staff/StaffScheduleClient";
import StaffCapacityStats from "@/components/frontdesk/staff/StaffCapacityStats";
import QuickActions from "@/components/frontdesk/staff/QuickActions";

export default async function FrontDeskStaffPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "front_desk") {
    redirect("/frontdesk");
  }

  return (
    <div className="space-y-6">
      <StaffScheduleClient />
      <StaffCapacityStats />
      <QuickActions />
    </div>
  );
}
