import { describe, expect, it } from "vitest";
import { manilaScheduledAt, skipReason, type SkipContext } from "./dispatchRules";

const now = new Date("2026-10-06T06:00:00Z");
const sub = { optedOutAt: null, lastInboundAt: "2026-10-06T01:00:00Z" };
const appt = { status: "confirmed", sessionStatus: null, scheduledAt: "2026-10-07T06:30:00.000Z" };
const ctx = (o: Partial<SkipContext>): SkipContext => ({
  kind: "reminder",
  subscription: sub,
  appointment: appt,
  remindFor: appt.scheduledAt,
  now,
  ...o,
});

describe("manilaScheduledAt", () => {
  it("interprets date+time as UTC+8", () => {
    expect(manilaScheduledAt("2026-10-07", "14:30:00")).toBe("2026-10-07T06:30:00.000Z");
    expect(manilaScheduledAt("2026-10-07", "14:30")).toBe("2026-10-07T06:30:00.000Z");
  });
});

describe("skipReason", () => {
  it("sends an eligible reminder", () => expect(skipReason(ctx({}))).toBeNull());

  it("skips when not subscribed or opted out", () => {
    expect(skipReason(ctx({ subscription: null }))).toBe("not_subscribed");
    expect(skipReason(ctx({ subscription: { ...sub, optedOutAt: "2026-10-01T00:00:00Z" } }))).toBe("opted_out");
  });

  it("skips reminders for inactive, moved, passed or missing appointments", () => {
    expect(skipReason(ctx({ appointment: null }))).toBe("appointment_missing");
    expect(skipReason(ctx({ appointment: { ...appt, status: "cancelled" } }))).toBe("appointment_inactive");
    expect(skipReason(ctx({ appointment: { ...appt, sessionStatus: "completed" } }))).toBe("appointment_inactive");
    expect(skipReason(ctx({ remindFor: "2026-10-05T06:30:00.000Z" }))).toBe("appointment_moved");
    expect(skipReason(ctx({ now: new Date("2026-10-07T07:00:00Z") }))).toBe("appointment_passed");
  });

  it("sends appointment updates even when the appointment is cancelled", () => {
    expect(skipReason(ctx({ kind: "appointment_update", appointment: { ...appt, status: "cancelled" }, remindFor: null }))).toBeNull();
  });

  it("enforces the 24h window for promos and invites", () => {
    const promo = { appointment: null, remindFor: null };
    expect(skipReason(ctx({ kind: "promo", ...promo }))).toBeNull();
    expect(skipReason(ctx({ kind: "booking_invite", ...promo, subscription: { ...sub, lastInboundAt: null } }))).toBe(
      "outside_24h_window"
    );
    expect(
      skipReason(ctx({ kind: "promo", ...promo, subscription: { ...sub, lastInboundAt: "2026-10-05T05:59:00Z" } }))
    ).toBe("outside_24h_window");
  });
});
