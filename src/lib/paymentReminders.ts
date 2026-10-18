import { parseBookingNotes } from "@/lib/bookingNotes";
import { formatDay, formatTime, toMinutes } from "@/lib/multiBranch/engine";

/** One upcoming booking, as the daily payment reminder sees it. */
export type ReminderBooking = {
  id: string;
  clientId: string | null;
  code: string | null;
  date: string;
  start: string;
  status: string;
  sessionStatus: string | null;
  visitType: string | null;
  notes: string | null;
  promoPrice: number | null;
  branchName: string;
  isSpaParty: boolean;
  payments: { status: string; amount: number }[];
  /** A payment notice was already sent for this booking recently. */
  recentlyNotified: boolean;
};

export type PaymentReminder = { appointmentId: string; clientId: string; title: string; body: string; linkPath: string; due: number };

const STARTED = new Set(["arrived", "waiting", "ready", "late_arrival", "in_service", "completed", "paid", "no_show"]);
const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

/** Tomorrow's bookings with money still owed → one reminder each. Skips
 * walk-ins, bookings without an account or a known price, ones being
 * verified (GCash sent), fully paid, started, or already reminded. */
export function planPaymentReminders(bookings: ReminderBooking[], today: string): PaymentReminder[] {
  const out: PaymentReminder[] = [];
  for (const b of bookings) {
    if (!b.clientId || b.recentlyNotified) continue;
    if (b.status !== "pending" && b.status !== "confirmed") continue;
    if (b.visitType === "walk_in" || STARTED.has(b.sessionStatus ?? "")) continue;
    // A GCash payment waiting for the front desk: nothing to ask the client.
    if (b.payments.some((p) => p.status === "pending")) continue;
    const price = parseBookingNotes(b.notes).price ?? b.promoPrice;
    if (!price || price <= 0) continue;
    const paid = b.payments.filter((p) => p.status === "settled").reduce((s, p) => s + (p.amount || 0), 0);
    const due = Math.round((price - paid) * 100) / 100;
    if (due <= 0) continue;

    const when = `${formatDay(b.date, today)} at ${formatTime(toMinutes(b.start))}`;
    const booking = b.code ? `booking ${b.code}` : "your booking";
    const partly = paid > 0 ? ` (${peso(paid)} paid so far)` : "";
    const party = b.isSpaParty ? " Spa Party packages need full payment to confirm your date." : "";
    out.push({
      appointmentId: b.id,
      clientId: b.clientId,
      title: "Payment reminder",
      body: `${booking[0].toUpperCase()}${booking.slice(1)} is ${when} at ${b.branchName}, with ${peso(due)} still to pay${partly}.${party} You can pay ahead with GCash, or at the branch before your treatment.`,
      linkPath: `/my-glow/appointments/${b.id}`,
      due,
    });
  }
  return out;
}
