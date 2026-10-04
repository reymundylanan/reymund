import { formatAppointmentDate, formatAppointmentTime } from "@/lib/appointmentFormat";
import { APPOINTMENT_TEMPLATES, type AppointmentTemplateKind } from "./templates";

export const BUTTON_TEXT_LIMIT = 640;

export type AppointmentMessageData = {
  appointmentId: string;
  firstName: string;
  serviceName: string;
  branchName: string;
  scheduledDate: string;
  startTime: string;
};

// Graph rejects empty template parameters.
function orDefault(value: string, fallback: string): string {
  return value.trim() ? value.trim() : fallback;
}

export function appointmentTemplateParams(kind: AppointmentTemplateKind, data: AppointmentMessageData): string[] {
  const common = [
    orDefault(data.firstName, "there"),
    orDefault(data.serviceName, "appointment"),
    orDefault(data.branchName, "Blush Spa"),
    formatAppointmentDate(data.scheduledDate),
  ];
  if (kind === "review_request") return common.slice(0, 3);
  return kind === "reminder" || kind === "rescheduled" || kind === "confirmed" ? [...common, formatAppointmentTime(data.startTime)] : common;
}

/** "Booking confirmed" as a normal message, for clients who messaged the
 * Page in the last 24 hours (no approved template needed). */
export function confirmedText(data: AppointmentMessageData): string {
  const [name, service, branch, date, time] = appointmentTemplateParams("confirmed", data);
  return `Hi ${name}! Your ${service} at ${branch} on ${date} at ${time} is confirmed ✨ See you there!`;
}

/** Any appointment message as normal text: the template's wording with the
 * details filled in. Used inside the 24-hour window, where Meta allows
 * normal messages, so it works before (or without) approved templates. */
export function appointmentText(kind: AppointmentTemplateKind, data: AppointmentMessageData): string {
  if (kind === "confirmed") return confirmedText(data);
  const params = appointmentTemplateParams(kind, data);
  return APPOINTMENT_TEMPLATES[kind].body
    .replace(/\{\{(\d)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "")
    .replace(/\s*Tap below for details\.?$/, "");
}

export function appointmentButtonText(kind: AppointmentTemplateKind): string {
  return APPOINTMENT_TEMPLATES[kind].button?.text ?? "View appointment";
}

export function buildAppointmentTemplateMessage(psid: string, kind: AppointmentTemplateKind, data: AppointmentMessageData) {
  return {
    recipient: { id: psid },
    messaging_type: "UTILITY",
    message: {
      template: {
        name: APPOINTMENT_TEMPLATES[kind].name,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: appointmentTemplateParams(kind, data).map((text) => ({ type: "text", text })),
          },
          { type: "buttons", parameters: [{ type: "URL", url: data.appointmentId }] },
        ],
      },
    },
  };
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function buildButtonMessage(
  psid: string,
  text: string,
  buttonTitle: string,
  url: string,
  messagingType: "RESPONSE" | "UPDATE"
) {
  return {
    recipient: { id: psid },
    messaging_type: messagingType,
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: truncate(text, BUTTON_TEXT_LIMIT),
          buttons: [{ type: "web_url", url, title: buttonTitle }],
        },
      },
    },
  };
}

export function buildTextMessage(psid: string, text: string) {
  return { recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } };
}
