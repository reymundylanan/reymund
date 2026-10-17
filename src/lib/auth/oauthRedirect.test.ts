import { describe, expect, it } from "vitest";
import { authErrorPath, postLoginPath } from "./oauthRedirect";

describe("after Google / Facebook login", () => {
  it("sends clients to their dashboard and staff to their portal", () => {
    expect(postLoginPath("customer", "/services")).toBe("/my-glow");
    expect(postLoginPath(null, "/")).toBe("/my-glow");
    expect(postLoginPath("admin", "/")).toBe("/admin");
    expect(postLoginPath("front_desk", "/")).toBe("/frontdesk");
  });

  it("returns to a booking or notification link", () => {
    expect(postLoginPath("customer", "/services?intent=booking&promo=p1")).toBe("/services?intent=booking&promo=p1");
    expect(postLoginPath("customer", "/?login=1&next=/my-glow/journey")).toBe("/?login=1&next=/my-glow/journey");
  });

  it("never redirects off the site", () => {
    expect(postLoginPath("customer", "//evil.com?intent=x")).toBe("/my-glow");
  });

  it("returns to the login page with a reason when it fails or is cancelled", () => {
    expect(authErrorPath("/services", "access_denied")).toBe("/services?auth_error=cancelled");
    expect(authErrorPath("/services?intent=booking", null)).toBe("/services?intent=booking&auth_error=failed");
    expect(authErrorPath("https://evil.com", "x")).toBe("/?auth_error=failed");
  });
});
