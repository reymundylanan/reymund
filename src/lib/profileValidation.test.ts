import { describe, expect, it } from "vitest";
import {
  cleanAddress,
  formatPhoneForInput,
  normalizePhone,
  profileErrorField,
  validateAddress,
  validateFullName,
  validateGender,
  validatePhotoFile,
  validateProfile,
} from "./profileValidation";

describe("validateFullName", () => {
  it.each(["Ana Cruz", "José Mari Dela Cruz-Santos", "O'Neil", "Ma. Theresa", "Li"])("accepts %s", (n) => {
    expect(validateFullName(n)).toBeNull();
  });
  it.each(["A", "J0hn", "Ana 😀", "x".repeat(81), "   ", "--", "..", "A.", "' -"])("rejects %s", (n) => {
    expect(validateFullName(n)).toBe("Enter your full name (2–80 letters).");
  });
});

describe("normalizePhone", () => {
  it.each([
    ["09171234567", "+63 917 123 4567"],
    ["0917 123 4567", "+63 917 123 4567"],
    ["0917-123-4567", "+63 917 123 4567"],
    ["+639171234567", "+63 917 123 4567"],
    ["+63 917 123 4567", "+63 917 123 4567"],
    ["9171234567", "+63 917 123 4567"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(["12345", "08171234567", "091712345678", ""])("rejects %s", (input) => expect(normalizePhone(input)).toBeNull());
});

describe("validateGender", () => {
  it("accepts the options and empty", () => {
    for (const g of ["female", "male", "prefer_not_to_say", "", " male "]) expect(validateGender(g)).toBeNull();
  });
  it("rejects other values", () => expect(validateGender("other")).toBe("Choose a gender option."));
});

describe("address", () => {
  it("strips tags and collapses whitespace", () => {
    expect(cleanAddress("  Purok 3,\n  Brgy. <b>San Francisco</b>  ")).toBe("Purok 3, Brgy. San Francisco");
  });
  it("keeps comparisons that aren't tags", () => expect(cleanAddress("Lot 5 < Blk 2")).toBe("Lot 5 < Blk 2"));
  it("enforces 5–200 characters", () => {
    expect(validateAddress("abc")).toBe("Enter your address (5–200 characters).");
    expect(validateAddress("a".repeat(201))).toBe("Enter your address (5–200 characters).");
    expect(validateAddress("Purok 1, Pagadian")).toBeNull();
  });
});

describe("validateProfile", () => {
  it("returns a message per invalid field", () => {
    expect(validateProfile({ fullName: "A", phone: "123", gender: "x", address: "ab" })).toEqual({
      fullName: "Enter your full name (2–80 letters).",
      phone: "Enter a valid PH mobile number, e.g. 0917 123 4567.",
      gender: "Choose a gender option.",
      address: "Enter your address (5–200 characters).",
    });
  });
});

describe("helpers", () => {
  it("formats a stored phone for the input", () => {
    expect(formatPhoneForInput("+63 917 123 4567")).toBe("0917 123 4567");
    expect(formatPhoneForInput(null)).toBe("");
  });
  it("checks photo type and size", () => {
    expect(validatePhotoFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validatePhotoFile({ type: "image/gif", size: 1000 })).toBe("Use a JPG, PNG or WebP image up to 5 MB.");
    expect(validatePhotoFile({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("Use a JPG, PNG or WebP image up to 5 MB.");
  });
  it("maps server error codes to fields", () => {
    expect(profileErrorField("PROFILE_INVALID:full_name")).toBe("fullName");
    expect(profileErrorField("PROFILE_INVALID:phone")).toBe("phone");
    expect(profileErrorField("PROFILE_FORBIDDEN")).toBeNull();
  });
});
