import { describe, expect, it } from "vitest";
import { absoluteLink, buildEmail, buildPushPayload, escapeHtml, isGonePushStatus, retryDelayMinutes } from "./delivery";

const notice = {
  kind: "no_show",
  title: "Appointment cancelled",
  body: "You didn't arrive <on time>.",
  linkPath: "/my-glow/appointments/abc",
  firstName: "Ana",
};

describe("notification delivery", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("joins site and path with one slash", () => {
    expect(absoluteLink("https://x.app/", "/my-glow")).toBe("https://x.app/my-glow");
    expect(absoluteLink("https://x.app", "my-glow")).toBe("https://x.app/my-glow");
  });

  it("builds an escaped email with the link and an opt-out", () => {
    const e = buildEmail(notice, "https://x.app");
    expect(e.subject).toBe("Appointment cancelled — Blush Spa & Aesthetics");
    expect(e.html).toContain("&lt;on time&gt;");
    expect(e.html).toContain("https://x.app/my-glow/appointments/abc");
    expect(e.html).toContain("View booking");
    expect(e.text).toContain("Hi Ana,");
    expect(e.text).toContain("https://x.app/my-glow/profile#notifications");
  });

  it("greets without a name", () => {
    expect(buildEmail({ ...notice, firstName: " " }, "https://x.app").text.startsWith("Hi,\n")).toBe(true);
  });

  it("builds a push payload with a relative url", () => {
    expect(JSON.parse(buildPushPayload(notice, "n1"))).toEqual({
      title: "Appointment cancelled",
      body: "You didn't arrive <on time>.",
      url: "/my-glow/appointments/abc",
      tag: "n1",
    });
  });

  it("treats 404/410 as a dropped subscription", () => {
    expect(isGonePushStatus(410)).toBe(true);
    expect(isGonePushStatus(404)).toBe(true);
    expect(isGonePushStatus(500)).toBe(false);
    expect(isGonePushStatus(undefined)).toBe(false);
  });

  it("backs off then gives up", () => {
    expect(retryDelayMinutes(1)).toBe(1);
    expect(retryDelayMinutes(4)).toBe(60);
    expect(retryDelayMinutes(5)).toBeNull();
  });
});
