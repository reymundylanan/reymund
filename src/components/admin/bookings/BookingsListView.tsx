import { appointments, weekDays } from "@/lib/adminData";
import type { Appointment } from "@/lib/adminData";

const statusStyles: Record<Appointment["status"], string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  conflict: "bg-red-100 text-red-600",
};

function formatTime(startHour: number, duration: number) {
  const fmt = (h: number) => {
    const hour24 = Math.floor(h);
    const min = Math.round((h - hour24) * 60);
    const meridiem = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${min.toString().padStart(2, "0")} ${meridiem}`;
  };
  return `${fmt(startHour)} - ${fmt(startHour + duration)}`;
}

export default function BookingsListView({
  onSelect,
}: {
  onSelect: (a: Appointment) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-ink/40">
            <th className="py-2">Booking ID</th>
            <th className="py-2">Customer</th>
            <th className="py-2">Service</th>
            <th className="py-2">Specialist</th>
            <th className="py-2">Date / Time</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr
              key={a.id}
              onClick={() => onSelect(a)}
              className="cursor-pointer border-t border-ink/5 hover:bg-blush/40"
            >
              <td className="py-3 font-medium text-ink">{a.bookingId}</td>
              <td className="py-3 text-ink/70">{a.customer}</td>
              <td className="py-3 text-ink/70">{a.service}</td>
              <td className="py-3 text-ink/70">{a.specialist}</td>
              <td className="py-3 text-ink/50">
                {weekDays[a.day]} &bull; {formatTime(a.startHour, a.duration)}
              </td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[a.status]}`}
                >
                  {a.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
