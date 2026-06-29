import { fdStats } from "@/lib/frontdeskData";

export default function DashboardStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {fdStats.map((stat) => (
        <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-ink/50">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{stat.value}</p>
          <p className="mt-2 text-xs text-ink/40">{stat.note}</p>
        </div>
      ))}
    </div>
  );
}
