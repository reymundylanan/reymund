import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MultiBranchManager from "@/components/admin/multiBranch/MultiBranchManager";

export const dynamic = "force-dynamic";

export default async function AdminMultiBranchPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") redirect("/admin");

  return <MultiBranchManager />;
}
