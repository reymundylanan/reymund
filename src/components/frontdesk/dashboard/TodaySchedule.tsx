import type { ScheduleItem } from "@/lib/supabase/queries/frontdeskDashboard";

const statusStyles: Record<string, string> = {
  completed: "bg-ink/10 text-ink/50",
  in_service: "bg-coral text-white",
  checked_in: "bg-green-100 text-green-700",
  confirmed: "bg-blue-100 text-blue-700",
  pending: "bg-amber-50 text-amber-600",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

const statusLabels: Record<string, string> = {
  completed: "Finished",
  in_service: "In Service",
  checked_in: "Checked In",
  confirmed: "Upcoming",
  pending: "Upcoming",
  no_show: "No-Show",
  conflict: "Conflict",
  cancelled: "Cancelled",
};

export default function TodaySchedule({ schedule }: { schedule: ScheduleItem[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Today&apos;s Schedule</h2>
      </div>
      <p className="text-xs text-ink/40">
        Live view of today&apos;s appointments at your branch
      </p>

      <div className="mt-4 space-y-3">
        {schedule.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">
            No appointments scheduled for today.
          </p>
        )}
        {schedule.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-ink/10 p-3"
          >
            <div className="flex items-center gap-4">
              <span className="w-20 shrink-0 text-xs font-medium text-ink/50">
                {item.time}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{item.client}</p>
                <p className="text-xs text-ink/50">{item.service}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                statusStyles[item.status] ?? "bg-ink/10 text-ink/50"
              }`}
            >
              {statusLabels[item.status] ?? item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
