import { describe, expect, it } from "vitest";
import { toMinutes, type Appointment, type Context } from "./engine";
import { findWalkinOptions, servicesAt, travelMinutes, walkinTransferStatus } from "./walkin";

const TODAY = "2026-10-12";

function ctx(over: Partial<Context> = {}): Context {
  return {
    branches: [
      { id: "A", name: "Branch A", address: "A st", phone: null, hours: "9:00 AM - 6:00 PM", status: "active", lat: 7.8257, lng: 123.437 },
      { id: "B", name: "Branch B", address: "B st", phone: "0917", hours: "10:00 AM - 9:00 PM", status: "active", lat: 7.8301, lng: 123.4495 },
    ],
    staff: [
      { id: "ana", name: "Ana", department: "Hair", branchId: "A", avatarUrl: null },
      { id: "bea", name: "Bea", department: "Hair", branchId: "B", avatarUrl: null },
      { id: "cara", name: "Cara", department: "Nails", branchId: "A", avatarUrl: null },
    ],
    offs: [],
    lends: [],
    attendance: [],
    services: [
      { id: "a1", branchId: "A", name: "Hair Rebond", department: "Hair", category: "Hair", duration: "120 mins.", price: 2500, status: "Active", hairPrices: { short: 2500, long: 3500 } },
      { id: "b1", branchId: "B", name: "Hair Rebond", department: "Hair", category: "Hair", duration: "120 mins.", price: 2800, status: "Active", hairPrices: { short: 2800, long: 3800 } },
    ],
    appointments: [],
    today: TODAY,
    nowMinutes: toMinutes("13:00"),
    fallbackHours: { open: 480, close: 1080 },
    ...over,
  };
}

const busyAna: Appointment = {
  id: "x", code: null, branchId: "A", professionalId: "ana", clientId: null, clientName: "X", date: TODAY, start: "12:30", duration: 240,
  status: "confirmed", sessionStatus: "in_service", visitType: "walk_in", serviceLabel: "", services: [], departments: ["Hair"], paid: false,
};

const req = { originBranchId: "A", services: [{ name: "Hair Rebond", size: "short" as const, price: 2500 }], duration: 120, date: TODAY };

describe("findWalkinOptions", () => {
  it("says the current branch can do it on a later day when it has a free time then", () => {
    const r = findWalkinOptions(ctx({ appointments: [busyAna] }), { ...req, date: "2026-10-13", fromMinutes: toMinutes("10:00") });
    expect(r.origin.ok).toBe(true);
  });

  it("serves the walk-in at the current branch when a qualified staff member is free now", () => {
    const r = findWalkinOptions(ctx(), req);
    expect(r.origin.ok).toBe(true);
    expect(r.options[0]).toMatchObject({ branchId: "A", staffId: "ana", immediate: true });
  });

  it("finds another branch when the current branch's staff are busy (Test 9 & 10)", () => {
    const r = findWalkinOptions(ctx({ appointments: [busyAna] }), req);
    expect(r.origin.ok).toBe(false);
    const b = r.options.find((o) => o.branchId === "B")!;
    expect(b).toMatchObject({ staffId: "bea", immediate: true, price: 2800, priceDiffers: true });
    // Not before the client can get there.
    expect(b.start).toBeGreaterThanOrEqual(toMinutes("13:00") + b.travelMinutes);
  });

  it("offers a later time when nobody is free today, and marks it as not immediate", () => {
    const late = ctx({ nowMinutes: toMinutes("16:30"), appointments: [busyAna] });
    const r = findWalkinOptions(late, { ...req, services: [{ name: "Hair Rebond" }] });
    // Branch A closes at 6 PM (120 min won't fit); Branch B still fits tonight.
    expect(r.options.find((o) => o.branchId === "A" && o.date === TODAY)).toBeUndefined();
    const b = r.options.find((o) => o.branchId === "B")!;
    expect(b.start + 120).toBeLessThanOrEqual(toMinutes("21:00"));
    const tomorrowA = r.options.find((o) => o.branchId === "A" && o.date !== TODAY);
    expect(tomorrowA?.immediate).toBe(false);
  });

  it("never suggests a branch that doesn't offer the service, and returns nothing when none can", () => {
    const only = ctx({ services: [ctx().services[0]], appointments: [busyAna], offs: [{ staffId: "ana", date: TODAY, period: "full_day", source: "leave" }] });
    const r = findWalkinOptions(only, { ...req, days: 1 });
    expect(r.options).toEqual([]);
    expect(r.branches.find((c) => c.branchId === "B")?.reason).toMatch(/Doesn't offer/);
  });

  it("uses the destination's own price for the hair length", () => {
    expect(servicesAt(ctx(), "B", [{ name: "hair rebond", size: "long" }]).list[0].price).toBe(3800);
  });

  it("estimates travel from the map pins", () => {
    const t = travelMinutes(ctx(), "A", "B");
    expect(t).toBeGreaterThan(10);
    expect(t).toBeLessThan(30);
    expect(travelMinutes(ctx(), "A", "A")).toBe(0);
  });
});

describe("walkinTransferStatus", () => {
  const t = { status: "confirmed" as const, mode: "immediate" as const, proposed_date: TODAY };
  it("follows the destination booking", () => {
    expect(walkinTransferStatus(t, { status: "confirmed", session_status: null }, TODAY).label).toBe("Expected at Destination");
    expect(walkinTransferStatus(t, { status: "confirmed", session_status: "arrived" }, TODAY).label).toBe("Checked In at Destination");
    expect(walkinTransferStatus(t, { status: "confirmed", session_status: "in_service" }, TODAY).label).toBe("In Service");
    expect(walkinTransferStatus(t, { status: "completed", session_status: "paid" }, TODAY).label).toBe("Completed");
    expect(walkinTransferStatus({ ...t, mode: "later", proposed_date: "2026-10-14" }, { status: "confirmed", session_status: null }, TODAY).label).toBe("Transfer Confirmed");
  });
  it("shows the pre-booking states", () => {
    expect(walkinTransferStatus({ ...t, status: "awaiting_approval" }, null, TODAY).label).toBe("Awaiting Client Approval");
    expect(walkinTransferStatus({ ...t, status: "waiting_availability" }, null, TODAY).label).toBe("Waiting for Availability");
  });
});
