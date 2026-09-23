import type { StaffRosterItem } from "@/lib/supabase/queries/frontdeskDashboard";

export default function TherapistsOnDuty({ roster }: { roster: StaffRosterItem[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Branch Staff</h2>

      <div className="mt-4 space-y-3">
        {roster.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">
            No staff members assigned to this branch yet.
          </p>
        )}
        {roster.map((t) => (
          <div key={t.id} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
              {t.name.charAt(0)}
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{t.name}</p>
              <p className="text-xs text-ink/50">{t.role}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
