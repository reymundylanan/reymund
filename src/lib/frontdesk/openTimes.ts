import { branchHours, checkSlot, freeStaffFor, SLOT_STEP, toTime, type Context } from "@/lib/multiBranch/engine";

/** One bookable start time and who can take it, best first (least busy). */
export type OpenTime = { start: string; staffIds: string[] };

/**
 * Every start time (30-min steps) at a branch on a date when the whole
 * booking fits: within opening hours, not in the past, and a qualified
 * therapist who works there that day is free for the full duration — the
 * same rules as the Multi-Branch board. With `staffId`, only that person.
 *
 * Services from more than one department (e.g. hair + nails) can't be done by
 * one person, so they aren't matched by department; any free therapist shows.
 */
export function openTimes(
  ctx: Context,
  input: { branchId: string; date: string; duration: number; serviceIds: string[]; staffId?: string | null }
): OpenTime[] {
  const departments = [
    ...new Set(ctx.services.filter((s) => input.serviceIds.includes(s.id)).map((s) => s.department).filter(Boolean)),
  ];
  const req = {
    branchId: input.branchId,
    staffId: null,
    date: input.date,
    start: 0,
    duration: Math.max(1, input.duration),
    departments: departments.length === 1 ? departments : [],
    // The services are this branch's own, so they're offered here.
    services: [],
  };
  const { open, close } = branchHours(ctx, input.branchId);
  const out: OpenTime[] = [];
  for (let t = open; t + req.duration <= close; t += SLOT_STEP) {
    const at = { ...req, start: t };
    const staffIds = input.staffId ? (checkSlot(ctx, { ...at, staffId: input.staffId }).ok ? [input.staffId] : []) : freeStaffFor(ctx, at);
    if (staffIds.length) out.push({ start: toTime(t), staffIds });
  }
  return out;
}
