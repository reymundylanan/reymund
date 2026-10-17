/**
 * Which column each record belongs to on the Multi-Branch boards. These are
 * views of the real data — moving between them happens through the real
 * workflows (Punch In, Start / Complete service, confirmations), never by
 * editing the column itself.
 */
import type { StaffStatus } from "./engine";

// ── Staff ──
export type StaffLane = "available" | "in_service" | "on_break" | "scheduled" | "day_off" | "out";
export const STAFF_LANES: { key: StaffLane; label: string; hint: string }[] = [
  { key: "available", label: "Available", hint: "Punched in and free" },
  { key: "in_service", label: "In Service", hint: "Serving a client" },
  { key: "on_break", label: "On Break", hint: "Back within the hour" },
  { key: "scheduled", label: "Scheduled", hint: "Working, not punched in yet" },
  { key: "day_off", label: "Day Off", hint: "Off, on leave or lent out" },
  { key: "out", label: "Out", hint: "Punched out" },
];
export function staffLane(status: StaffStatus): StaffLane {
  if (status === "available" || status === "in_service" || status === "on_break" || status === "out") return status;
  if (status === "day_off" || status === "lent_out") return "day_off";
  return "scheduled"; // scheduled, partial_off
}

// ── Client users ──
export type ClientLane = "recent" | "active" | "inactive" | "assist";
export const CLIENT_LANES: { key: ClientLane; label: string; hint: string }[] = [
  { key: "recent", label: "Recently Registered", hint: "Joined in the last 30 days" },
  { key: "active", label: "Active Clients", hint: "Visited in 90 days or booked" },
  { key: "inactive", label: "Inactive Clients", hint: "No visit in 90 days" },
  { key: "assist", label: "Needs Assistance", hint: "Restricted or missing contact" },
];
export function clientLane(
  c: { upcoming: number; lastVisit: string | null; createdAt?: string | null; restricted?: boolean; phone?: string | null; hasAccount: boolean },
  today: string
): ClientLane {
  if (c.restricted || (c.hasAccount && !c.phone)) return "assist";
  const days = (from: string) => (Date.parse(today) - Date.parse(from.slice(0, 10))) / 86_400_000;
  if (c.createdAt && days(c.createdAt) <= 30) return "recent";
  if (c.upcoming > 0 || (c.lastVisit && days(c.lastVisit) <= 90)) return "active";
  return "inactive";
}

// ── Services ──
export type ServiceLane = "active" | "inactive" | "setup";
export const SERVICE_LANES: { key: ServiceLane; label: string; hint: string }[] = [
  { key: "active", label: "Active Services", hint: "Offered at a branch" },
  { key: "inactive", label: "Inactive Services", hint: "Switched off everywhere" },
  { key: "setup", label: "Needs Configuration", hint: "Missing price, time or staff" },
];
export function serviceLane(s: { offered: boolean; price: number; hasSizePrices: boolean; duration: number; qualifiedStaff: number }): ServiceLane {
  if (s.offered && ((s.price <= 0 && !s.hasSizePrices) || s.duration <= 0 || s.qualifiedStaff === 0)) return "setup";
  return s.offered ? "active" : "inactive";
}

// ── Payments (kept apart from the booking status) ──
export type PaymentState = "unpaid" | "advance" | "partial" | "paid" | "verify";
export const PAYMENT_LABEL: Record<PaymentState, string> = {
  unpaid: "Unpaid",
  advance: "Advance paid",
  partial: "Partly paid",
  paid: "Paid",
  verify: "Verify GCash",
};
export function paymentState(price: number | null, payments: { status: string; amount: number; type: string | null }[]): PaymentState {
  if (payments.some((p) => p.status === "pending")) return "verify";
  const settled = payments.filter((p) => p.status === "settled");
  const total = settled.reduce((s, p) => s + Number(p.amount || 0), 0);
  if (total <= 0) return "unpaid";
  if (price != null && total >= price) return "paid";
  if (price == null && settled.some((p) => p.type !== "pay_now")) return "paid";
  return settled.every((p) => p.type === "pay_now") ? "advance" : "partial";
}

// ── Walk-ins ──
export type WalkinLane = "waiting" | "in_service" | "time_reached" | "overdue" | "completed";
export const WALKIN_LANES: { key: WalkinLane; label: string; hint: string }[] = [
  { key: "waiting", label: "Waiting", hint: "Registered, not started" },
  { key: "in_service", label: "In Service", hint: "Timer running" },
  { key: "time_reached", label: "Time Reached", hint: "Estimated time is up" },
  { key: "overdue", label: "Overdue", hint: "Still going past the estimate" },
  { key: "completed", label: "Completed", hint: "Finished today" },
];
/** Minutes after the estimate still shown as "Time Reached" before "Overdue". */
export const GRACE_MIN = 10;
export function walkinLane(
  v: { status: string; sessionStatus: string | null; serviceStartedAt: string | null; duration: number },
  nowMs: number
): { lane: WalkinLane | null; elapsed: number; remaining: number } {
  const done = v.status === "completed" || v.sessionStatus === "completed" || v.sessionStatus === "paid";
  if (v.status === "cancelled" || v.sessionStatus === "no_show") return { lane: null, elapsed: 0, remaining: 0 };
  if (done) return { lane: "completed", elapsed: 0, remaining: 0 };
  if (v.sessionStatus !== "in_service") return { lane: "waiting", elapsed: 0, remaining: v.duration };
  const started = v.serviceStartedAt ? Date.parse(v.serviceStartedAt) : nowMs;
  const elapsed = Math.max(0, Math.floor((nowMs - started) / 60_000));
  const remaining = v.duration - elapsed;
  // Never completes on its own — it only changes column as time passes.
  const lane: WalkinLane = remaining > 0 ? "in_service" : -remaining < GRACE_MIN ? "time_reached" : "overdue";
  return { lane, elapsed, remaining };
}
