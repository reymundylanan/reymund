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
