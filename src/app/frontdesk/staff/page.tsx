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

  // Admin may do everything Front Desk can (055).
  if (!profile || !["front_desk", "admin"].includes(profile.role)) {
    redirect("/frontdesk");
  }

  return <StaffSchedulePageClient />;
}
