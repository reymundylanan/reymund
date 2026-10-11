import { describe, expect, it } from "vitest";
import { parseBookingNotes } from "./bookingNotes";

describe("parseBookingNotes", () => {
  it("splits services, staff and price", () => {
    expect(parseBookingNotes("Brow Threading, AirLashes with Ms. Vhie — ₱1,650.00")).toEqual({
      services: "Brow Threading, AirLashes",
      staff: "Ms. Vhie",
      price: 1650,
    });
  });

  it("keeps service names that contain dots and sizes", () => {
    expect(parseBookingNotes("Baby Face Ultra Lift Injection · Per Session with Ms. Mary — ₱8,000.00")).toEqual({
      services: "Baby Face Ultra Lift Injection · Per Session",
      staff: "Ms. Mary",
      price: 8000,
    });
  });

  it("ignores what comes after the price (walk-in transfers)", () => {
    expect(parseBookingNotes("Hair Rebond (Short) with Sir John — ₱2,500.00 · Walk-in transfer from One Cecilia Center").services).toBe("Hair Rebond (Short)");
  });

  it("copes with notes that aren't in that shape", () => {
    expect(parseBookingNotes("Spa package")).toEqual({ services: "Spa package", staff: null, price: null });
    expect(parseBookingNotes(null)).toEqual({ services: null, staff: null, price: null });
  });
});
