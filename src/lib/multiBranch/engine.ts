/**
 * Multi-Branch availability engine (pure). The board, the transfer preview and
 * the server-side recheck all use these rules; migration 075's mb_assert_slot
 * enforces the same rules again inside the database transaction.
 *
 * A slot is available only when the WHOLE service fits:
 *   - the branch is active and open for the full duration (branches.hours),
 *   - the staff member works at that branch that day (home branch, or lent
 *     there by an approved transfer) and isn't off (day off / leave / lent
 *     out; morning off = before 1 PM, afternoon off = from 1 PM),
 *   - today: not punched out, not on a break, not still serving a client,
 *   - no overlap with their other bookings or walk-ins,
 *   - their department covers the services, and the branch offers them.
 */

export const CUTOFF_MINUTES = 13 * 60;
export const SLOT_STEP = 30;
const ACTIVE = new Set(["pending", "confirmed"]);

export type Branch = { id: string; name: string; address: string | null; phone: string | null; hours: string | null; status: string | null; lat?: number | null; lng?: number | null };
export type Staff = { id: string; name: string; department: string; branchId: string | null; avatarUrl: string | null };
export type OffRecord = { staffId: string; date: string; period: "full_day" | "morning" | "afternoon"; source: "manual" | "leave" | "transfer" };
export type Lend = { id?: string; staffId: string; branchId: string; dates: string[] };
export type Attendance = { staffId: string; date: string; status: string; breakStartedMinutes?: number | null };
export type Service = {
  id: string;
  branchId: string;
  name: string;
  department: string;
  category: string;
  duration: string | null;
  price: number;
  status: string;
  /** Hair services: price by length (short / medium / long). */
  hairPrices?: Partial<Record<"short" | "medium" | "long", number>> | null;
};
export type Appointment = {
  id: string;
  code: string | null;
  branchId: string;
  professionalId: string | null;
  clientId: string | null;
  clientName: string;
  date: string;
  start: string; // "HH:MM" or "HH:MM:SS"
  duration: number;
  status: string;
  sessionStatus: string | null;
  visitType: string;
  /** What was booked, for display ("Hair Rebond · Short, Manicure"). */
  serviceLabel: string;
  /** Names of the branch services behind it (what the destination must offer). */
  services: string[];
  /** Departments those services need (empty = unknown). */
  departments: string[];
  /** Has a payment on record (kept with the appointment on any move). */
  paid: boolean;
  /** Walk-ins without an account are grouped by name + phone. */
  walkinName?: string | null;
  walkinPhone?: string | null;
};

export type Context = {
  branches: Branch[];
  staff: Staff[];
  offs: OffRecord[];
  lends: Lend[];
  attendance: Attendance[];
  services: Service[];
  appointments: Appointment[];
  /** "Now" in the salon's time zone. */
  today: string;
  nowMinutes: number;
  /** Fallback hours when a branch's text can't be read (spa booking window). */
  fallbackHours: { open: number; close: number };
};

