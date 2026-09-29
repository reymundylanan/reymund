import { describe, expect, it } from "vitest";
import { loginRedirectPath } from "./loginRedirect";

describe("loginRedirectPath", () => {
  it("encodes the target path as next", () => {
    expect(loginRedirectPath("/my-glow/appointments/abc")).toBe(
      "/?login=1&next=%2Fmy-glow%2Fappointments%2Fabc"
    );
  });

  it("falls back to / for unsafe targets", () => {
    expect(loginRedirectPath("//evil.com")).toBe("/?login=1&next=%2F");
  });
});
