import { todaySchedule } from "@/lib/frontdeskData";

const statusStyles: Record<string, string> = {
  Finished: "bg-ink/10 text-ink/50",
  "In Service": "bg-coral text-white",
  "Checked In": "bg-green-100 text-green-700",
  "No-Show": "bg-red-100 text-red-600",
  "No Booking": "bg-amber-50 text-amber-600",
};

export default function TodaySchedule() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Today&apos;s Schedule</h2>
        <button className="text-xs font-medium text-coral-dark">
          View Full Queue
        </button>
      </div>
      <p className="text-xs text-ink/40">
        Live view of appointments and therapist availability
      </p>

      <div className="mt-4 space-y-3">
        {todaySchedule.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-ink/10 p-3"
          >
            <div className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-xs font-medium text-ink/50">
                {item.time}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{item.client}</p>
                <p className="text-xs text-ink/50">
                  {item.service} &bull; {item.therapist}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[item.status]}`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
