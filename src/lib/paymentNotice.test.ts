import { describe, expect, it } from "vitest";
import { cleanPaymentNotice, paymentNoticeText } from "./paymentNotice";

const pay = { amount: 8500, bookingCode: "XK1TJE", method: "gcash", branchName: "One Cecilia Center" };

describe("payment notice", () => {
  it("tells the client a GCash payment is being verified", () => {
    expect(paymentNoticeText("verifying", pay)).toBe(
      "We received your GCash payment of ₱8,500 for booking XK1TJE and we're verifying it. We'll let you know once it's confirmed — no need to pay again."
    );
  });

  it("asks the client to complete a payment, naming the branch", () => {
    const t = paymentNoticeText("complete", { ...pay, method: "cash", bookingCode: null });
    expect(t).toContain("Your payment of ₱8,500 for your booking is still pending");
    expect(t).toContain("contact One Cecilia Center");
  });

  it("cleans the admin's text", () => {
    expect(cleanPaymentNotice("  hi \n there  ")).toBe("hi there");
    expect(cleanPaymentNotice("   ")).toBeNull();
    expect(cleanPaymentNotice("x".repeat(500))).toHaveLength(400);
  });
});
