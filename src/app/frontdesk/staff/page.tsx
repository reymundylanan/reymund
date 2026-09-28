import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StaffSchedulePageClient from "@/components/frontdesk/staff/StaffSchedulePageClient";

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

  return <StaffSchedulePageClient />;
}
