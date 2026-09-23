import type { ActivityItem } from "@/lib/supabase/queries/adminDashboard";

export default function RecentActivity({ activity }: { activity: ActivityItem[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">Recent Activity</h3>
      </div>

      <div className="mt-4 space-y-4">
        {activity.length === 0 && (
          <p className="py-4 text-center text-sm text-ink/40">No recent activity yet.</p>
        )}
        {activity.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink/70">{item.text}</p>
            <span className="shrink-0 text-xs text-ink/40">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
