import type { ClientAnalytics } from "@/lib/supabase/queries/reports";

export default function ClientAnalyticsCard({ analytics }: { analytics: ClientAnalytics }) {
  const growthMax = Math.max(1, ...analytics.growth.map((g) => g.value));

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Client Analytics</h2>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-ink/40">Top Spending Clients</p>
          {analytics.topSpenders.length === 0 ? (
            <p className="mt-3 text-sm text-ink/40">No client spending recorded for this period.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {analytics.topSpenders.map((c, i) => (
                <div key={c.name + i} className="flex items-center justify-between text-sm">
                  <span className="text-ink/70">
                    {i + 1}. {c.name}
                  </span>
                  <span className="font-medium text-ink">₱{c.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-ink/40">New Client Growth</p>
          {analytics.growth.length === 0 ? (
            <p className="mt-3 text-sm text-ink/40">No new clients signed up in this period.</p>
          ) : (
            <div className="mt-3 flex h-24 items-end gap-1.5">
              {analytics.growth.map((g, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-coral"
                    style={{ height: `${(g.value / growthMax) * 100}%`, minHeight: 4 }}
                    title={`${g.value} new clients`}
                  />
                  <p className="text-[10px] text-ink/40">{g.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
