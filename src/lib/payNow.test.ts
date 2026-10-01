import { describe, expect, it } from "vitest";
import {
  formatGcashNumber,
  isValidGcashNumber,
  payNowErrorMessage,
  payNowState,
  pesoAmount,
  receiptFileError,
  receiptPath,
} from "./payNow";

describe("payNow", () => {
  it("checks receipt files", () => {
    expect(receiptFileError({ type: "image/png", size: 1000 })).toBeNull();
    expect(receiptFileError({ type: "application/pdf", size: 1000 })).toMatch(/JPG/);
    expect(receiptFileError({ type: "image/jpeg", size: 9 * 1024 * 1024 })).toMatch(/too large/);
    expect(receiptFileError({ type: "image/webp", size: 0 })).toMatch(/empty/);
  });

  it("builds receipt paths in the user's folder", () => {
    expect(receiptPath("u1", "abc", "image/png")).toBe("u1/abc.png");
    expect(receiptPath("u1", "abc", "image/jpeg")).toBe("u1/abc.jpg");
  });

  it("derives the Pay Now state from payments", () => {
    expect(payNowState([])).toBe("none");
    expect(payNowState([{ status: "settled", payment_type: null }])).toBe("none");
    expect(payNowState([{ status: "pending", payment_type: "pay_now" }])).toBe("submitted");
    expect(payNowState([{ status: "failed", payment_type: "pay_now" }, { status: "pending", payment_type: "pay_now" }])).toBe("submitted");
    expect(payNowState([{ status: "settled", paymentType: "pay_now" }])).toBe("verified");
    expect(payNowState([{ status: "failed", payment_type: "pay_now" }])).toBe("not_received");
  });

  it("formats GCash numbers", () => {
    expect(formatGcashNumber("09171234567")).toBe("0917 123 4567");
    expect(formatGcashNumber("+63 917 123 4567")).toBe("0917 123 4567");
    expect(formatGcashNumber("9171234567")).toBe("0917 123 4567");
    expect(isValidGcashNumber("0917-123-4567")).toBe(true);
    expect(isValidGcashNumber("12345")).toBe(false);
  });

  it("formats money and errors", () => {
    expect(pesoAmount(1500)).toBe("₱1,500.00");
    expect(payNowErrorMessage("PAYNOW_DUPLICATE_REFERENCE")).toMatch(/already used/);
    expect(payNowErrorMessage("x PAYNOW_DUPLICATE y")).toMatch(/already submitted/);
    expect(payNowErrorMessage("PAYNOW_NOT_VERIFIED: verify")).toMatch(/Verify the GCash/);
    expect(payNowErrorMessage("PAYNOW_INVALID: booking is no longer pending")).toBe("booking is no longer pending");
    expect(payNowErrorMessage(null)).toMatch(/went wrong/);
    expect(payNowErrorMessage("PAYNOW_FORBIDDEN")).toBe("You don't have permission to do that.");
    expect(payNowErrorMessage("PAYNOW_FORBIDDEN: this booking belongs to another branch")).toBe(
      "Not allowed: this booking belongs to another branch."
    );
  });
});
