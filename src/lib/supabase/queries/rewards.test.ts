import { describe, expect, it } from "vitest";
import { describeEntry } from "./rewards";

describe("describeEntry", () => {
  it("labels a review reward with its service", () => {
    expect(describeEntry("review_reward", null, "Deep Tissue Massage")).toBe("Review — Deep Tissue Massage");
  });
  it("labels a review reward without a service", () => {
    expect(describeEntry("review_reward", null, null)).toBe("Review reward");
  });
  it("labels admin adjustments", () => {
    expect(describeEntry("admin_adjustment", "x", null)).toBe("Review check (team)");
  });
  it("labels the opening balance", () => {
    expect(describeEntry("opening_balance", null, null)).toBe("Starting balance");
  });
});
