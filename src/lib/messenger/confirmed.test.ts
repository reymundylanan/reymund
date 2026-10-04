import { describe, expect, it } from "vitest";
import { appointmentButtonText, appointmentTemplateParams, appointmentText, buildAppointmentTemplateMessage, confirmedText } from "./messages";
import { APPOINTMENT_TEMPLATES, templateCreatePayload } from "./templates";

const data = {
  appointmentId: "a1",
  firstName: "Oceana",
  serviceName: "Upper Lip",
  branchName: "One Cecilia Center",
  scheduledDate: "2026-10-05",
  startTime: "09:30:00",
};

describe("booking confirmed in Messenger", () => {
  it("has a utility template that doesn't start or end with a parameter", () => {
    const t = APPOINTMENT_TEMPLATES.confirmed;
    expect(t.name).toBe("glowsync_appt_confirmed");
    expect(t.body.startsWith("{{")).toBe(false);
    expect(t.body.trim().endsWith("}}")).toBe(false);
    expect((t.body.match(/\{\{\d\}\}/g) ?? []).length).toBe(t.example.length);
    expect((templateCreatePayload("confirmed", "https://x.test") as { category: string }).category).toBe("UTILITY");
  });

  it("fills name, service, branch, date and time", () => {
    const params = appointmentTemplateParams("confirmed", data);
    expect(params).toHaveLength(5);
    expect(params[0]).toBe("Oceana");
    const msg = buildAppointmentTemplateMessage("psid-1", "confirmed", data) as { message: { template: { name: string } } };
    expect(msg.message.template.name).toBe("glowsync_appt_confirmed");
  });

  it("reads naturally as a normal message", () => {
    const text = confirmedText(data);
    expect(text).toMatch(/^Hi Oceana! Your Upper Lip at One Cecilia Center on .+ at 9:30 AM is confirmed ✨/);
  });
});


describe("appointment messages as normal text (24-hour window)", () => {
  it("fills the template wording", () => {
    expect(appointmentText("reminder", data)).toMatch(/^Hi Oceana, this is a reminder of your Upper Lip at One Cecilia Center on .+ at 9:30 AM\. See you soon!$/);
    expect(appointmentText("cancelled", data)).toMatch(/^Hi Oceana, your Upper Lip at One Cecilia Center on .+ has been cancelled\.$/);
    expect(appointmentText("confirmed", data)).toContain("is confirmed ✨");
    expect(appointmentText("rescheduled", data)).not.toMatch(/\{\{/);
  });

  it("labels the button by message", () => {
    expect(appointmentButtonText("review_request")).toBe("Rate your visit");
    expect(appointmentButtonText("reminder")).toBe("View appointment");
  });
});
