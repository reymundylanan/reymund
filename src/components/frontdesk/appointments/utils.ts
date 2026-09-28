import type { SessionStatus } from "@/lib/sessionStatus";

export type ClientInfo = { full_name: string; phone: string | null; avatar_url?: string | null };
export type PaymentInfo = { method: string; status: string; amount: number };

type NamedRef = { name?: string; full_name?: string; department?: string | null; avatar_url?: string | null };

export type AppointmentRow = {
  id: string;
  booking_code: string | null;
  appointment_type: "solo" | "group";
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  session_status: SessionStatus | null;
  arrival_time: string | null;
  service_started_at: string | null;
  professional_id: string | null;
  service_id: string | null;
  notes: string | null;
  staff_notes: string | null;
  created_at: string;
  client: ClientInfo | ClientInfo[] | null;
  professional: NamedRef | NamedRef[] | null;
  service: NamedRef | NamedRef[] | null;
  payments: PaymentInfo[] | null;
};

export function clientInfo(client: AppointmentRow["client"]): ClientInfo {
  if (!client) return { full_name: "—", phone: null, avatar_url: null };
  return Array.isArray(client) ? client[0] ?? { full_name: "—", phone: null, avatar_url: null } : client;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Prefer the real professional_id join; fall back to parsing the
 * legacy notes text for appointments booked before that column was
 * populated (see parseService). */
export function appointmentStaffName(row: AppointmentRow): string {
  const joined = one(row.professional)?.full_name;
  if (joined) return joined;
  return parseService(row.notes).specialist;
}

export function appointmentServiceName(row: AppointmentRow): string {
  const joined = one(row.service)?.name;
  if (joined) return joined;
  return parseService(row.notes).service;
}

export function parseService(notes: string | null) {
  if (!notes) return { service: "—", specialist: "—", amount: "—" };
  const withIdx = notes.indexOf(" with ");
  const dashIdx = notes.indexOf(" — ");
  const service = withIdx > -1 ? notes.slice(0, withIdx).trim() : notes;
  const specialist =
    withIdx > -1 ? notes.slice(withIdx + 6, dashIdx > -1 ? dashIdx : undefined).trim() : "—";
  const amount = dashIdx > -1 ? notes.slice(dashIdx + 3).trim() : "—";
  return { service, specialist, amount };
}

export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

export function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function hasSpecificSpecialist(specialist: string) {
  return specialist !== "—" && specialist.toLowerCase() !== "any professional";
}
