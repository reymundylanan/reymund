import { describe, expect, it } from "vitest";
import {
  BUTTON_TEXT_LIMIT,
  appointmentTemplateParams,
  buildAppointmentTemplateMessage,
  buildButtonMessage,
} from "./messages";
import { APPOINTMENT_TEMPLATES, templateCreatePayload } from "./templates";

const data = {
  appointmentId: "appt-1",
  firstName: "Ana",
  serviceName: "Signature Facial",
  branchName: "Robinsons",
  scheduledDate: "2026-10-07",
  startTime: "14:30:00",
};

describe("appointment template messages", () => {
  it("builds a utility template send payload", () => {
    expect(buildAppointmentTemplateMessage("psid-1", "reminder", data)).toEqual({
      recipient: { id: "psid-1" },
      messaging_type: "UTILITY",
      message: {
        template: {
          name: "glowsync_appt_reminder",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7", "2:30 PM"].map((text) => ({
                type: "text",
                text,
              })),
            },
            { type: "buttons", parameters: [{ type: "URL", url: "appt-1" }] },
          ],
        },
      },
    });
  });

  it("uses four parameters for cancelled and no-show", () => {
    expect(appointmentTemplateParams("cancelled", data)).toEqual(["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7"]);
    expect(appointmentTemplateParams("no_show", data)).toHaveLength(4);
  });

  it("never sends empty parameters (Review Focus 5)", () => {
    const params = appointmentTemplateParams("reminder", { ...data, firstName: " ", serviceName: "", branchName: "" });
    expect(params.slice(0, 3)).toEqual(["there", "appointment", "Blush Spa"]);
    expect(params.every((p) => p.trim().length > 0)).toBe(true);
  });

  it("parameter count matches each template body", () => {
    for (const kind of Object.keys(APPOINTMENT_TEMPLATES) as (keyof typeof APPOINTMENT_TEMPLATES)[]) {
      const placeholders = APPOINTMENT_TEMPLATES[kind].body.match(/\{\{\d+\}\}/g) ?? [];
      expect(appointmentTemplateParams(kind, data)).toHaveLength(placeholders.length);
      expect(APPOINTMENT_TEMPLATES[kind].example).toHaveLength(placeholders.length);
    }
  });

  it("builds a template create payload with the site URL", () => {
    const payload = templateCreatePayload("cancelled", "https://glow.example") as {
      category: string;
      components: { type: string; buttons?: { url: string }[] }[];
    };
    expect(payload.category).toBe("UTILITY");
    expect(payload.components[1].buttons?.[0].url).toBe("https://glow.example/my-glow/appointments/{{1}}");
  });
});

describe("button messages", () => {
  it("builds a button template", () => {
    expect(buildButtonMessage("psid-1", "New promo!", "View promo", "https://glow.example/promos/p1", "UPDATE")).toEqual({
      recipient: { id: "psid-1" },
      messaging_type: "UPDATE",
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "New promo!",
            buttons: [{ type: "web_url", url: "https://glow.example/promos/p1", title: "View promo" }],
          },
        },
      },
    });
  });

  it("truncates text over the 640-character limit (Review Focus 4)", () => {
    const msg = buildButtonMessage("p", "x".repeat(1000), "Book now", "https://g.example/", "UPDATE") as {
      message: { attachment: { payload: { text: string } } };
    };
    const text = msg.message.attachment.payload.text;
    expect(text).toHaveLength(BUTTON_TEXT_LIMIT);
    expect(text.endsWith("…")).toBe(true);
  });
});
