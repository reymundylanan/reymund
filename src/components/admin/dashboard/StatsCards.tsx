import { TrendingDown, TrendingUp } from "lucide-react";
import { adminStats } from "@/lib/adminData";

export default function StatsCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {adminStats.map((stat) => (
        <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-ink/50">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{stat.value}</p>
          <p
            className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
              stat.trendUp ? "text-green-600" : "text-red-500"
            }`}
          >
            {stat.trendUp ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {stat.trend} <span className="text-ink/40">{stat.note}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
