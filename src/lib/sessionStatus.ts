export type SessionStatus =
  | "arrived"
  | "waiting"
  | "ready"
  | "late_arrival"
  | "in_service"
  | "completed"
  | "paid"
  | "no_show"
  | "reschedule_requested"
  | "rescheduled";

export const SESSION_LABEL: Record<SessionStatus, string> = {
  arrived: "Checked In",
  waiting: "Waiting",
  ready: "Ready",
  late_arrival: "Late Arrival",
  in_service: "In Service",
  completed: "Completed",
  paid: "Paid",
  no_show: "No-Show",
  reschedule_requested: "Reschedule Requested",
  rescheduled: "Rescheduled",
};

export const SESSION_STYLE: Record<SessionStatus, string> = {
  arrived: "bg-blue-50 text-blue-700",
  waiting: "bg-amber-100 text-amber-700",
  ready: "bg-purple-100 text-purple-700",
  late_arrival: "bg-orange-100 text-orange-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  paid: "bg-teal-100 text-teal-700",
  no_show: "bg-red-100 text-red-600",
  reschedule_requested: "bg-amber-50 text-amber-700",
  rescheduled: "bg-indigo-100 text-indigo-700",
};

/** Online Booking (Appointments page) keeps its existing simpler chain —
 * it never uses ready/paid as a same-column status. */
export const NEXT_SESSION_STATUS: Record<SessionStatus, SessionStatus | null> = {
  arrived: "waiting",
  waiting: "in_service",
  ready: "in_service",
  late_arrival: "in_service",
  in_service: "completed",
  completed: null,
  paid: null,
  no_show: null,
  reschedule_requested: null,
  rescheduled: null,
};

export const NEXT_SESSION_LABEL: Record<SessionStatus, string> = {
  arrived: "Start Waiting",
  waiting: "Start Service",
  ready: "Start Service",
  late_arrival: "Start Service",
  in_service: "Complete",
  completed: "",
  paid: "",
  no_show: "",
  reschedule_requested: "",
  rescheduled: "",
};

/** Walk-Ins page's manual status set — Waiting, Ready, In Service,
 * Completed, plus Cancelled (which isn't a session status at all; it
 * maps to appointments.status = 'cancelled'). "Paid" is deliberately
 * not selectable here — it's only reached through the Complete →
 * Payment Summary flow, never picked directly. */
export const WALKIN_STATUS_OPTIONS: SessionStatus[] = ["waiting", "ready", "in_service", "completed"];

/** appointments.status = 'cancelled' always means no-refund under the
 * spa's policy — this is the label to show wherever that raw status
 * would otherwise just say "Cancelled". */
export const CANCELLED_LABEL = "Cancelled — No Refund";
