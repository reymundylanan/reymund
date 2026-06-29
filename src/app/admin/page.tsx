import StatsCards from "@/components/admin/dashboard/StatsCards";
import BookingTrends from "@/components/admin/dashboard/BookingTrends";
import CriticalAlerts from "@/components/admin/dashboard/CriticalAlerts";
import RevenueByBranch from "@/components/admin/dashboard/RevenueByBranch";
import RecentActivity from "@/components/admin/dashboard/RecentActivity";
import CommandCenter from "@/components/admin/dashboard/CommandCenter";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Dashboard Overview</h1>
        <p className="text-sm text-ink/50">
          Welcome back, Admin. Here&apos;s what&apos;s happening across GlowSync today.
        </p>
      </div>

      <StatsCards />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <BookingTrends />
        <CriticalAlerts />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueByBranch />
        <RecentActivity />
      </div>

      <CommandCenter />
    </div>
  );
}
