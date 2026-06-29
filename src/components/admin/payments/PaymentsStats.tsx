import { paymentStats } from "@/lib/adminData";

export default function PaymentsStats() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {paymentStats.map((stat) => (
        <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-ink/50">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
