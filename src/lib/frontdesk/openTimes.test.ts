import { describe, expect, it } from "vitest";
import { toMinutes, type Appointment, type Context } from "@/lib/multiBranch/engine";
import { openTimes } from "./openTimes";

const TODAY = "2026-10-12";

function ctx(over: Partial<Context> = {}): Context {
  return {
    branches: [{ id: "A", name: "Branch A", address: null, phone: null, hours: "9:00 AM - 5:00 PM", status: "active" }],
    staff: [
      { id: "angela", name: "Angela", department: "Hair", branchId: "A", avatarUrl: null },
      { id: "bea", name: "Bea", department: "Hair", branchId: "A", avatarUrl: null },
      { id: "nina", name: "Nina", department: "Nails", branchId: "A", avatarUrl: null },
    ],
    offs: [],
    lends: [],
    attendance: [],
    services: [
      { id: "hair", branchId: "A", name: "Haircut", department: "Hair", category: "Hair", duration: "60 mins", price: 500, status: "Active" },
      { id: "nail", branchId: "A", name: "Manicure", department: "Nails", category: "Nails", duration: "60 mins", price: 300, status: "Active" },
    ],
    appointments: [],
    today: TODAY,
    nowMinutes: toMinutes("08:00"),
    fallbackHours: { open: 480, close: 1080 },
    ...over,
  };
}

const booking = (over: Partial<Appointment>): Appointment => ({
  id: "x",
  code: null,
  branchId: "A",
  professionalId: "angela",
  clientId: null,
  clientName: "Guest",
  date: TODAY,
  start: "10:00",
  duration: 60,
  status: "confirmed",
  sessionStatus: null,
  visitType: "appointment",
  serviceLabel: "Haircut",
  services: ["Haircut"],
  departments: ["Hair"],
  paid: false,
  ...over,
});

describe("Front Desk open times", () => {
  it("lists every start within opening hours where a qualified therapist is free", () => {
    const slots = openTimes(ctx(), { branchId: "A", date: TODAY, duration: 60, serviceIds: ["hair"] });
    expect(slots[0].start).toBe("09:00");
    expect(slots.at(-1)!.start).toBe("16:00"); // 4:00 PM + 60 min ends at closing
    // Only the hair staff, never the nail technician.
    expect(slots[0].staffIds.sort()).toEqual(["angela", "bea"]);
  });

  it("skips times when everyone qualified is booked, and puts the free person first", () => {
    const c = ctx({ appointments: [booking({ professionalId: "angela" }), booking({ id: "y", professionalId: "bea" })] });
    const slots = openTimes(c, { branchId: "A", date: TODAY, duration: 60, serviceIds: ["hair"] });
    expect(slots.find((s) => s.start === "10:00")).toBeUndefined();
    expect(slots.find((s) => s.start === "09:30")).toBeUndefined(); // would run into 10:00
    expect(slots.find((s) => s.start === "11:00")?.staffIds.length).toBe(2);
  });

  it("checks only the chosen therapist", () => {
    const c = ctx({ appointments: [booking({ professionalId: "angela" })] });
    const slots = openTimes(c, { branchId: "A", date: TODAY, duration: 60, serviceIds: ["hair"], staffId: "angela" });
    expect(slots.find((s) => s.start === "10:00")).toBeUndefined();
    expect(slots.find((s) => s.start === "11:00")?.staffIds).toEqual(["angela"]);
  });

  it("leaves out past times today and anyone on a day off", () => {
    const c = ctx({ nowMinutes: toMinutes("13:10"), offs: [{ staffId: "bea", date: TODAY, period: "full_day", source: "manual" }] });
    const slots = openTimes(c, { branchId: "A", date: TODAY, duration: 60, serviceIds: ["hair"] });
    expect(slots[0].start).toBe("13:30");
    expect(slots.every((s) => !s.staffIds.includes("bea"))).toBe(true);
  });

  it("mixed departments still find a free therapist", () => {
    const slots = openTimes(ctx(), { branchId: "A", date: TODAY, duration: 120, serviceIds: ["hair", "nail"] });
    expect(slots.length).toBeGreaterThan(0);
  });
});
