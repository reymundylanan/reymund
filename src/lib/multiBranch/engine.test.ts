import { describe, expect, it } from "vitest";
import {
  checkSlot,
  checkStaffTransfer,
  clientKey,
  proposeAt,
  findConflicts,
  formatTime,
  openSlotCount,
  parseDuration,
  parseHours,
  staffStatus,
  suggestAlternatives,
  toMinutes,
  type Appointment,
  type Context,
} from "./engine";

const TODAY = "2026-10-12";
const TOMORROW = "2026-10-13";

function ctx(over: Partial<Context> = {}): Context {
  return {
    branches: [
      { id: "A", name: "Branch A", address: "A st", phone: null, hours: "9:00 AM - 5:30 PM", status: "active" },
      { id: "B", name: "Branch B", address: "B st", phone: null, hours: "10:00 AM - 9:00 PM", status: "active" },
    ],
    staff: [
      { id: "angela", name: "Angela", department: "Hair", branchId: "A", avatarUrl: null },
      { id: "bea", name: "Bea", department: "Hair", branchId: "A", avatarUrl: null },
      { id: "carla", name: "Carla", department: "Hair", branchId: "B", avatarUrl: null },
      { id: "nina", name: "Nina", department: "Nails", branchId: "A", avatarUrl: null },
    ],
    offs: [],
    lends: [],
    attendance: [],
    services: [
      { id: "s1", branchId: "A", name: "Hair Coloring", department: "Hair", category: "Hair", duration: "90 mins.", price: 1500, status: "Active" },
      { id: "s2", branchId: "B", name: "Hair Coloring", department: "Hair", category: "Hair", duration: "90 mins.", price: 1500, status: "Active" },
    ],
    appointments: [],
    today: TODAY,
    nowMinutes: toMinutes("08:00"),
    fallbackHours: { open: 480, close: 1080 },
    ...over,
  };
}

function appt(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "m1",
    code: "MARIA1",
    branchId: "A",
    professionalId: "angela",
    clientId: "c1",
    clientName: "Maria Santos",
    date: TODAY,
    start: "14:00:00",
    duration: 90,
    status: "confirmed",
    sessionStatus: null,
    visitType: "appointment",
    serviceLabel: "Hair Coloring",
    services: ["Hair Coloring"],
    departments: ["Hair"],
    paid: false,
    ...over,
  };
}

const req = (over: Partial<Parameters<typeof checkSlot>[1]> = {}) => ({
  branchId: "A",
  staffId: "bea",
  date: TODAY,
  start: toMinutes("14:00"),
  duration: 90,
  departments: ["Hair"],
  services: ["Hair Coloring"],
  ...over,
});

describe("parsing", () => {
  it("reads branch hours and durations", () => {
    expect(parseHours("8:00 AM - 7:00 PM")).toEqual({ open: 480, close: 1140 });
    expect(parseHours("whenever")).toBeNull();
    expect(parseDuration("60 mins.")).toBe(60);
    expect(parseDuration("1 hr 30 mins")).toBe(90);
    expect(parseDuration(null)).toBe(60);
    expect(formatTime(870)).toBe("2:30 PM");
  });
});

