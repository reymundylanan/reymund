import type { TopService } from "@/lib/supabase/queries/reports";

export default function TopServicesCard({ services }: { services: TopService[] }) {
  const max = Math.max(1, ...services.map((s) => s.bookings));

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Top Services</h2>

      {services.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No services booked for this period.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {services.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blush text-xs font-semibold text-coral-dark">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-medium text-ink">{s.name}</p>
                  <p className="text-ink/50">
                    {s.bookings} bookings{s.revenue > 0 && ` · ₱${s.revenue.toLocaleString()}`}
                  </p>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-ink/5">
                  <div className="h-1.5 rounded-full bg-coral" style={{ width: `${(s.bookings / max) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
