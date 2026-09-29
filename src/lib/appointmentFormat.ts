// Shared by the client appointment page, My Bookings, and Messenger
// messages. Dates/times are Manila-local strings from Postgres
// ("2026-10-07", "14:30:00") and are formatted as-is, never converted.

export function formatAppointmentDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatAppointmentTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export function humanizeStatus(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const appointmentStatusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-ink/10 text-ink/50",
  no_show: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

function formatDateTime(value: string | null): string {
  if (!value) return "an earlier time";
  const [date, time] = value.split(" ");
  return time ? `${formatAppointmentDate(date)} · ${formatAppointmentTime(time)}` : formatAppointmentDate(date);
}

export function describeHistoryEvent(e: { eventType: string; fromValue: string | null; toValue: string | null }): string {
  if (e.eventType === "created") return "Booked";
  if (e.eventType === "reschedule") {
    return `Rescheduled from ${formatDateTime(e.fromValue)} to ${formatDateTime(e.toValue)}`;
  }
  return `Marked as ${humanizeStatus(e.toValue ?? "updated")}`;
}