describe("checkSlot", () => {
  it("accepts a genuinely free slot", () => {
    expect(checkSlot(ctx(), req()).ok).toBe(true);
  });

  it("rejects a service that would run past closing (Test 5)", () => {
    // Branch A closes 5:30 PM; 90 min from 4:30 PM ends at 6:00 PM.
    const r = checkSlot(ctx(), req({ start: toMinutes("16:30") }));
    expect(r.ok).toBe(false);
    expect(r.checks.withinHours).toBe(false);
    expect(checkSlot(ctx(), req({ start: toMinutes("16:00") })).ok).toBe(true);
  });

  it("respects the whole duration when checking overlaps", () => {
    const c = ctx({ appointments: [appt({ id: "x", professionalId: "bea", start: "15:00:00", duration: 60 })] });
    const r = checkSlot(c, req({ start: toMinutes("14:00") }));
    expect(r.checks.slotFree).toBe(false);
    expect(checkSlot(c, req({ start: toMinutes("12:30") })).ok).toBe(true);
  });

  it("blocks someone serving a client until they finish (Test 2)", () => {
    const c = ctx({
      nowMinutes: toMinutes("13:00"),
      attendance: [{ staffId: "bea", date: TODAY, status: "in_service" }],
      appointments: [appt({ id: "w", professionalId: "bea", start: "12:30:00", duration: 90, sessionStatus: "in_service", visitType: "walk_in" })],
    });
    expect(checkSlot(c, req({ start: toMinutes("13:30") })).code).toBe("IN_SERVICE");
    expect(checkSlot(c, req({ start: toMinutes("14:00") })).ok).toBe(true);
  });

  it("blocks breaks, punched-out staff and days off", () => {
    expect(checkSlot(ctx({ attendance: [{ staffId: "bea", date: TODAY, status: "out" }] }), req()).code).toBe("STAFF_OUT");
    expect(
      checkSlot(ctx({ nowMinutes: 780, attendance: [{ staffId: "bea", date: TODAY, status: "on_break", breakStartedMinutes: 780 }] }), req({ start: 810 })).code
    ).toBe("ON_BREAK");
    expect(checkSlot(ctx({ offs: [{ staffId: "bea", date: TODAY, period: "full_day", source: "leave" }] }), req()).code).toBe("DAY_OFF");
    // Afternoon off: a morning slot that runs past 1 PM is out too.
    const half = ctx({ offs: [{ staffId: "bea", date: TODAY, period: "afternoon", source: "manual" }] });
    expect(checkSlot(half, req({ start: toMinutes("12:00") })).ok).toBe(false);
    expect(checkSlot(half, req({ start: toMinutes("11:00") })).ok).toBe(true);
  });

  it("checks qualifications and that the branch offers the service", () => {
    expect(checkSlot(ctx(), req({ staffId: "nina" })).checks.qualified).toBe(false);
    const c = ctx({ services: [ctx().services[0]] });
    expect(checkSlot(c, req({ branchId: "B", staffId: "carla", start: toMinutes("14:00") })).checks.serviceAvailable).toBe(false);
  });

  it("lets a lent-in staff member work at the other branch, and not at home", () => {
    const c = ctx({
      lends: [{ staffId: "bea", branchId: "B", dates: [TODAY] }],
      offs: [{ staffId: "bea", date: TODAY, period: "full_day", source: "transfer" }],
    });
    expect(checkSlot(c, req({ branchId: "B" })).ok).toBe(true);
    expect(checkSlot(c, req({ branchId: "A" })).code).toBe("DAY_OFF");
    expect(checkSlot(ctx(), req({ branchId: "B" })).code).toBe("NOT_AT_BRANCH");
  });

  it("rejects past times", () => {
    expect(checkSlot(ctx({ nowMinutes: toMinutes("15:00") }), req()).code).toBe("PAST");
  });
});

