import { bookingStats } from "@/lib/adminData";

export default function BookingsStats() {
  return (
    <div className="flex gap-6 rounded-2xl bg-white p-4 px-6 shadow-sm">
      {bookingStats.map((s) => (
        <p key={s.label} className="text-sm">
          <span className={`text-lg font-semibold ${s.color}`}>{s.value}</span>{" "}
          <span className="text-ink/50">{s.label}</span>
        </p>
      ))}
    </div>
  );
}
