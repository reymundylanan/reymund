import { formatDay, staffStatus, type Context, type Staff } from "./engine";
import { staffLane, type StaffLane } from "./boards";

export type DayOffPlan =
  | { ok: true; action: "add" | "remove"; question: string }
  | { ok: false; reason: string };

const WORKING = new Set(["available", "in_service", "on_break"]);

/** Staff board: dropping a card on Day Off (or back on Scheduled) gives or
 * takes away a full day off for that date. Every other lane follows
 * attendance and can't be set by dragging. */
export function planDayOff(ctx: Context, staff: Staff, date: string, to: StaffLane): DayOffPlan {
  const day = formatDay(date, ctx.today);
  // "today" / "tomorrow" / "on Tue, Oct 20"
  const on = day === "Today" || day === "Tomorrow" ? day.toLowerCase() : `on ${day}`;
  const branchId = staff.branchId;
  const name = staff.name;
  if (!branchId) return { ok: false, reason: `${name} has no home branch, so a day off can't be set here.` };
  const status = staffStatus(ctx, staff.id, branchId, date);
  const from = staffLane(status);
  const off = ctx.offs.find((o) => o.staffId === staff.id && o.date === date);

  if (to === "day_off") {
    if (from === "day_off") return { ok: false, reason: `${name} is already off ${on}.` };
    if (date < ctx.today) return { ok: false, reason: `${day} has passed — days off can only be set for today or later.` };
    if (date === ctx.today && WORKING.has(status)) return { ok: false, reason: `${name} is at work right now. Punch them out first, or set the day off for another date.` };
    const booked = ctx.appointments.filter(
      (a) => a.professionalId === staff.id && a.date === date && (a.status === "pending" || a.status === "confirmed") && a.sessionStatus !== "no_show"
    ).length;
    if (booked) return { ok: false, reason: `${name} has ${booked} booking${booked === 1 ? "" : "s"} ${on}. Move ${booked === 1 ? "it" : "them"} to someone else first.` };
    if (off && off.period !== "full_day") return { ok: true, action: "add", question: `${name} is already off part of ${day}. Make it the whole day off?` };
    return { ok: true, action: "add", question: `Give ${name} the day off ${on}? They won't be offered for bookings that day.` };
  }

  if (to === "scheduled" && from === "day_off") {
    if (status === "lent_out" || off?.source === "transfer") return { ok: false, reason: `${name} is lent to another branch that day — change it under Transfers.` };
    if (off?.source === "leave") return { ok: false, reason: `${name} is on approved leave — change it in Users & Roles → Staff → Leave.` };
    if (date < ctx.today) return { ok: false, reason: `${day} has passed.` };
    return { ok: true, action: "remove", question: `Remove ${name}'s day off ${on}? They'll be bookable again that day.` };
  }

  return { ok: false, reason: "Statuses follow Punch In, breaks and services, so they can't be changed by dragging. Drop a card on Day Off to give a day off, or on a branch above to transfer." };
}

export type StaffAction = "add" | "remove" | "punch_in" | "punch_out" | "start_break" | "end_break";
export type StaffDropPlan = { ok: true; action: StaffAction; question: string } | { ok: false; reason: string };

/** Staff board: what dropping a card on a column does. Day Off / Scheduled
 * give or remove a day off (above); Available, On Break and Out run today's
 * Punch In, break and Punch Out at the branch they work at that day (`where`).
 * In Service follows the services themselves. */
export function planStaffDrop(ctx: Context, staff: Staff, where: string | null, date: string, to: StaffLane): StaffDropPlan {
  if (to === "day_off") return planDayOff(ctx, staff, date, to);
  const name = staff.name;
  const branch = where ?? staff.branchId;
  const lane = staffLane(branch ? staffStatus(ctx, staff.id, branch, date) : "day_off");
  if (to === "scheduled" && lane === "day_off") return planDayOff(ctx, staff, date, to);
  // Today's punch status (someone off part of the day still shows under Scheduled).
  const punched = date === ctx.today ? ctx.attendance.find((a) => a.staffId === staff.id && a.date === date)?.status : undefined;
  const from = lane === "day_off" ? "day_off" : punched === "available" || punched === "on_break" || punched === "in_service" || punched === "out" ? punched : "scheduled";
  if (to === "in_service") return { ok: false, reason: `In Service starts when ${name}'s service is started — use the Appointments or Walk-ins board.` };
  if (to === "scheduled") return { ok: false, reason: `A punch-in can't be undone by dragging. Drop ${name} on Out to punch them out.` };

  if (date !== ctx.today) return { ok: false, reason: "Punch In, breaks and Punch Out are for today only." };
  if (from === "day_off") return { ok: false, reason: `${name} is off today. Drag them to Scheduled first to remove the day off.` };
  if (from === "in_service") return { ok: false, reason: `${name} is serving a client — this changes when the service is completed.` };
  const at = ctx.branches.find((b) => b.id === branch)?.name;

  if (to === "available") {
    if (from === "on_break") return { ok: true, action: "end_break", question: `End ${name}'s break? They'll be available for clients again.` };
    return { ok: true, action: "punch_in", question: `Punch in ${name} now${at ? ` at ${at}` : ""}? They'll be available for clients.` };
  }
  if (to === "on_break") {
    if (from !== "available") return { ok: false, reason: `Punch ${name} in before starting a break.` };
    return { ok: true, action: "start_break", question: `Start ${name}'s break now? They won't be offered for clients until it ends.` };
  }
  if (from === "scheduled") return { ok: false, reason: `${name} hasn't punched in today.` };
  return { ok: true, action: "punch_out", question: `Punch out ${name} now? They won't be offered for clients for the rest of today.` };
}
