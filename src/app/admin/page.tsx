import { createClient } from "@/lib/supabase/server";
import { getAdminOverview } from "@/lib/supabase/queries/adminOverview";
import AdminOverview from "@/components/admin/dashboard/AdminOverview";
import WelcomeBanner from "@/components/admin/dashboard/WelcomeBanner";
import CommandCenter from "@/components/admin/dashboard/CommandCenter";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [data, { data: auth }] = await Promise.all([getAdminOverview(supabase), supabase.auth.getUser()]);
  const { data: me } = auth.user ? await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle() : { data: null };
  const firstName = (me?.full_name ?? "").trim().split(/\s+/)[0] || null;

  return (
    <div className="space-y-6">
      <WelcomeBanner firstName={firstName} data={data} />

      <AdminOverview data={data} />

      <CommandCenter />
    </div>
  );
}
