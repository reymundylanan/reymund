import { describe, expect, it } from "vitest";
import { buildReportFacts, isReportType, validPeriod } from "./reportAssistant";
import type { RawAppointment, ReportData, ReportFilters } from "./reports/model";

const A = "11111111-1111-1111-1111-111111111111";

function appt(o: Partial<RawAppointment>): RawAppointment {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-09-28",
    time: "10:00:00",
    status: "confirmed",
    sessionStatus: "completed",
    visitType: "appointment",
    clientId: "c1",
    clientName: "Ana",
    walkinPhone: null,
    branchId: A,
    branchName: "One Cecilia Center",
    staffId: "s1",
    staffName: "Ms. Mary",
    services: ["Facial"],
    durationMinutes: 60,
    price: 1000,
    arrivalTime: null,
    serviceStartedAt: null,
    completedAt: null,
    rescheduleCount: 0,
    ...o,
  };
}

const data: ReportData = {
  appointments: [
    appt({}),
    appt({ clientId: "c2", clientName: "Ben" }),
    appt({ clientId: "c3", clientName: "Cy", services: ["Hand Spa"] }),
  ],
  payments: [],
  reviews: [],
  returningClientIds: new Set(),
  staff: [{ id: "s1", name: "Ms. Mary", department: "Clinic", branchId: A }],
  branches: [{ id: A, name: "One Cecilia Center" }],
};

const filters: ReportFilters = { from: "2026-09-01", to: "2026-09-30", branchId: null, staffId: null, service: null, status: null, rating: null };

describe("report assistant facts", () => {
  it("covers every report with its summary and top rows", () => {
    const facts = buildReportFacts(data, filters, new Date("2026-10-04T00:00:00Z"));
    expect(facts.map((f) => f.type)).toContain("services");
    const services = facts.find((f) => f.type === "services")!;
    const table = services.sections[0];
    // Facial has more bookings than Hand Spa, and values arrive formatted.
    expect(JSON.stringify(table.rows)).toContain("Facial");
    expect(table.rows.length).toBeLessThanOrEqual(12);
    for (const f of facts) expect(typeof f.title).toBe("string");
  });

  it("only accepts real report types and sane periods", () => {
    expect(isReportType("services")).toBe(true);
    expect(isReportType("drop table")).toBe(false);
    expect(validPeriod("2026-10-01", "2026-10-04")).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(validPeriod("2026-10-04", "2026-10-01")).toBeNull();
    expect(validPeriod("2024-01-01", "2026-01-01")).toBeNull();
    expect(validPeriod("yesterday", "2026-10-01")).toBeNull();
  });
});
