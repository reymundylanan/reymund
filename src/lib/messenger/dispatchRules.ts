export type OutboxKind = "reminder" | "appointment_update" | "promo" | "booking_invite";

export type SkipContext = {
  kind: OutboxKind;
  subscription: { optedOutAt: string | null; lastInboundAt: string | null } | null;
  appointment: { status: string; sessionStatus: string | null; scheduledAt: string } | null;
  remindFor: string | null;
  now: Date;
};

const WINDOW_MS = 24 * 60 * 60 * 1000;
const INACTIVE_STATUSES = new Set(["cancelled", "no_show", "completed"]);
const INACTIVE_SESSION = new Set(["completed", "paid", "no_show"]);

// Manila is UTC+8 with no DST.
export function manilaScheduledAt(date: string, time: string): string {
  const hhmmss = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return new Date(`${date.slice(0, 10)}T${hhmmss}+08:00`).toISOString();
}

export function skipReason(ctx: SkipContext): string | null {
  if (!ctx.subscription) return "not_subscribed";
  if (ctx.subscription.optedOutAt) return "opted_out";

  if (ctx.kind === "reminder" || ctx.kind === "appointment_update") {
    if (!ctx.appointment) return "appointment_missing";
  }

  if (ctx.kind === "reminder" && ctx.appointment) {
    const a = ctx.appointment;
    if (INACTIVE_STATUSES.has(a.status) || INACTIVE_SESSION.has(a.sessionStatus ?? "")) return "appointment_inactive";
    if (ctx.remindFor && Date.parse(ctx.remindFor) !== Date.parse(a.scheduledAt)) return "appointment_moved";
    if (Date.parse(a.scheduledAt) <= ctx.now.getTime()) return "appointment_passed";
  }

  if (ctx.kind === "promo" || ctx.kind === "booking_invite") {
    const last = ctx.subscription.lastInboundAt;
    if (!last || ctx.now.getTime() - Date.parse(last) > WINDOW_MS) return "outside_24h_window";
  }

  return null;
}
