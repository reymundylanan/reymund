import { describe, expect, it } from "vitest";
import { toMinutes, type Appointment, type Context } from "./engine";
import { checkBranchMoves, planBranchMove, upcomingAt } from "./branchMove";

const TODAY = "2026-10-12";

function ctx(over: Partial<Context> = {}): Context {
  return {
    branches: [
      { id: "A", name: "Branch A", address: null, phone: null, hours: "9:00 AM - 6:00 PM", status: "inactive" },
      { id: "B", name: "Branch B", address: null, phone: null, hours: "9:00 AM - 6:00 PM", status: "active" },
    ],
    staff: [
      { id: "angela", name: "Angela", department: "Hair", branchId: "A", avatarUrl: null },
      { id: "carla", name: "Carla", department: "Hair", branchId: "B", avatarUrl: null },
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
    fallbackHours: { open: 540, close: 1080 },
    ...over,
  };
}

function appt(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "m1",
    code: null,
    branchId: "A",
    professionalId: "angela",
    clientId: "c1",
    clientName: "Maria",
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

describe("moving a closed branch's bookings", () => {
  it("keeps the same time with free staff at the open branch", () => {
    const [item] = planBranchMove(ctx({ appointments: [appt()] }), "A", "B");
    expect(item.proposal).toMatchObject({ branchId: "B", staffId: "carla", date: TODAY, start: toMinutes("14:00") });
  });

  it("never gives two clients the same person at the same time", () => {
    const plan = planBranchMove(ctx({ appointments: [appt(), appt({ id: "m2", clientId: "c2", clientName: "Joy" })] }), "A", "B");
    expect(plan[0].proposal?.start).toBe(toMinutes("14:00"));
    const second = plan[1].proposal!;
    expect(second.staffId).toBe("carla");
    const overlap = second.start < toMinutes("15:30") && toMinutes("14:00") < second.start + 90;
    expect(overlap).toBe(false);
  });

  it("leaves a booking unplaced when the open branch doesn't offer the service", () => {
    const nails = appt({ id: "n1", services: ["Gel Manicure"], serviceLabel: "Gel Manicure" });
    expect(planBranchMove(ctx({ appointments: [nails] }), "A", "B")[0].proposal).toBeNull();
  });

  it("skips bookings that already started or are over", () => {
    const c = ctx({
      nowMinutes: toMinutes("13:00"),
      appointments: [appt({ id: "done", start: "09:00:00" }), appt({ id: "in", sessionStatus: "in_service" }), appt({ id: "next" })],
    });
    expect(upcomingAt(c, "A").map((a) => a.id)).toEqual(["next"]);
  });

  it("re-check refuses two chosen moves into the same slot", () => {
    const c = ctx({ appointments: [appt(), appt({ id: "m2" })] });
    const same = { staffId: "carla", date: TODAY, start: "14:00" };
    const r = checkBranchMoves(c, "A", "B", [
      { appointmentId: "m1", ...same },
      { appointmentId: "m2", ...same },
    ]);
    expect(r[0].problem).toBeNull();
    expect(r[1].problem).toMatch(/already has/);
  });
});
