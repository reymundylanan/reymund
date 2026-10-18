/**
 * The day's visits as a status board: Pending Confirmation → Confirmed →
 * Checked In → In Service → Completed (plus Cancelled / No-show, shown on
 * request). Dragging a card forward runs the same action the Front Desk uses;
 * dropping a not-yet-arrived booking on Cancelled / No-show cancels it (or,
 * once its time has passed today, can mark it a no-show).
 */
export type KanbanColumn = "pending" | "confirmed" | "checked_in" | "in_service" | "completed" | "closed";

export const KANBAN_COLUMNS: { key: KanbanColumn; label: string }[] = [
  { key: "pending", label: "Pending Confirmation" },
  { key: "confirmed", label: "Confirmed" },
  { key: "checked_in", label: "Checked In" },
  { key: "in_service", label: "In Service" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Cancelled / No-show" },
];

const ORDER: KanbanColumn[] = ["pending", "confirmed", "checked_in", "in_service", "completed"];
const CHECKED_IN = ["arrived", "waiting", "ready", "late_arrival"];

export function kanbanColumn(v: { status: string; sessionStatus: string | null }): KanbanColumn {
  if (v.status === "cancelled" || v.sessionStatus === "no_show") return "closed";
  if (v.status === "completed" || v.sessionStatus === "completed" || v.sessionStatus === "paid") return "completed";
  if (v.sessionStatus === "in_service") return "in_service";
  if (CHECKED_IN.includes(v.sessionStatus ?? "")) return "checked_in";
  return v.status === "pending" ? "pending" : "confirmed";
}

export type StatusAction = "confirm" | "check_in" | "start" | "complete" | "cancel" | "no_show";
/** `noShow`: a "Mark no-show" choice is offered next to cancelling. */
export type StatusPlan = { ok: true; action: StatusAction; question: string; noShow?: boolean } | { ok: false; reason: string };

/** What dropping a card on another column would do — or why it can't. */
export function planStatusChange(
  from: KanbanColumn,
  to: KanbanColumn,
  opts: { isToday: boolean; clientName: string; /** Today and its start time has passed. */ started?: boolean }
): StatusPlan {
  if (from === to) return { ok: false, reason: "It's already there." };
  if (from === "closed") return { ok: false, reason: "Undoing a cancel or no-show is done from the Front Desk." };
  if (to === "closed") {
    const who = opts.clientName;
    if (from !== "pending" && from !== "confirmed") {
      return { ok: false, reason: `${who} has already arrived, so this visit can't be cancelled here — handle it from the Front Desk.` };
    }
    if (opts.isToday && opts.started) {
      return { ok: true, action: "cancel", noShow: true, question: `${who} hasn't arrived and the time has passed. Mark them as a no-show, or cancel the booking?` };
    }
    return { ok: true, action: "cancel", question: `Cancel ${who}'s booking? Payments are non-refundable — reschedule instead if they can still come.` };
  }
  if (ORDER.indexOf(to) < ORDER.indexOf(from)) return { ok: false, reason: "Statuses only move forward here — undo a step from the Front Desk." };
  const name = opts.clientName;
  if (to === "confirmed") return { ok: true, action: "confirm", question: `Confirm ${name}'s booking? They'll be notified that it's confirmed.` };
  if (!opts.isToday) return { ok: false, reason: "Check-in, service and completion only apply to today's visits." };
  if (from === "pending") return { ok: false, reason: `Confirm ${name}'s booking first.` };
  if (to === "checked_in") return { ok: true, action: "check_in", question: `Check in ${name}? Their arrival time is recorded now.` };
  if (to === "in_service") return { ok: true, action: "start", question: `Start ${name}'s service now?${from === "confirmed" ? " This also checks them in." : ""}` };
  if (from !== "in_service") return { ok: false, reason: `Start ${name}'s service before completing it.` };
  return { ok: true, action: "complete", question: `Mark ${name}'s service as completed? Payment is still settled at the Front Desk.` };
}
