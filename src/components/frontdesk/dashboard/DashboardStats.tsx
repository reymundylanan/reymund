import { fdStats } from "@/lib/frontdeskData";

export default function DashboardStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {fdStats.map((stat) => (
        <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm" style={{ borderLeft: "4px solid #C89D4B" }}>
          <p className="text-sm" style={{ color: "#CFBCA8" }}>{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold" style={{ color: "#8D6F5D" }}>{stat.value}</p>
          <p className="mt-2 text-xs" style={{ color: "#CFBCA8" }}>{stat.note}</p>
        </div>
      ))}
    </div>
  );
}
