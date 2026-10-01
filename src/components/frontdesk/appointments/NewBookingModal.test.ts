import { describe, expect, it } from "vitest";
import { durationMinutes } from "./NewBookingModal";

describe("durationMinutes", () => {
  it("reads service durations", () => {
    expect(durationMinutes("60 mins")).toBe(60);
    expect(durationMinutes("1 hr 30 mins")).toBe(90);
    expect(durationMinutes("2 hours")).toBe(120);
    expect(durationMinutes("45")).toBe(45);
    expect(durationMinutes(null)).toBe(60);
  });
});
