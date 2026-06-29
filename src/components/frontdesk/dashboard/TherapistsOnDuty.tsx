import { therapistsOnDuty } from "@/lib/frontdeskData";

const statusStyles: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  "On Break": "bg-amber-100 text-amber-700",
  Available: "bg-ink/10 text-ink/50",
};

export default function TherapistsOnDuty() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Therapists On-Duty</h2>
        <button className="text-xs font-medium text-coral-dark">
          View Staff Schedule
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {therapistsOnDuty.map((t) => (
          <div key={t.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
                {t.name.charAt(0)}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{t.name}</p>
                <p className="text-xs text-ink/50">{t.role}</p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[t.status]}`}
            >
              {t.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
