import { describe, expect, it } from "vitest";
import { planDayOff } from "./dayOff";
import { toMinutes, type Appointment, type Context, type Staff } from "./engine";

const TODAY = "2026-10-12";
const ana: Staff = { id: "ana", name: "Ana", department: "Hair", branchId: "A", avatarUrl: null };

function ctx(over: Partial<Context> = {}): Context {
  return {
    branches: [{ id: "A", name: "A", address: null, phone: null, hours: "9:00 AM - 6:00 PM", status: "active" }],
    staff: [ana],
    offs: [],
    lends: [],
    attendance: [],
    services: [],
    appointments: [],
    today: TODAY,
    nowMinutes: toMinutes("08:00"),
    fallbackHours: { open: 540, close: 1080 },
    ...over,
  };
}

const booking = (over: Partial<Appointment> = {}): Appointment => ({
  id: "b1", code: null, branchId: "A", professionalId: "ana", clientId: "c", clientName: "C", date: "2026-10-14", start: "10:00", duration: 60,
  status: "confirmed", sessionStatus: null, visitType: "appointment", serviceLabel: "", services: [], departments: [], paid: false, ...over,
});

describe("Staff board day off by dragging", () => {
  it("gives a free person the day off", () => {
    expect(planDayOff(ctx(), ana, "2026-10-14", "day_off")).toMatchObject({ ok: true, action: "add" });
  });

  it("refuses when they have bookings that day", () => {
    const p = planDayOff(ctx({ appointments: [booking()] }), ana, "2026-10-14", "day_off");
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/1 booking/);
  });

  it("refuses someone at work now, and past dates", () => {
    expect(planDayOff(ctx({ attendance: [{ staffId: "ana", date: TODAY, status: "available" }] }), ana, TODAY, "day_off").ok).toBe(false);
    expect(planDayOff(ctx(), ana, "2026-10-10", "day_off").ok).toBe(false);
  });

  it("takes back a manual day off, but not leave or a transfer", () => {
    const manual = ctx({ offs: [{ staffId: "ana", date: "2026-10-14", period: "full_day", source: "manual" }] });
    expect(planDayOff(manual, ana, "2026-10-14", "scheduled")).toMatchObject({ ok: true, action: "remove" });
    const leave = ctx({ offs: [{ staffId: "ana", date: "2026-10-14", period: "full_day", source: "leave" }] });
    expect(planDayOff(leave, ana, "2026-10-14", "scheduled").ok).toBe(false);
  });

  it("still refuses the attendance lanes", () => {
    expect(planDayOff(ctx(), ana, TODAY, "available").ok).toBe(false);
  });
});
