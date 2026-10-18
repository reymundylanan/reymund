import { describe, expect, it } from "vitest";
import { clientLane, paymentState, serviceLane, staffLane, walkinLane, overdueWalkins } from "./boards";

describe("staffLane", () => {
  it("maps live statuses to columns", () => {
    expect(staffLane("available")).toBe("available");
    expect(staffLane("in_service")).toBe("in_service");
    expect(staffLane("lent_out")).toBe("day_off");
    expect(staffLane("partial_off")).toBe("scheduled");
    expect(staffLane("scheduled")).toBe("scheduled");
  });
});

describe("clientLane", () => {
  const today = "2026-10-17";
  it("puts restricted or contact-less accounts in Needs Assistance first", () => {
    expect(clientLane({ upcoming: 2, lastVisit: null, restricted: true, phone: "09", hasAccount: true }, today)).toBe("assist");
    expect(clientLane({ upcoming: 0, lastVisit: null, phone: null, hasAccount: true }, today)).toBe("assist");
  });
  it("separates new, active and inactive clients", () => {
    expect(clientLane({ upcoming: 0, lastVisit: null, createdAt: "2026-10-01T00:00:00Z", phone: "09", hasAccount: true }, today)).toBe("recent");
    expect(clientLane({ upcoming: 1, lastVisit: null, createdAt: "2026-01-01", phone: "09", hasAccount: true }, today)).toBe("active");
    expect(clientLane({ upcoming: 0, lastVisit: "2026-09-01", phone: "09", hasAccount: false }, today)).toBe("active");
    expect(clientLane({ upcoming: 0, lastVisit: "2026-03-01", phone: "09", hasAccount: false }, today)).toBe("inactive");
  });
});

describe("serviceLane", () => {
  it("flags offered services that can't really be booked", () => {
    expect(serviceLane({ offered: true, price: 500, hasSizePrices: false, duration: 60, qualifiedStaff: 2 })).toBe("active");
    expect(serviceLane({ offered: true, price: 0, hasSizePrices: false, duration: 60, qualifiedStaff: 2 })).toBe("setup");
    expect(serviceLane({ offered: true, price: 0, hasSizePrices: true, duration: 60, qualifiedStaff: 2 })).toBe("active");
    expect(serviceLane({ offered: true, price: 500, hasSizePrices: false, duration: 60, qualifiedStaff: 0 })).toBe("setup");
    expect(serviceLane({ offered: false, price: 0, hasSizePrices: false, duration: 0, qualifiedStaff: 0 })).toBe("inactive");
  });
});

describe("paymentState", () => {
  it("keeps payment apart from the booking status", () => {
    expect(paymentState(1000, [])).toBe("unpaid");
    expect(paymentState(1000, [{ status: "pending", amount: 300, type: "pay_now" }])).toBe("verify");
    expect(paymentState(1000, [{ status: "settled", amount: 300, type: "pay_now" }])).toBe("advance");
    expect(paymentState(1000, [{ status: "settled", amount: 300, type: "cash" }])).toBe("partial");
    expect(paymentState(1000, [{ status: "settled", amount: 300, type: "pay_now" }, { status: "settled", amount: 700, type: "cash" }])).toBe("paid");
    expect(paymentState(null, [{ status: "settled", amount: 300, type: "cash" }])).toBe("paid");
  });
});

describe("walkinLane", () => {
  const start = Date.parse("2026-10-17T02:00:00Z");
  const v = (over: Partial<Parameters<typeof walkinLane>[0]> = {}) => ({ status: "confirmed", sessionStatus: "in_service", serviceStartedAt: "2026-10-17T02:00:00Z", duration: 60, ...over });
  it("follows the timer but never completes by itself", () => {
    expect(walkinLane(v({ sessionStatus: null }), start).lane).toBe("waiting");
    expect(walkinLane(v(), start + 30 * 60_000)).toEqual({ lane: "in_service", elapsed: 30, remaining: 30 });
    expect(walkinLane(v(), start + 63 * 60_000).lane).toBe("time_reached");
    expect(walkinLane(v(), start + 95 * 60_000)).toEqual({ lane: "overdue", elapsed: 95, remaining: -35 });
    expect(walkinLane(v(), start + 600 * 60_000).lane).toBe("overdue");
    expect(walkinLane(v({ sessionStatus: "completed" }), start).lane).toBe("completed");
    expect(walkinLane(v({ status: "cancelled" }), start).lane).toBeNull();
  });
});

describe("overdueWalkins", () => {
  const now = Date.parse("2026-10-18T05:00:00Z"); // 1:00 PM Manila
  const w = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    date: "2026-10-18",
    visitType: "walk_in",
    status: "confirmed",
    sessionStatus: "in_service",
    serviceStartedAt: "2026-10-18T03:30:00Z", // 90 min ago
    duration: 60,
    ...over,
  });

  it("lists only today's walk-ins running past the estimate and grace", () => {
    const list = overdueWalkins(
      [
        w("late"),
        w("onTime", { duration: 120 }),
        w("justOver", { duration: 85 }), // 5 min over: still Time Reached
        w("done", { sessionStatus: "completed" }),
        w("booking", { visitType: "appointment" }),
        w("yesterday", { date: "2026-10-17" }),
        w("noTimer", { serviceStartedAt: null }),
      ],
      "2026-10-18",
      now
    );
    expect(list.map((x) => x.id)).toEqual(["late"]);
  });
});
