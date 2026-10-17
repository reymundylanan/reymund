import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { toMinutes } from "./engine";
import { paymentState, type PaymentState } from "./boards";
import { parseBookingNotes } from "@/lib/bookingNotes";

/** One visit on a day's timeline (walk-in or booked appointment). */
export type DayVisit = {
  id: string;
  /** "YYYY-MM-DD" — lists that span several days group by it. */
  date: string;
  code: string | null;
  branchId: string;
  kind: "walk_in" | "booking";
  clientName: string;
  phone: string | null;
  hasAccount: boolean;
  staffName: string | null;
  service: string;
  start: number;
  duration: number;
  status: string;
  sessionStatus: string | null;
  arrivedAt: string | null;
  paid: boolean;
  /** Separate from the booking status: unpaid, advance, partly paid, paid, GCash to verify. */
  payment: PaymentState;
  /** Booked total when known (from the booking summary or promo price). */
  price: number | null;
  /** When the service actually started (walk-in timer). */
  serviceStartedAt: string | null;
};

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Row = {
  id: string;
  booking_code: string | null;
  branch_id: string;
  client_id: string | null;
  walkin_name: string | null;
  walkin_phone: string | null;
  visit_type: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number | null;
  status: string;
  session_status: string | null;
  arrival_time: string | null;
  service_started_at: string | null;
  promo_price: number | null;
  notes: string | null;
  client: Rel<{ full_name: string | null; phone: string | null }>;
  professional: Rel<{ full_name: string | null }>;
  appointment_services: { service_name: string; position: number }[] | null;
  payments: { status: string; amount: number | null; payment_type: string | null }[] | null;
};

/** Every walk-in and booking on one date, at every branch (cancelled ones too, so the day is complete). */
export function loadDay(supabase: SupabaseClient, date: string): Promise<DayVisit[]> {
  return loadVisits(supabase, date, date);
}

/** Every walk-in and booking from one date to another (inclusive), by date and time. */
export async function loadVisits(supabase: SupabaseClient, from: string, to: string): Promise<DayVisit[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, booking_code, branch_id, client_id, walkin_name, walkin_phone, visit_type, scheduled_date, start_time, duration_minutes, status, session_status, arrival_time, service_started_at, promo_price, notes, client:profiles!appointments_client_id_fkey(full_name, phone), professional:staff_members(full_name), appointment_services(service_name, position), payments(status, amount, payment_type)"
    )
    .gte("scheduled_date", from)
    .lte("scheduled_date", to)
    .order("scheduled_date")
    .order("start_time")
    .limit(3000);
  if (error) logQueryError("multiBranch.loadDay", error);

  return ((data ?? []) as unknown as Row[]).map((r) => {
    const lines = [...(r.appointment_services ?? [])].sort((a, b) => a.position - b.position);
    const client = one(r.client);
    const walkIn = r.visit_type === "walk_in" || (!r.client_id && !!r.walkin_name);
    const price = parseBookingNotes(r.notes).price ?? (r.promo_price != null ? Number(r.promo_price) : null);
    const pays = (r.payments ?? []).map((p) => ({ status: p.status, amount: Number(p.amount ?? 0), type: p.payment_type }));
    return {
      id: r.id,
      date: r.scheduled_date,
      code: r.booking_code,
      branchId: r.branch_id,
      kind: walkIn ? "walk_in" : "booking",
      clientName: client?.full_name ?? r.walkin_name ?? "Client",
      phone: client?.phone ?? r.walkin_phone ?? null,
      hasAccount: !!r.client_id,
      staffName: one(r.professional)?.full_name ?? null,
      service: lines.length ? lines.map((l) => l.service_name).join(", ") : (r.notes ?? "").split(" with ")[0] || "Service",
      start: toMinutes(r.start_time),
      duration: r.duration_minutes || 60,
      status: String(r.status),
      sessionStatus: r.session_status,
      arrivedAt: r.arrival_time,
      paid: (r.payments ?? []).some((p) => p.status === "settled"),
      payment: paymentState(price, pays),
      price,
      serviceStartedAt: r.service_started_at,
    };
  });
}

/** Side-by-side lanes for overlapping visits: each gets a lane and how many
 * lanes its overlapping group needs (so blocks never cover each other). */
export function layoutLanes<T extends { start: number; duration: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.duration - a.duration);
  const out: (T & { lane: number; lanes: number })[] = [];
  let group: (T & { lane: number; lanes: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.lanes = lanes;
    out.push(...group);
    group = [];
  };
  for (const item of sorted) {
    if (group.length && item.start >= groupEnd) flush();
    const laneEnds: number[] = [];
    for (const g of group) laneEnds[g.lane] = Math.max(laneEnds[g.lane] ?? 0, g.start + g.duration);
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.length;
    group.push({ ...item, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, item.start + item.duration);
  }
  if (group.length) flush();
  return out;
}

/** How a visit is doing, for its label and colour. */
export function visitState(v: Pick<DayVisit, "status" | "sessionStatus">): { label: string; tone: "green" | "blue" | "amber" | "red" | "gray" } {
  if (v.status === "cancelled") return { label: "Cancelled", tone: "gray" };
  if (v.sessionStatus === "no_show") return { label: "No-show", tone: "red" };
  if (v.status === "completed" || v.sessionStatus === "completed" || v.sessionStatus === "paid") return { label: "Done", tone: "green" };
  if (v.sessionStatus === "in_service") return { label: "In service", tone: "blue" };
  if (v.sessionStatus && ["arrived", "waiting", "ready", "late_arrival"].includes(v.sessionStatus)) return { label: "Arrived", tone: "blue" };
  if (v.status === "pending") return { label: "Pending", tone: "amber" };
  return { label: "Confirmed", tone: "blue" };
}
