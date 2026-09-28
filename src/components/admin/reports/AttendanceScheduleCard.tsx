import type { AttendanceSummary } from "@/lib/supabase/queries/reports";

const STATUS_LABEL: Record<AttendanceSummary["schedule"][number]["status"], string> = {
  present: "Present",
  on_leave: "On Leave",
  day_off: "Day Off",
};

const STATUS_STYLE: Record<AttendanceSummary["schedule"][number]["status"], string> = {
  present: "bg-green-100 text-green-700",
  on_leave: "bg-red-100 text-red-600",
  day_off: "bg-ink/10 text-ink/50",
};

export default function AttendanceScheduleCard({ attendance }: { attendance: AttendanceSummary }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Attendance &amp; Staff Schedule</h2>
      <p className="text-xs text-ink/40">
        Based on today&apos;s leave and day-off records — there&apos;s no separate clock-in system, so this
        reflects who&apos;s scheduled to work, not confirmed physical attendance.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-green-50 p-3">
          <p className="text-xl font-semibold text-green-700">{attendance.present}</p>
          <p className="text-xs text-green-700/70">Present</p>
        </div>
        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-xl font-semibold text-red-600">{attendance.onLeave}</p>
          <p className="text-xs text-red-600/70">On Leave</p>
        </div>
        <div className="rounded-xl bg-ink/5 p-3">
          <p className="text-xl font-semibold text-ink/60">{attendance.dayOff}</p>
          <p className="text-xs text-ink/40">Day Off</p>
        </div>
      </div>

      {attendance.schedule.length > 0 && (
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto border-t border-ink/10 pt-4">
          {attendance.schedule.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div>
                <p className="text-ink">{s.name}</p>
                <p className="text-xs text-ink/40">{s.department ?? "Staff"}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[s.status]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
