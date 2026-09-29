import { describe, expect, it } from "vitest";
import {
  describeHistoryEvent,
  formatAppointmentDate,
  formatAppointmentTime,
  humanizeStatus,
} from "./appointmentFormat";

describe("appointment formatting", () => {
  it("formats dates without timezone drift", () => {
    expect(formatAppointmentDate("2026-10-07")).toBe("Wed, Oct 7");
    expect(formatAppointmentDate("2026-01-01")).toBe("Thu, Jan 1");
  });

  it("formats times as 12-hour", () => {
    expect(formatAppointmentTime("14:30:00")).toBe("2:30 PM");
    expect(formatAppointmentTime("00:05")).toBe("12:05 AM");
    expect(formatAppointmentTime("12:00:00")).toBe("12:00 PM");
  });

  it("humanizes statuses", () => {
    expect(humanizeStatus("no_show")).toBe("No show");
    expect(humanizeStatus("reschedule_requested")).toBe("Reschedule requested");
  });

  it("describes history events", () => {
    expect(describeHistoryEvent({ eventType: "created", fromValue: null, toValue: "pending" })).toBe("Booked");
    expect(
      describeHistoryEvent({ eventType: "reschedule", fromValue: "2026-10-07 14:30:00", toValue: "2026-10-09 10:00:00" })
    ).toBe("Rescheduled from Wed, Oct 7 · 2:30 PM to Fri, Oct 9 · 10:00 AM");
    expect(describeHistoryEvent({ eventType: "status_change", fromValue: "confirmed", toValue: "no_show" })).toBe(
      "Marked as No show"
    );
  });
});
