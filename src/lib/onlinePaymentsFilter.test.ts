import { describe, expect, it } from "vitest";
import { dateRange, matchesPaymentSearch } from "./onlinePaymentsFilter";

const now = new Date(2026, 9, 1, 10, 30); // Thu Oct 1 2026

describe("dateRange", () => {
  it("covers today, yesterday, this week (Mon) and this month", () => {
    expect(dateRange("today", now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) });
    expect(dateRange("yesterday", now)).toEqual({ from: new Date(2026, 8, 30), to: new Date(2026, 9, 1) });
    expect(dateRange("week", now)).toEqual({ from: new Date(2026, 8, 28), to: new Date(2026, 9, 2) });
    expect(dateRange("month", now)).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) });
  });

  it("uses inclusive custom days and fixes reversed ranges", () => {
    expect(dateRange("custom", now, { from: "2026-09-01", to: "2026-09-03" })).toEqual({
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 4),
    });
    expect(dateRange("custom", now, { from: "2026-09-03", to: "2026-09-01" })).toEqual({
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 4),
    });
  });
});

describe("matchesPaymentSearch", () => {
  const p = {
    clientName: "Maria Santos",
    senderName: "M. Santos",
    referenceNo: "9021 8827 3112",
    serviceName: "Facial Treatment",
    amount: 1500,
    scheduledDate: "2026-10-03",
  };
  it("matches the requested fields", () => {
    expect(matchesPaymentSearch(p, "maria")).toBe(true);
    expect(matchesPaymentSearch(p, "m. santos")).toBe(true);
    expect(matchesPaymentSearch(p, "902188273112")).toBe(true);
    expect(matchesPaymentSearch(p, "facial")).toBe(true);
    expect(matchesPaymentSearch(p, "₱1,500")).toBe(true);
    expect(matchesPaymentSearch(p, "2026-10-03")).toBe(true);
    expect(matchesPaymentSearch(p, "massage")).toBe(false);
    expect(matchesPaymentSearch(p, "")).toBe(true);
  });
});
