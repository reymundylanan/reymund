import { recentActivity } from "@/lib/adminData";

export default function RecentActivity() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">Recent Activity</h3>
        <button className="text-xs font-medium text-coral-dark">
          View All History
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {recentActivity.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink/70">
              <span className="font-medium text-ink">{item.actor}</span>{" "}
              {item.action}
            </p>
            <span className="shrink-0 text-xs text-ink/40">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
