import { createClient } from "@/lib/supabase/server";
import { getAdminOverview } from "@/lib/supabase/queries/adminOverview";
import AdminOverview from "@/components/admin/dashboard/AdminOverview";
import DateTimeChips from "@/components/admin/dashboard/DateTimeChips";
import CommandCenter from "@/components/admin/dashboard/CommandCenter";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const data = await getAdminOverview(supabase);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-taupe">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <DateTimeChips />
      </div>

      <AdminOverview data={data} />

      <CommandCenter />
    </div>
  );
}
