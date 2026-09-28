import type { TopStaffRow } from "@/lib/supabase/queries/reports";

export default function TopStaffCard({ staff }: { staff: TopStaffRow[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Top Performing Staff</h2>
      <p className="text-xs text-ink/40">Ranked by completed appointments this period</p>

      {staff.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No completed appointments for this period.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush text-sm font-bold text-coral-dark">
                  {s.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium text-ink">{s.name}</p>
                  <p className="text-xs text-ink/40">{s.department ?? "Staff"}</p>
                </div>
              </div>
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                {s.completed} completed
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