describe("conflicts and suggestions", () => {
  const unavailable = () =>
    ctx({
      offs: [{ staffId: "angela", date: TODAY, period: "full_day", source: "leave" }],
      appointments: [appt()],
    });

  it("flags an appointment whose staff member became unavailable", () => {
    const conflicts = findConflicts(unavailable());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe("DAY_OFF");
  });

  it("suggests another qualified staff member first, then other branches (Test 3)", () => {
    const s = suggestAlternatives(unavailable(), appt());
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]).toMatchObject({ branchId: "A", staffId: "bea", date: TODAY, start: toMinutes("14:00") });
    expect(s.some((x) => x.branchId === "B" && x.staffId === "carla")).toBe(true);
    expect(s.every((x) => x.staffId !== "nina")).toBe(true);
  });

  it("returns nothing when no qualified staff has a valid slot anywhere (Test 4)", () => {
    const c = ctx({
      offs: ["angela", "bea", "carla"].flatMap((id) =>
        [TODAY, TOMORROW, "2026-10-14"].map((date) => ({ staffId: id, date, period: "full_day" as const, source: "leave" as const }))
      ),
      appointments: [appt()],
    });
    expect(suggestAlternatives(c, appt())).toEqual([]);
  });

  it("never suggests a slot that overlaps another booking", () => {
    const c = ctx({
      offs: [{ staffId: "angela", date: TODAY, period: "full_day", source: "leave" }],
      appointments: [appt(), appt({ id: "busy", professionalId: "bea", start: "13:30:00", duration: 120, clientId: "c2" })],
    });
    for (const s of suggestAlternatives(c, appt()).filter((x) => x.staffId === "bea" && x.date === TODAY)) {
      expect(s.start + 90 <= toMinutes("13:30") || s.start >= toMinutes("15:30")).toBe(true);
    }
  });

  it("counts open slots and shows staff status", () => {
    expect(openSlotCount(ctx(), "A", TOMORROW)).toBeGreaterThan(0);
    const c = ctx({ attendance: [{ staffId: "bea", date: TODAY, status: "on_break" }] });
    expect(staffStatus(c, "bea", "A", TODAY)).toBe("on_break");
    expect(staffStatus(c, "bea", "A", TOMORROW)).toBe("scheduled");
  });
});

describe("checkStaffTransfer", () => {
  it("allows a free staff member (Test 1)", () => {
    const r = checkStaffTransfer(ctx(), { staffId: "bea", toBranchId: "B", kind: "temporary", dates: [TOMORROW] });
    expect(r.ok).toBe(true);
  });

  it("blocks moving someone who is serving a client (Test 2)", () => {
    const c = ctx({ attendance: [{ staffId: "bea", date: TODAY, status: "in_service" }] });
    expect(checkStaffTransfer(c, { staffId: "bea", toBranchId: "B", kind: "permanent", dates: [] }).ok).toBe(false);
    // Lending from tomorrow is fine.
    expect(checkStaffTransfer(c, { staffId: "bea", toBranchId: "B", kind: "temporary", dates: [TOMORROW] }).ok).toBe(true);
  });

  it("blocks lending on dates with bookings, and lists them", () => {
    const c = ctx({ appointments: [appt({ professionalId: "bea", date: TOMORROW })] });
    const r = checkStaffTransfer(c, { staffId: "bea", toBranchId: "B", kind: "temporary", dates: [TOMORROW] });
    expect(r.ok).toBe(false);
    expect(r.affected).toHaveLength(1);
  });
});

describe("client transfers", () => {
  it("groups walk-ins by name and phone, accounts by id", () => {
    expect(clientKey({ clientId: "c1", walkinName: "x" })).toBe("c:c1");
    expect(clientKey({ clientId: null, walkinName: " Liza ", walkinPhone: "0917" })).toBe("w:Liza|0917");
  });

  it("keeps the same day and time at the new branch when a qualified staff member is free", () => {
    const p = proposeAt(ctx(), appt({ date: TOMORROW }), "B");
    expect(p).toMatchObject({ branchId: "B", staffId: "carla", date: TOMORROW, start: toMinutes("14:00") });
  });

  it("falls back to the nearest free time that day, and to null when nothing fits", () => {
    const busy = ctx({ appointments: [appt({ id: "x", branchId: "B", professionalId: "carla", date: TOMORROW, start: "13:30:00", duration: 120 })] });
    const p = proposeAt(busy, appt({ date: TOMORROW }), "B");
    expect(p).not.toBeNull();
    expect(p!.start + 90 <= toMinutes("13:30") || p!.start >= toMinutes("15:30")).toBe(true);
    const off = ctx({ offs: [{ staffId: "carla", date: TOMORROW, period: "full_day", source: "leave" }] });
    expect(proposeAt(off, appt({ date: TOMORROW }), "B")).toBeNull();
  });

  it("never proposes a branch that does not offer the service", () => {
    const c = ctx({ services: [ctx().services[0]] });
    expect(proposeAt(c, appt({ date: TOMORROW }), "B")).toBeNull();
  });
});
