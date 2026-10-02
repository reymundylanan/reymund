import { describe, expect, it } from "vitest";
import { meetsPasswordPolicy, passwordPolicyError, passwordStrength } from "./passwordStrength";

describe("passwordStrength", () => {
  it("requires 8+ characters with upper, lower and a number", () => {
    expect(meetsPasswordPolicy("Glowsync1")).toBe(true);
    expect(meetsPasswordPolicy("glowsync1")).toBe(false);
    expect(meetsPasswordPolicy("GLOWSYNC1")).toBe(false);
    expect(meetsPasswordPolicy("Glowsync")).toBe(false);
    expect(meetsPasswordPolicy("Glow1")).toBe(false);
  });

  it("explains what is missing", () => {
    expect(passwordPolicyError("Glowsync1")).toBeNull();
    expect(passwordPolicyError("glowsync")).toBe("Password needs: an uppercase letter, a number.");
  });

  it("rates from red to green", () => {
    expect(passwordStrength("").label).toBe("Too weak");
    expect(passwordStrength("abc").score).toBe(0);
    expect(passwordStrength("abcdefgh").label).toBe("Weak");
    expect(passwordStrength("Abcdefgh").label).toBe("Fair");
    expect(passwordStrength("Abcdefg1").label).toBe("Good");
    expect(passwordStrength("Abcdefg1!").label).toBe("Strong");
    expect(passwordStrength("Abcdefghijk1").label).toBe("Strong");
  });
});
