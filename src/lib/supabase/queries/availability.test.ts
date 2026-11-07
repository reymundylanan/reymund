import { describe, expect, it } from "vitest";
import { isSlotFree, overlaps } from "./availability";

describe("booking buffer", () => {
  const booked = [{ id: "a", professional_id: "p", start_time: "12:00:00", duration_minutes: 60 }];

  it("allows back-to-back bookings when there's no buffer", () => {
    expect(isSlotFree(booked, "13:00", 60)).toBe(true);
    expect(isSlotFree(booked, "12:30", 60)).toBe(false);
  });

  it("keeps the buffer free before and after a booking", () => {
    expect(isSlotFree(booked, "13:00", 60, undefined, 10)).toBe(false);
    expect(isSlotFree(booked, "13:10", 60, undefined, 10)).toBe(true);
    expect(isSlotFree(booked, "11:00", 60, undefined, 10)).toBe(false);
    expect(isSlotFree(booked, "10:50", 60, undefined, 10)).toBe(true);
    // Rescheduling the same booking never clashes with itself.
    expect(isSlotFree(booked, "12:00", 60, "a", 10)).toBe(true);
  });

  it("treats a gap smaller than the buffer as a clash", () => {
    expect(overlaps(0, 60, 65, 120, 10)).toBe(true);
    expect(overlaps(0, 60, 70, 120, 10)).toBe(false);
  });
});
