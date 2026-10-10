import { describe, expect, it } from "vitest";
import { pageContextLine, pageHelpFor, pageHelpMessage } from "./pageHelp";

describe("page help", () => {
  it("matches each client page", () => {
    expect(pageHelpFor("/").page).toBe("Home");
    expect(pageHelpFor("/services").page).toBe("Services");
    expect(pageHelpFor("/services?category=Nail%20Care").page).toBe("Services");
    expect(pageHelpFor("/services/abc").page).toBe("Service details");
    expect(pageHelpFor("/branches/robinsons").page).toBe("Branches");
    expect(pageHelpFor("/my-glow").page).toBe("My Glow");
    expect(pageHelpFor("/my-glow/").page).toBe("My Glow");
    expect(pageHelpFor("/my-glow/appointments/123").page).toBe("Appointment details");
    expect(pageHelpFor("/somewhere-else").page).toBe("this page");
  });

  it("writes a friendly chat answer", () => {
    const m = pageHelpMessage("/my-glow");
    expect(m).toContain("You're on the My Glow page ✨");
    expect(m).toContain("• My Rewards — ");
    expect(pageHelpMessage("/nope")).toContain("You're on this page ✨");
  });

  it("tells the AI where the client is", () => {
    expect(pageContextLine("/services")).toMatch(/^The customer is currently on the Services page/);
  });
});
