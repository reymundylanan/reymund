import { bookingTrends } from "@/lib/adminData";

export default function BookingTrends() {
  const max = Math.max(...bookingTrends.map((d) => d.value));
  const width = 560;
  const height = 160;
  const step = width / (bookingTrends.length - 1);

  const points = bookingTrends.map((d, i) => {
    const x = i * step;
    const y = height - (d.value / max) * height;
    return [x, y];
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">Booking Trends</h3>
        <span className="text-xs text-ink/40">Appointment bookings this week</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full">
        <path d={areaPath} fill="#fbeaea" />
        <path d={linePath} fill="none" stroke="#e2806b" strokeWidth={2.5} />
        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="#e2806b" />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-xs text-ink/40">
        {bookingTrends.map((d) => (
          <span key={d.day}>{d.day.split(" ")[0]}</span>
        ))}
      </div>
    </div>
  );
}
