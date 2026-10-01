import { describe, expect, it } from "vitest";
import { buildOps, formatClock, formatElapsed, priceFromNotes, scheduleLabel, visitHref, visitState, type OpsInput, type OpsVisit } from "./frontdeskOps";

const now = new Date(2026, 9, 1, 10, 0, 0); // 10:00 local

function visit(over: Partial<OpsVisit>): OpsVisit {
  return {
    id: Math.random().toString(36).slice(2),
    visitType: "appointment",
    clientId: null,
    clientName: "Client",
    walkinPhone: null,
    startTime: "09:00:00",
    durationMinutes: 60,
    status: "confirmed",
    sessionStatus: null,
    arrivalTime: null,
    serviceStartedAt: null,
    professionalId: null,
    professionalName: "",
    serviceName: "Facial",
    price: 500,
    ...over,
  };
}

function input(over: Partial<OpsInput>): OpsInput {
  return {
    visits: [],
    staff: [],
    offStaffIds: new Set(),
    attendance: [],
    pendingPayments: [],
    returningClientIds: new Set(),
    returningPhones: new Set(),
    graceMinutes: 10,
    ...over,
  };
}

describe("visitState", () => {
  it("maps statuses", () => {
    expect(visitState({ status: "cancelled", sessionStatus: "in_service" })).toBe("cancelled");
    expect(visitState({ status: "confirmed", sessionStatus: "no_show" })).toBe("no_show");
    expect(visitState({ status: "confirmed", sessionStatus: "paid" })).toBe("completed");
    expect(visitState({ status: "confirmed", sessionStatus: "in_service" })).toBe("in_service");
    expect(visitState({ status: "confirmed", sessionStatus: "arrived" })).toBe("waiting");
    expect(visitState({ status: "pending", sessionStatus: null })).toBe("upcoming");
  });

  it("labels the schedule badge", () => {
    expect(scheduleLabel({ status: "pending", sessionStatus: null })).toBe("Upcoming");
    expect(scheduleLabel({ status: "confirmed", sessionStatus: null })).toBe("Confirmed");
    expect(scheduleLabel({ status: "confirmed", sessionStatus: "no_show" })).toBe("No Show");
  });
});

describe("helpers", () => {
  it("formats", () => {
    expect(formatClock("09:05:00")).toBe("09:05 AM");
    expect(formatClock("13:30")).toBe("01:30 PM");
    expect(formatElapsed(32 * 60_000 + 14_000)).toBe("00:32:14");
    expect(priceFromNotes("Foot Spa with Ms. Ann — ₱1,500.00")).toBe(1500);
    expect(priceFromNotes(null)).toBeNull();
    expect(visitHref({ id: "a", visitType: "walk_in" })).toBe("/frontdesk/walk-ins?id=a");
    expect(visitHref({ id: "b", visitType: "appointment" })).toBe("/frontdesk/appointments?id=b");
  });
});

describe("buildOps", () => {
  it("counts appointments and walk-ins separately", () => {
    const ops = buildOps(
      input({
        visits: [
          visit({ startTime: "11:00" }),
          visit({ sessionStatus: "completed" }),
          visit({ status: "cancelled" }),
          visit({ visitType: "walk_in", sessionStatus: "in_service", serviceStartedAt: new Date(2026, 9, 1, 9, 30).toISOString() }),
          visit({ visitType: "walk_in", sessionStatus: "paid" }),
        ],
      }),
      now
    );
    expect(ops.appointments).toEqual({ total: 3, upcoming: 1, inService: 0, completed: 1, cancelled: 1 });
    expect(ops.walkins).toEqual({ total: 2, waiting: 0, inService: 1, completed: 1 });
    expect(ops.inService[0].remainingMinutes).toBe(30);
    expect(ops.comingUp).toHaveLength(1);
  });

  it("derives staff states, scheduled and on-duty counts", () => {
    const ops = buildOps(
      input({
        staff: [
          { id: "s1", name: "Ana", department: "Facial" },
          { id: "s2", name: "Ann", department: "Nails" },
          { id: "s3", name: "Gema", department: "Massage" },
          { id: "s4", name: "Off", department: null },
        ],
        offStaffIds: new Set(["s4"]),
        attendance: [
          { staffId: "s1", status: "available", timeIn: "2026-10-01T00:00:00Z", timeOut: null },
          { staffId: "s2", status: "on_break", timeIn: "2026-10-01T00:00:00Z", timeOut: null },
        ],
        visits: [visit({ professionalId: "s1", sessionStatus: "in_service" }), visit({ professionalId: "s1", startTime: "12:00" })],
      }),
      now
    );
    const byId = Object.fromEntries(ops.staff.cards.map((c) => [c.id, c]));
    expect(byId.s1.state).toBe("in_service");
    expect(byId.s1).toMatchObject({ total: 2, inService: 1, upcoming: 1 });
    expect(byId.s2.state).toBe("on_break");
    expect(byId.s3.state).toBe("not_checked_in");
    expect(byId.s4.state).toBe("off");
    expect(ops.staff).toMatchObject({ scheduled: 3, onDuty: 2, inService: 1, onBreak: 1, checkedIn: 2, notCheckedIn: 1 });
  });

  it("splits returning and new clients, by account or walk-in phone", () => {
    const ops = buildOps(
      input({
        visits: [
          visit({ clientId: "c1" }),
          visit({ clientId: "c1", startTime: "12:00" }),
          visit({ clientId: "c2" }),
          visit({ visitType: "walk_in", walkinPhone: "0917 123 4567" }),
          visit({ visitType: "walk_in", walkinPhone: null }),
          visit({ clientId: "c3", status: "cancelled" }),
        ],
        returningClientIds: new Set(["c1"]),
        returningPhones: new Set(["9171234567"]),
      }),
      now
    );
    expect(ops.clients).toEqual({ total: 4, returning: 2, new: 2 });
  });

  it("raises alerts that need front desk action", () => {
    const ops = buildOps(
      input({
        visits: [
          visit({ startTime: "09:55" }),
          visit({ startTime: "10:20" }),
          visit({ sessionStatus: "waiting", arrivalTime: new Date(2026, 9, 1, 9, 50).toISOString() }),
          visit({ sessionStatus: "in_service", serviceStartedAt: new Date(2026, 9, 1, 8, 0).toISOString() }),
        ],
        staff: [{ id: "s1", name: "Ana", department: null }],
        pendingPayments: [{ id: "p", amount: 1500, method: "gcash", clientName: "Maria" }],
      }),
      now
    );
    expect(ops.alerts.map((a) => a.key)).toEqual(["payments", "late", "waiting", "overdue", "soon", "staff"]);
    expect(ops.waiting[0].waitingMinutes).toBe(10);
    expect(ops.payments.total).toBe(1500);
  });
});
