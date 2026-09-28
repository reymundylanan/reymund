import { CalendarClock, PersonStanding, PhilippinePeso, Users } from "lucide-react";
import type { ReportsSummary } from "@/lib/supabase/queries/reports";

function TrendBadge({ pct }: { pct: number }) {
  const positive = pct >= 0;
  return (
    <span className={`text-xs font-medium ${positive ? "text-green-600" : "text-red-600"}`}>
      {positive ? "↑" : "↓"} {Math.abs(pct)}% vs last period
    </span>
  );
}

export default function ReportsKpiCards({ summary }: { summary: ReportsSummary }) {
  const cards = [
    {
      label: "Total Revenue",
      value: `₱${summary.totalRevenue.toLocaleString()}`,
      trend: summary.revenueTrendPct,
      icon: PhilippinePeso,
      iconClass: "bg-amber-50 text-amber-600",
    },
    {
      label: "Total Appointments",
      value: summary.totalAppointments.toLocaleString(),
      trend: summary.appointmentsTrendPct,
      icon: CalendarClock,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "Walk-Ins",
      value: summary.walkIns.toLocaleString(),
      trend: summary.walkInsTrendPct,
      icon: PersonStanding,
      iconClass: "bg-pink-50 text-pink-600",
    },
    {
      label: "Total Clients",
      value: summary.totalClients.toLocaleString(),
      trend: summary.clientsTrendPct,
      icon: Users,
      iconClass: "bg-purple-50 text-purple-600",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.iconClass}`}>
              <c.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-ink/50">{c.label}</p>
              <p className="text-2xl font-semibold text-ink">{c.value}</p>
            </div>
          </div>
          <div className="mt-2">
            <TrendBadge pct={c.trend} />
          </div>
        </div>
      ))}
    </div>
  );
}
