import { describe, expect, it } from "vitest";
import { VOUCHER_CODE_RE, expiryLabel, normalizeVoucherCode, peso, redeemErrorMessage, voucherDiscount, voucherErrorMessage } from "./vouchers";

it("matches the voucher code format", () => {
  expect(VOUCHER_CODE_RE.test("GLOW-7KQ4-P2XM")).toBe(true);
  expect(VOUCHER_CODE_RE.test("GLOW-7KQ0-P2XM")).toBe(false);
  expect(VOUCHER_CODE_RE.test("glow-7kq4-p2xm")).toBe(false);
});
it("normalizes typed codes", () => expect(normalizeVoucherCode(" glow-7kq4 -p2xm ")).toBe("GLOW-7KQ4-P2XM"));
it("discount is the smallest of amount, remaining and max", () => {
  expect(voucherDiscount(50, 500, 100)).toBe(50);
  expect(voucherDiscount(100, 60, 100)).toBe(60);
  expect(voucherDiscount(100, 500, 80)).toBe(80);
  expect(voucherDiscount(50, 0, 100)).toBe(0);
});
describe("expiryLabel", () => {
  const now = new Date("2026-10-01T04:00:00Z"); // noon Manila
  it("days left", () => expect(expiryLabel("2026-10-13T04:00:00Z", now)).toEqual({ text: "Expires in 12 days", soon: false }));
  it("soon", () => expect(expiryLabel("2026-10-04T04:00:00Z", now)).toEqual({ text: "Expires in 3 days", soon: true }));
  it("today", () => expect(expiryLabel("2026-10-01T15:00:00Z", now)).toEqual({ text: "Expires today", soon: true }));
  it("past", () => expect(expiryLabel("2026-09-30T04:00:00Z", now)).toEqual({ text: "Expired", soon: false }));
});
it("formats pesos", () => {
  expect(peso(1500)).toBe("₱1,500");
  expect(peso(50.5)).toBe("₱50.50");
});
it("maps errors", () => {
  expect(redeemErrorMessage("REDEEM_NOT_ENOUGH")).toBe("You don't have enough GlowPoints for this reward.");
  expect(redeemErrorMessage("REDEEM_DISABLED")).toBe("Redeeming rewards is paused right now.");
  expect(redeemErrorMessage("X")).toBe("Couldn't redeem this reward. Please try again.");
  expect(voucherErrorMessage("VOUCHER_WRONG_CLIENT")).toBe("This voucher belongs to a different client.");
  expect(voucherErrorMessage("VOUCHER_EXPIRED")).toBe("This voucher has expired or was cancelled.");
  expect(voucherErrorMessage("VOUCHER_USED")).toBe("This voucher was already used.");
  expect(voucherErrorMessage("VOUCHER_ALREADY_APPLIED")).toBe("A voucher is already applied to this booking.");
  expect(voucherErrorMessage("VOUCHER_NOT_FOUND")).toBe("No voucher found with that code.");
  expect(voucherErrorMessage("VOUCHER_UNDO_EXPIRED")).toBe("This voucher can no longer be removed.");
  expect(voucherErrorMessage("?")).toBe("Couldn't apply the voucher. Please try again.");
});
