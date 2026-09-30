import { describe, expect, it } from "vitest";
import { isSlotPast, slotStart } from "./slotTime";

// Local-time dates, matching how the booking calendar builds them.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);

describe("slotStart", () => {
  it("builds the local start time from a 12-hour label", () => {
    expect(slotStart(day(2026, 9, 30), "8:30 AM")).toEqual(at(2026, 9, 30, 8, 30));
    expect(slotStart(day(2026, 9, 30), "12:00 PM")).toEqual(at(2026, 9, 30, 12, 0));
    expect(slotStart(day(2026, 9, 30), "12:30 AM")).toEqual(at(2026, 9, 30, 0, 30));
    expect(slotStart(day(2026, 9, 30), "5:00 PM")).toEqual(at(2026, 9, 30, 17, 0));
  });
});

describe("isSlotPast", () => {
  const now = at(2026, 9, 30, 11, 45);

  it("disables today's slots at or before the current time", () => {
    expect(isSlotPast(day(2026, 9, 30), "9:00 AM", now)).toBe(true);
    expect(isSlotPast(day(2026, 9, 30), "11:00 AM", now)).toBe(true);
    expect(isSlotPast(day(2026, 9, 30), "11:30 AM", now)).toBe(true);
  });

  it("keeps later slots today selectable", () => {
    expect(isSlotPast(day(2026, 9, 30), "12:00 PM", now)).toBe(false);
    expect(isSlotPast(day(2026, 9, 30), "3:00 PM", now)).toBe(false);
  });

  it("treats a slot starting exactly now as passed", () => {
    expect(isSlotPast(day(2026, 9, 30), "12:00 PM", at(2026, 9, 30, 12, 0))).toBe(true);
  });

  it("never disables future-day slots based on today's time", () => {
    expect(isSlotPast(day(2026, 10, 1), "8:00 AM", now)).toBe(false);
  });
});
