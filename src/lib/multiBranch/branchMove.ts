import type { SupabaseClient } from "@supabase/supabase-js";
import { checkSlot, proposeAt, toMinutes, toTime, type Appointment, type Context, type Suggestion } from "./engine";
import { loadContext, manilaNow } from "./load";

export type BranchMoveItem = { appointment: Appointment; proposal: Suggestion | null };
export type BranchMove = { appointmentId: string; staffId: string | null; date: string; start: string };

const STARTED = ["no_show", "completed", "paid", "arrived", "waiting", "ready", "late_arrival", "in_service"];

/** Upcoming bookings at a branch that haven't started yet (what a closure affects). */
export function upcomingAt(ctx: Context, branchId: string): Appointment[] {
  return ctx.appointments
    .filter(
      (a) =>
        a.branchId === branchId &&
        (a.status === "pending" || a.status === "confirmed") &&
        !STARTED.includes(a.sessionStatus ?? "") &&
        (a.date > ctx.today || (a.date === ctx.today && toMinutes(a.start) + a.duration > ctx.nowMinutes))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start) - toMinutes(b.start));
}

/** The context as if this booking already sat in its new slot. */
function place(ctx: Context, appt: Appointment, branchId: string, staffId: string | null, date: string, start: number): Context {
  return {
    ...ctx,
    appointments: ctx.appointments.map((a) => (a.id === appt.id ? { ...a, branchId, professionalId: staffId, date, start: toTime(start) } : a)),
  };
}

/** Every upcoming booking at `from`, each with a valid slot at `to` — the same
 * day and time with any qualified free staff (their own first), else the
 * nearest free time that day. Bookings are placed one after another, so two
 * clients are never given the same person at the same time. */
export function planBranchMove(ctx: Context, fromBranchId: string, toBranchId: string): BranchMoveItem[] {
  let work = ctx;
  return upcomingAt(ctx, fromBranchId).map((appointment) => {
    const proposal = proposeAt(work, appointment, toBranchId);
    if (proposal) work = place(work, appointment, toBranchId, proposal.staffId, proposal.date, proposal.start);
    return { appointment, proposal };
  });
}

/** Re-checks the chosen moves in order against live data (each one counting
 * the ones before it). Returns the reason for any that no longer fit. */
export function checkBranchMoves(ctx: Context, fromBranchId: string, toBranchId: string, moves: BranchMove[]) {
  const upcoming = new Map(upcomingAt(ctx, fromBranchId).map((a) => [a.id, a]));
  let work = ctx;
  return moves.map((m) => {
    const appt = upcoming.get(m.appointmentId);
    if (!appt) return { move: m, appt: null, check: null, problem: "This booking is no longer upcoming at that branch." };
    const start = toMinutes(m.start);
    const check = checkSlot(work, {
      branchId: toBranchId,
      staffId: m.staffId,
      date: m.date,
      start,
      duration: appt.duration,
      departments: appt.departments,
      services: appt.services,
      excludeAppointmentId: appt.id,
    });
    if (check.ok) work = place(work, appt, toBranchId, m.staffId, m.date, start);
    return { move: m, appt, check, problem: check.ok ? null : check.reasons.join(" ") };
  });
}

/** Live data far enough ahead to cover the branch's last upcoming booking. */
export async function branchMoveContext(supabase: SupabaseClient, fromBranchId: string): Promise<Context> {
  const { today } = manilaNow();
  const { data } = await supabase
    .from("appointments")
    .select("scheduled_date")
    .eq("branch_id", fromBranchId)
    .gte("scheduled_date", today)
    .in("status", ["pending", "confirmed"])
    .order("scheduled_date", { ascending: false })
    .limit(1);
  const last = (data?.[0] as { scheduled_date: string } | undefined)?.scheduled_date ?? today;
  return loadContext(supabase, { date: last, days: 1 });
}
