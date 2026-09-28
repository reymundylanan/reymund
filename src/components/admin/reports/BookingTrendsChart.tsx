import type { BookingTrendPoint } from "@/lib/supabase/queries/reports";

export default function BookingTrendsChart({ data }: { data: BookingTrendPoint[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.appointments, d.walkIns)));

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Booking Trends</h2>
        <div className="flex items-center gap-3 text-xs text-ink/50">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-coral" /> Appointments
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blush" /> Walk-Ins
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No bookings recorded for this period.</p>
      ) : (
        <div className="mt-4 flex h-48 items-end gap-3">
          {data.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-40 w-full items-end justify-center gap-1">
                <div
                  className="w-1/2 rounded-t bg-coral"
                  style={{ height: `${(d.appointments / max) * 100}%` }}
                  title={`${d.appointments} appointments`}
                />
                <div
                  className="w-1/2 rounded-t bg-blush"
                  style={{ height: `${(d.walkIns / max) * 100}%` }}
                  title={`${d.walkIns} walk-ins`}
                />
              </div>
              <p className="text-[11px] text-ink/40">{d.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
