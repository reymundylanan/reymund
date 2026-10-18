import { describe, expect, it } from "vitest";
import { planPaymentReminders, type ReminderBooking } from "./paymentReminders";

const TODAY = "2026-10-18";
const b = (over: Partial<ReminderBooking> = {}): ReminderBooking => ({
  id: "a1",
  clientId: "c1",
  code: "XK1TJE",
  date: "2026-10-19",
  start: "10:00:00",
  status: "confirmed",
  sessionStatus: null,
  visitType: "appointment",
  notes: "Hair Color with Ms. Sweet — ₱1,500",
  promoPrice: null,
  branchName: "One Cecilia Center",
  isSpaParty: false,
  payments: [],
  recentlyNotified: false,
  ...over,
});

describe("daily payment reminders", () => {
  it("reminds an unpaid booking tomorrow with the amount due", () => {
    const [r] = planPaymentReminders([b()], TODAY);
    expect(r.due).toBe(1500);
    expect(r.body).toBe("Booking XK1TJE is Tomorrow at 10:00 AM at One Cecilia Center, with ₱1,500 still to pay. You can pay ahead with GCash, or at the branch before your treatment.");
    expect(r.linkPath).toBe("/my-glow/appointments/a1");
  });

  it("asks only for what's left after a part payment", () => {
    const [r] = planPaymentReminders([b({ payments: [{ status: "settled", amount: 500 }] })], TODAY);
    expect(r.due).toBe(1000);
    expect(r.body).toContain("(₱500 paid so far)");
  });

  it("mentions full payment for a Spa Party", () => {
    const [r] = planPaymentReminders([b({ isSpaParty: true, notes: null, promoPrice: 8500 })], TODAY);
    expect(r.body).toContain("₱8,500 still to pay");
    expect(r.body).toContain("Spa Party packages need full payment");
  });

  it("skips paid, being-verified, walk-in, no account, unknown price and already-reminded bookings", () => {
    const skipped = [
      b({ payments: [{ status: "settled", amount: 1500 }] }),
      b({ payments: [{ status: "pending", amount: 1500 }] }),
      b({ visitType: "walk_in" }),
      b({ clientId: null }),
      b({ notes: "Hair Color", promoPrice: null }),
      b({ recentlyNotified: true }),
      b({ status: "cancelled" }),
      b({ sessionStatus: "arrived" }),
    ];
    expect(planPaymentReminders(skipped, TODAY)).toEqual([]);
  });
});
