import { describe, expect, it } from "vitest";
import { loadStatus, validateAdjustment, validateOption, type OptionInput } from "./adminVouchers";

const OK: OptionInput = { id: null, name: "₱50 OFF", pointsCost: 500, discountAmount: 50, validDays: 90, active: true, sortOrder: 1 };

const NAME = "Name must be 1–60 characters.";
const POINTS = "Points must be a whole number from 1 to 1,000,000.";
const DISCOUNT = "Discount must be more than ₱0 and at most ₱100,000.";
const DAYS = "Valid days must be from 1 to 365.";

describe("validateOption", () => {
  it("accepts valid input and boundaries", () => {
    expect(validateOption(OK)).toBeNull();
    expect(validateOption({ ...OK, name: "x".repeat(60), pointsCost: 1_000_000, discountAmount: 100000, validDays: 365 })).toBeNull();
    expect(validateOption({ ...OK, pointsCost: 1, discountAmount: 0.5, validDays: 1 })).toBeNull();
  });
  it("rejects bad names", () => {
    expect(validateOption({ ...OK, name: "   " })).toBe(NAME);
    expect(validateOption({ ...OK, name: "x".repeat(61) })).toBe(NAME);
  });
  it("rejects bad points", () => {
    for (const p of [0, -1, 1.5, 1_000_001, NaN]) expect(validateOption({ ...OK, pointsCost: p })).toBe(POINTS);
  });
  it("rejects bad discount", () => {
    for (const d of [0, -5, 100001, NaN]) expect(validateOption({ ...OK, discountAmount: d })).toBe(DISCOUNT);
  });
  it("rejects bad valid days", () => {
    for (const d of [0, 366, 1.5, NaN]) expect(validateOption({ ...OK, validDays: d })).toBe(DAYS);
  });
});

describe("validateAdjustment", () => {
  const PTS = "Enter a non-zero whole number of points (max 100,000).";
  const REASON = "Enter a reason (up to 500 characters).";
  it("accepts positive and negative", () => {
    expect(validateAdjustment(50, "Goodwill")).toBeNull();
    expect(validateAdjustment(-100000, "Fix")).toBeNull();
  });
  it("rejects bad points", () => {
    for (const p of [0, 1.5, 100001, -100001, NaN]) expect(validateAdjustment(p, "ok")).toBe(PTS);
  });
  it("rejects bad reasons", () => {
    expect(validateAdjustment(5, "  ")).toBe(REASON);
    expect(validateAdjustment(5, "x".repeat(501))).toBe(REASON);
  });
});

describe("loadStatus", () => {
  it("maps errors to a status", () => {
    expect(loadStatus([null, undefined])).toBe("ok");
    expect(loadStatus([null, { code: "42P01", message: "x" }])).toBe("unavailable");
    expect(loadStatus([{ code: "PGRST205" }])).toBe("unavailable");
    expect(loadStatus([{ code: "57014", message: "timeout" }])).toBe("error");
    expect(loadStatus([{ code: "57014" }, { code: "42P01" }])).toBe("unavailable");
  });
});
