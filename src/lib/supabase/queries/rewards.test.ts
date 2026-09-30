import { describe, expect, it } from "vitest";
import { describeEntry } from "./rewards";

describe("describeEntry", () => {
  it("labels a review reward with its service", () => {
    expect(describeEntry("review_reward", null, "Deep Tissue Massage")).toBe("Review — Deep Tissue Massage");
  });
  it("labels a review reward without a service", () => {
    expect(describeEntry("review_reward", null, null)).toBe("Review reward");
  });
  it("labels a redemption with code stripped", () => {
    expect(describeEntry("redemption", "Redeemed ₱50 OFF (GLOW-7KQ4-P2XM)", null)).toBe("Redeemed ₱50 OFF");
  });
  it("labels a voucher refund when expired", () => {
    expect(describeEntry("voucher_refund", "Voucher expired: ₱50 OFF (GLOW-…)", null)).toBe("Voucher returned — expired");
  });
  it("labels a voucher refund when cancelled", () => {
    expect(describeEntry("voucher_refund", "Voucher cancelled: …", null)).toBe("Voucher returned — cancelled");
  });
  it("labels admin adjustments with Review check prefix", () => {
    expect(describeEntry("admin_adjustment", "Review check: photo", null)).toBe("Review check (team)");
  });
  it("labels admin adjustments without Review check prefix", () => {
    expect(describeEntry("admin_adjustment", "Adjustment: goodwill", null)).toBe("Adjustment by GlowSync");
  });
  it("labels the opening balance", () => {
    expect(describeEntry("opening_balance", null, null)).toBe("Starting balance");
  });
});
