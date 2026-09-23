import { createClient } from "@/lib/supabase/server";
import {
  getAdminStats,
  getBookingTrends,
  getPendingBookingAlerts,
  getRevenueByBranch,
  getRecentActivity,
} from "@/lib/supabase/queries/adminDashboard";
import StatsCards from "@/components/admin/dashboard/StatsCards";
import BookingTrends from "@/components/admin/dashboard/BookingTrends";
import CriticalAlerts from "@/components/admin/dashboard/CriticalAlerts";
import RevenueByBranch from "@/components/admin/dashboard/RevenueByBranch";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";
import CommandCenter from "@/components/admin/dashboard/CommandCenter";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [stats, bookingTrends, alerts, revenueByBranch, activity] = await Promise.all([
    getAdminStats(supabase),
    getBookingTrends(supabase),
    getPendingBookingAlerts(supabase),
    getRevenueByBranch(supabase),
    getRecentActivity(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard Overview</h1>
      </div>

      <StatsCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <BookingTrends bookingTrends={bookingTrends} />
        <CriticalAlerts alerts={alerts} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueByBranch revenueByBranch={revenueByBranch} />
        <RecentActivity activity={activity} />
      </div>

      <CommandCenter />
    </div>
  );
}
