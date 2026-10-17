import { describe, expect, it } from "vitest";
import { formatPhMobile, isPhMobile, phMobileDigits, phMobileError } from "./phMobile";

describe("PH mobile numbers", () => {
  it("accepts 11 digits starting with 09", () => {
    expect(isPhMobile("09171234567")).toBe(true);
    expect(isPhMobile("0917 123 4567")).toBe(true);
  });

  it("turns +63 / 63 / 9… into the 09 form", () => {
    expect(phMobileDigits("+63 917 123 4567")).toBe("09171234567");
    expect(phMobileDigits("639171234567")).toBe("09171234567");
    expect(phMobileDigits("9171234567")).toBe("09171234567");
  });

  it("rejects short, long-cut, landline and non-09 numbers", () => {
    expect(isPhMobile("0917123456")).toBe(false);
    expect(isPhMobile("0821234567")).toBe(false);
    expect(isPhMobile("08171234567")).toBe(false);
    expect(isPhMobile("")).toBe(false);
    expect(phMobileDigits("091712345678999")).toBe("09171234567");
  });

  it("formats while typing and explains errors", () => {
    expect(formatPhMobile("09171234567")).toBe("0917 123 4567");
    expect(formatPhMobile("0917")).toBe("0917");
    expect(phMobileError("")).not.toBeNull();
    expect(phMobileError("", { optional: true })).toBeNull();
    expect(phMobileError("0917")).not.toBeNull();
    expect(phMobileError("09171234567")).toBeNull();
  });
});
