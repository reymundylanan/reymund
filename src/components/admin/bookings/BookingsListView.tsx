import type { DbAppointment } from "@/components/admin/bookings/BookingsManager";

const statusStyles: Record<DbAppointment["status"], string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  conflict: "bg-red-100 text-red-600",
};

function formatDateTime(date: string, time: string) {
  const d = new Date(`${date}T${time}`);
  const dayName = d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dayName} • ${timeStr}`;
}

function parseService(notes: string | null) {
  if (!notes) return { service: "—", specialist: "—" };
  const withIdx = notes.indexOf(" with ");
  const dashIdx = notes.indexOf(" — ");
  const service = withIdx > -1 ? notes.slice(0, withIdx).trim() : notes;
  const specialist = withIdx > -1
    ? notes.slice(withIdx + 6, dashIdx > -1 ? dashIdx : undefined).trim()
    : "—";
  return { service, specialist };
}

export default function BookingsListView({
  appointments,
}: {
  appointments: DbAppointment[];
}) {
  if (appointments.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-ink/40 shadow-sm">
        No bookings found.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-ink/40">
            <th className="py-2">Booking ID</th>
            <th className="py-2">Customer</th>
            <th className="py-2">Branch</th>
            <th className="py-2">Service</th>
            <th className="py-2">Specialist</th>
            <th className="py-2">Date / Time</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => {
            const { service, specialist } = parseService(a.notes);
            return (
              <tr
                key={a.id}
                className="border-t border-ink/5"
              >
                <td className="py-3 font-medium text-ink">{a.booking_code}</td>
                <td className="py-3 text-ink/70">{a.client_name}</td>
                <td className="py-3 text-ink/70">{a.branch_name}</td>
                <td className="py-3 text-ink/70">{service}</td>
                <td className="py-3 text-ink/70">{specialist}</td>
                <td className="py-3 text-ink/50">{formatDateTime(a.scheduled_date, a.start_time)}</td>
                <td className="py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[a.status]}`}>
                    {a.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
