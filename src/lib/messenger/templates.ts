// Messenger utility templates for appointment messages. Created on the
// Page by scripts/messenger-setup.ts. Bodies must not start or end with
// a parameter and must not contain marketing content (Meta policy).

export type AppointmentTemplateKind = "reminder" | "rescheduled" | "cancelled" | "no_show";

export const APPOINTMENT_TEMPLATES: Record<
  AppointmentTemplateKind,
  { name: string; body: string; example: string[] }
> = {
  reminder: {
    name: "glowsync_appt_reminder",
    body: "Hi {{1}}, this is a reminder of your {{2}} at {{3}} on {{4}} at {{5}}. See you soon!",
    example: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7", "2:30 PM"],
  },
  rescheduled: {
    name: "glowsync_appt_rescheduled",
    body: "Hi {{1}}, your {{2}} at {{3}} has been moved to {{4}} at {{5}}. Tap below for details.",
    example: ["Ana", "Signature Facial", "Robinsons", "Fri, Oct 9", "10:00 AM"],
  },
  cancelled: {
    name: "glowsync_appt_cancelled",
    body: "Hi {{1}}, your {{2}} at {{3}} on {{4}} has been cancelled. Tap below for details.",
    example: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7"],
  },
  no_show: {
    name: "glowsync_appt_no_show",
    body: "Hi {{1}}, we missed you for your {{2}} at {{3}} on {{4}}. Tap below to see your options.",
    example: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7"],
  },
};

export const APPOINTMENT_BUTTON_TEXT = "View appointment";

export function templateCreatePayload(kind: AppointmentTemplateKind, siteUrl: string): Record<string, unknown> {
  const t = APPOINTMENT_TEMPLATES[kind];
  const base = siteUrl.replace(/\/+$/, "");
  return {
    name: t.name,
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: t.body, example: { body_text: [t.example] } },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: APPOINTMENT_BUTTON_TEXT,
            url: `${base}/my-glow/appointments/{{1}}`,
            example: { url_suffix_example: `${base}/my-glow/appointments/00000000-0000-0000-0000-000000000000` },
          },
        ],
      },
    ],
  };
}
