import type { AdminPaymentsStats } from "@/lib/supabase/queries/adminPayments";

export default function PaymentsStats({ stats, live }: { stats: AdminPaymentsStats; live: boolean }) {
  const cards = [
    { label: "Total Settled Revenue", value: `₱${stats.totalRevenue.toLocaleString()}` },
    { label: "Pending Payments", value: stats.pendingCount.toLocaleString() },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c, i) => (
        <div key={c.label} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink/50">{c.label}</p>
            {i === 0 && live && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Live
              </span>
            )}
          </div>
          <p className="mt-2 text-2xl font-semibold text-ink">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