// ── Time helpers ──

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatTime(time: string | number): string {
  const total = typeof time === "number" ? time : toMinutes(time);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function formatDay(dateKey: string, today?: string): string {
  if (today && dateKey === today) return "Today";
  if (today && dateKey === addDays(today, 1)) return "Tomorrow";
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "8:00 AM - 7:00 PM" → minutes; null when it can't be read. */
export function parseHours(hours: string | null | undefined): { open: number; close: number } | null {
  const m = (hours ?? "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const to = (h: string, min: string, p: string) => ((Number(h) % 12) + (p.toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(min);
  const open = to(m[1], m[2], m[3]);
  const close = to(m[4], m[5], m[6]);
  return close > open ? { open, close } : null;
}

/** "60 mins." / "1 hour" / "1 hr 30 mins" → minutes (60 when unknown). */
export function parseDuration(label: string | null | undefined): number {
  const text = (label ?? "").toLowerCase();
  const h = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
  const m = text.match(/(\d+)\s*min/);
  const total = (h ? Math.round(Number(h[1]) * 60) : 0) + (m ? Number(m[1]) : 0);
  return total > 0 ? total : 60;
}

export function branchHours(ctx: Context, branchId: string) {
  const b = ctx.branches.find((x) => x.id === branchId);
  return parseHours(b?.hours) ?? ctx.fallbackHours;
}

export function isBranchActive(branch: Branch | undefined): boolean {
  return !!branch && (branch.status ?? "active").toLowerCase() === "active";
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

// ── Where someone works ──

/** "home" / "guest" (lent in) / null (not at that branch that day). */
export function presence(ctx: Context, staffId: string, branchId: string, date: string): "home" | "guest" | null {
  const staff = ctx.staff.find((s) => s.id === staffId);
  if (!staff) return null;
  if (staff.branchId === branchId) return "home";
  return ctx.lends.some((l) => l.staffId === staffId && l.branchId === branchId && l.dates.includes(date)) ? "guest" : null;
}

/** The staff member's off record that applies at this branch (guests ignore their home "lent out" row). */
export function offFor(ctx: Context, staffId: string, branchId: string, date: string): OffRecord | null {
  const guest = presence(ctx, staffId, branchId, date) === "guest";
  return ctx.offs.find((o) => o.staffId === staffId && o.date === date && !(guest && o.source === "transfer")) ?? null;
}

export type StaffStatus = "available" | "scheduled" | "in_service" | "on_break" | "out" | "day_off" | "lent_out" | "partial_off";

/** What the board shows on a staff card for a date at a branch. */
export function staffStatus(ctx: Context, staffId: string, branchId: string, date: string): StaffStatus {
  const off = offFor(ctx, staffId, branchId, date);
  if (off?.period === "full_day") return off.source === "transfer" ? "lent_out" : "day_off";
  if (date === ctx.today) {
    const att = ctx.attendance.find((a) => a.staffId === staffId && a.date === date);
    if (att?.status === "in_service") return "in_service";
    if (att?.status === "on_break") return "on_break";
    if (att?.status === "out") return "out";
    if (att?.status === "available") return off ? "partial_off" : "available";
  }
  return off ? "partial_off" : "scheduled";
}

function activeAppointmentsOf(ctx: Context, staffId: string, date: string, excludeId?: string) {
  return ctx.appointments.filter(
    (a) => a.professionalId === staffId && a.date === date && a.id !== excludeId && ACTIVE.has(a.status) && a.sessionStatus !== "no_show"
  );
}

// ── Checks ──

export type CheckKey = "branchOpen" | "staffAvailable" | "qualified" | "serviceAvailable" | "slotFree" | "withinHours" | "notPast";
export type CheckResult = { ok: boolean; checks: Record<CheckKey, boolean>; reasons: string[]; code: string | null };

export type SlotRequest = {
  branchId: string;
  staffId: string | null;
  date: string;
  start: number;
  duration: number;
  departments: string[];
  services: string[];
  excludeAppointmentId?: string;
};

/** Does the branch offer every service (by name, active)? */
export function missingServices(ctx: Context, branchId: string, services: string[]): string[] {
  const offered = new Set(ctx.services.filter((s) => s.branchId === branchId && s.status === "Active").map((s) => s.name.toLowerCase()));
  return services.filter((n) => !offered.has(n.toLowerCase()));
}

export function checkSlot(ctx: Context, req: SlotRequest): CheckResult {
  const checks: Record<CheckKey, boolean> = {
    branchOpen: true,
    staffAvailable: true,
    qualified: true,
    serviceAvailable: true,
    slotFree: true,
    withinHours: true,
    notPast: true,
  };
  const reasons: string[] = [];
  let code: string | null = null;
  const fail = (key: CheckKey, c: string, reason: string) => {
    checks[key] = false;
    reasons.push(reason);
    code ??= c;
  };
  const end = req.start + req.duration;
  const branch = ctx.branches.find((b) => b.id === req.branchId);

  if (!isBranchActive(branch)) fail("branchOpen", "BRANCH_CLOSED", `${branch?.name ?? "The branch"} isn't open for bookings.`);
  const hours = branchHours(ctx, req.branchId);
  if (req.start < hours.open || end > hours.close)
    fail("withinHours", "OUTSIDE_HOURS", `The full ${req.duration}-min service must fit between ${formatTime(hours.open)} and ${formatTime(hours.close)}.`);
  if (req.date < ctx.today || (req.date === ctx.today && req.start <= ctx.nowMinutes)) fail("notPast", "PAST", "That time has already passed.");

  const missing = missingServices(ctx, req.branchId, req.services);
  if (missing.length) fail("serviceAvailable", "SERVICE_UNAVAILABLE", `${branch?.name ?? "This branch"} doesn't offer ${missing.join(", ")}.`);

  if (req.staffId) {
    const staff = ctx.staff.find((s) => s.id === req.staffId);
    const where = presence(ctx, req.staffId, req.branchId, req.date);
    if (!staff || !where) {
      fail("staffAvailable", "NOT_AT_BRANCH", `${staff?.name ?? "This staff member"} doesn't work at ${branch?.name ?? "this branch"} that day.`);
    } else {
      const off = offFor(ctx, req.staffId, req.branchId, req.date);
      if (
        off &&
        (off.period === "full_day" || (off.period === "morning" && req.start < CUTOFF_MINUTES) || (off.period === "afternoon" && end > CUTOFF_MINUTES))
      ) {
        const what = off.source === "transfer" ? "lent to another branch" : off.source === "leave" ? "on leave" : "off";
        fail("staffAvailable", "DAY_OFF", `${staff.name} is ${what}${off.period === "full_day" ? " that day" : ` that ${off.period}`}.`);
      }
      if (req.date === ctx.today) {
        const att = ctx.attendance.find((a) => a.staffId === req.staffId && a.date === req.date);
        if (att?.status === "out") fail("staffAvailable", "STAFF_OUT", `${staff.name} has already punched out today.`);
        if (att?.status === "in_service") {
          const busyUntil = Math.max(
            ctx.nowMinutes + 15,
            ...activeAppointmentsOf(ctx, req.staffId, req.date)
              .filter((a) => a.sessionStatus === "in_service")
              .map((a) => toMinutes(a.start) + a.duration)
          );
          if (req.start < busyUntil) fail("staffAvailable", "IN_SERVICE", `${staff.name} is serving a client until about ${formatTime(busyUntil)}.`);
        }
        if (att?.status === "on_break") {
          const back = (att.breakStartedMinutes ?? ctx.nowMinutes) + 60;
          if (req.start < back) fail("staffAvailable", "ON_BREAK", `${staff.name} is on a break.`);
        }
      }
      if (req.departments.length && !req.departments.every((d) => d === staff.department))
        fail("qualified", "NOT_QUALIFIED", `${staff.name} (${staff.department || "no department"}) isn't qualified for ${req.departments.join(", ")}.`);
      const clash = activeAppointmentsOf(ctx, req.staffId, req.date, req.excludeAppointmentId).find((a) =>
        overlaps(req.start, end, toMinutes(a.start), toMinutes(a.start) + a.duration)
      );
      if (clash)
        fail("slotFree", "SLOT_TAKEN", `${staff.name} already has ${clash.visitType === "walk_in" ? "a walk-in" : "a booking"} ${formatTime(clash.start)}–${formatTime(toMinutes(clash.start) + clash.duration)}.`);
    }
  }

  return { ok: reasons.length === 0, checks, reasons, code };
}

// ── Finding open slots ──

/** Staff who could do this booking at the branch on that date (qualified, present). */
export function candidateStaff(ctx: Context, branchId: string, date: string, departments: string[]): Staff[] {
  return ctx.staff.filter(
    (s) => presence(ctx, s.id, branchId, date) && (!departments.length || departments.every((d) => d === s.department))
  );
}

export type Suggestion = { branchId: string; staffId: string; date: string; start: number; label: string; sameBranch: boolean; sameDay: boolean };

/** Every valid start for one staff member (30-min steps). */
export function openStarts(ctx: Context, req: Omit<SlotRequest, "start">): number[] {
  const { open, close } = branchHours(ctx, req.branchId);
  const out: number[] = [];
  for (let t = open; t + req.duration <= close; t += SLOT_STEP) if (checkSlot(ctx, { ...req, start: t }).ok) out.push(t);
  return out;
}

/** Valid alternatives for an appointment: its branch first, then others; the
 * same day first, then the next days. Closest to the original time first. */
export function suggestAlternatives(
  ctx: Context,
  appt: Appointment,
  opts: { branchIds?: string[]; days?: number; limit?: number; perBranchDay?: number } = {}
): Suggestion[] {
  const { days = 3, limit = 8, perBranchDay = 3 } = opts;
  const branchIds = opts.branchIds ?? ctx.branches.filter(isBranchActive).map((b) => b.id);
  const ordered = [...branchIds].sort((a, b) => (a === appt.branchId ? -1 : b === appt.branchId ? 1 : 0));
  const wanted = toMinutes(appt.start);
  const firstDay = appt.date < ctx.today ? ctx.today : appt.date;
  const out: Suggestion[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(firstDay, d);
    for (const branchId of ordered) {
      const found: Suggestion[] = [];
      for (const staff of candidateStaff(ctx, branchId, date, appt.departments)) {
        const starts = openStarts(ctx, {
          branchId,
          staffId: staff.id,
          date,
          duration: appt.duration,
          departments: appt.departments,
          services: appt.services,
          excludeAppointmentId: appt.id,
        });
        for (const start of starts) {
          if (branchId === appt.branchId && staff.id === appt.professionalId && date === appt.date && start === wanted) continue;
          found.push({ branchId, staffId: staff.id, date, start, label: "", sameBranch: branchId === appt.branchId, sameDay: date === appt.date });
        }
      }
      found.sort((a, b) => Math.abs(a.start - wanted) - Math.abs(b.start - wanted) || a.start - b.start);
      // A spread of staff rather than one person's every slot.
      const seen = new Set<string>();
      for (const s of found) {
        if (out.filter((x) => x.branchId === branchId && x.date === date).length >= perBranchDay) break;
        if (seen.has(s.staffId)) continue;
        seen.add(s.staffId);
        const staff = ctx.staff.find((x) => x.id === s.staffId)!;
        const branch = ctx.branches.find((x) => x.id === branchId)!;
        s.label = `${branch.name} — ${formatDay(date, ctx.today)} ${formatTime(s.start)} — ${staff.name}${s.sameBranch && s.sameDay ? " (another qualified staff member)" : ""}`;
        out.push(s);
      }
      if (out.length >= limit) return out.slice(0, limit);
    }
  }
  return out;
}

// ── Conflicts and capacity ──

export type Conflict = { appointmentId: string; reason: string; code: string };

/** Upcoming appointments that can't go ahead as booked. */
export function findConflicts(ctx: Context): Conflict[] {
  const out: Conflict[] = [];
  for (const a of ctx.appointments) {
    if (!ACTIVE.has(a.status) || a.sessionStatus === "no_show" || a.sessionStatus === "completed" || a.sessionStatus === "paid") continue;
    if (a.date < ctx.today) continue;
    if (a.sessionStatus === "reschedule_requested") {
      out.push({ appointmentId: a.id, reason: "The client asked to reschedule.", code: "RESCHEDULE_REQUESTED" });
      continue;
    }
    if (a.sessionStatus && ["arrived", "waiting", "ready", "late_arrival", "in_service"].includes(a.sessionStatus)) continue;
    if (a.date === ctx.today && toMinutes(a.start) + a.duration <= ctx.nowMinutes) continue;
    const res = checkSlot(ctx, {
      branchId: a.branchId,
      staffId: a.professionalId,
      date: a.date,
      // Already-started times aren't "past" conflicts.
      start: Math.max(toMinutes(a.start), a.date === ctx.today ? ctx.nowMinutes + 1 : 0),
      duration: Math.max(1, toMinutes(a.start) + a.duration - Math.max(toMinutes(a.start), a.date === ctx.today ? ctx.nowMinutes + 1 : 0)),
      departments: a.departments,
      services: [],
      excludeAppointmentId: a.id,
    });
    if (!res.checks.staffAvailable || !res.checks.slotFree || !res.checks.branchOpen || !res.checks.withinHours || !res.checks.qualified)
      out.push({ appointmentId: a.id, reason: res.reasons.join(" "), code: res.code ?? "CONFLICT" });
  }
  return out;
}

/** Open 1-hour slots at a branch on a date (staff × 30-min starts). */
export function openSlotCount(ctx: Context, branchId: string, date: string, duration = 60): number {
  let n = 0;
  for (const s of candidateStaff(ctx, branchId, date, [])) {
    n += openStarts(ctx, { branchId, staffId: s.id, date, duration, departments: [], services: [] }).length;
  }
  return n;
}

/** What a staff transfer would run into (for the preview; the DB checks again). */
export function checkStaffTransfer(
  ctx: Context,
  input: { staffId: string; toBranchId: string; kind: "temporary" | "permanent"; dates: string[] }
): { ok: boolean; items: { label: string; ok: boolean; detail?: string }[]; affected: Appointment[] } {
  const staff = ctx.staff.find((s) => s.id === input.staffId);
  const dest = ctx.branches.find((b) => b.id === input.toBranchId);
  const items: { label: string; ok: boolean; detail?: string }[] = [];
  const add = (label: string, ok: boolean, detail?: string) => items.push({ label, ok, detail });

  add("Destination branch open", isBranchActive(dest), isBranchActive(dest) ? undefined : `${dest?.name ?? "It"} isn't active.`);
  add("Different branch", !!staff && staff.branchId !== input.toBranchId, staff?.branchId === input.toBranchId ? "They already belong there." : undefined);

  const todayAtt = ctx.attendance.find((a) => a.staffId === input.staffId && a.date === ctx.today);
  const busyNow = todayAtt?.status === "in_service" || (input.kind === "temporary" && todayAtt?.status === "on_break");
  const touchesToday = input.kind === "permanent" || input.dates.includes(ctx.today);
  add(
    "Not serving a client right now",
    !(busyNow && touchesToday),
    busyNow && touchesToday ? `${staff?.name} is ${todayAtt?.status === "on_break" ? "on a break" : "serving a client"} — start from tomorrow or once they're free.` : undefined
  );

  let affected: Appointment[] = [];
  if (input.kind === "temporary") {
    const dates = [...new Set(input.dates)].sort();
    add("1 to 15 dates", dates.length >= 1 && dates.length <= 15);
    add("No past dates", dates.every((d) => d >= ctx.today));
    add("Has a home branch", !!staff?.branchId, staff?.branchId ? undefined : "Move them for good first.");
    const offDates = ctx.offs.filter((o) => o.staffId === input.staffId && dates.includes(o.date)).map((o) => o.date);
    add("Not off, on leave or lent out", offDates.length === 0, offDates.length ? `Busy on ${offDates.map((d) => formatDay(d)).join(", ")}.` : undefined);
    const lent = ctx.lends.filter((l) => l.staffId === input.staffId && l.dates.some((d) => dates.includes(d)));
    add("Not already lent elsewhere", lent.length === 0);
    affected = ctx.appointments.filter(
      (a) => a.professionalId === input.staffId && dates.includes(a.date) && ACTIVE.has(a.status) && a.sessionStatus !== "no_show"
    );
    add(
      "No bookings on those dates",
      affected.length === 0,
      affected.length ? `${affected.length} booking${affected.length === 1 ? "" : "s"} must be moved first.` : undefined
    );
  } else {
    affected = ctx.appointments.filter(
      (a) => a.professionalId === input.staffId && a.date >= ctx.today && a.branchId !== input.toBranchId && ACTIVE.has(a.status) && a.sessionStatus !== "no_show"
    );
    // Not blocking: they show up under "Needs rescheduling" afterwards.
    items.push({
      label: "Upcoming bookings reviewed",
      ok: true,
      detail: affected.length ? `${affected.length} upcoming booking${affected.length === 1 ? "" : "s"} at the old branch will need rescheduling.` : "None at the old branch.",
    });
  }
  const destDepts = new Set(ctx.services.filter((s) => s.branchId === input.toBranchId && s.status === "Active").map((s) => s.department));
  items.push({
    label: "Skills used at the destination",
    ok: !staff?.department || destDepts.has(staff.department),
    detail: staff?.department && !destDepts.has(staff.department) ? `${dest?.name} has no active ${staff.department} services.` : undefined,
  });
  return { ok: items.every((i) => i.ok), items, affected };
}

// ── Clients ──

/** A client on the Clients board: an account, or a walk-in (name + phone). */
export type ClientCard = {
  key: string;
  clientId: string | null;
  walkinName: string | null;
  walkinPhone: string | null;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  vip: boolean;
  points: number;
  /** Account home branch (null for walk-ins or when never set). */
  homeBranchId: string | null;
  /** The column they show in: home branch, else their next or last visit's branch. */
  branchId: string | null;
  branchSource: "home" | "next_visit" | "last_visit" | "none";
  visits: number;
  lastVisit: string | null;
  spend: number;
  upcoming: number;
};

/** Stable key for a client: "c:<id>" for accounts, "w:<name>|<phone>" for walk-ins. */
export function clientKey(a: { clientId: string | null; walkinName?: string | null; walkinPhone?: string | null }): string {
  return a.clientId ? `c:${a.clientId}` : `w:${(a.walkinName ?? "").trim()}|${(a.walkinPhone ?? "").trim()}`;
}

/** The best slot for one booking at the destination branch: the same day and
 * time with any qualified staff member first (their original one if they're
 * there), otherwise the nearest valid time that day. Null = nothing valid. */
export function proposeAt(ctx: Context, appt: Appointment, branchId: string): Suggestion | null {
  const start = toMinutes(appt.start);
  const date = appt.date < ctx.today ? ctx.today : appt.date;
  const staff = candidateStaff(ctx, branchId, date, appt.departments).sort((a, b) =>
    a.id === appt.professionalId ? -1 : b.id === appt.professionalId ? 1 : 0
  );
  for (const s of staff) {
    const ok = checkSlot(ctx, {
      branchId,
      staffId: s.id,
      date,
      start,
      duration: appt.duration,
      departments: appt.departments,
      services: branchId === appt.branchId ? [] : appt.services,
      excludeAppointmentId: appt.id,
    }).ok;
    if (ok) return { branchId, staffId: s.id, date, start, label: "", sameBranch: branchId === appt.branchId, sameDay: true };
  }
  return suggestAlternatives(ctx, appt, { branchIds: [branchId], days: 1, limit: 1 })[0] ?? null;
}
