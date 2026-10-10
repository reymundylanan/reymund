// GlowSync AI's "welcome back" briefing for a signed-in client: what needs
// their attention right now, from their real account data. Pure so it can be
// tested; the data comes from queries/welcomeBriefing.

export type BriefingData = {
  upcoming: {
    id: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM[:SS]
    status: "pending" | "confirmed";
    serviceName: string | null;
    branchName: string | null;
  } | null;
  unreadNotifications: number;
  toReview: { count: number; firstAppointmentId: string | null };
  vouchers: { count: number; soonestExpiry: string | null }; // YYYY-MM-DD
  points: number;
  tier: string | null;
};

export type ReminderKind = "booking" | "pending" | "today" | "notifications" | "review" | "voucher" | "points" | "book";
export type Reminder = { kind: ReminderKind; emoji: string; title: string; detail: string; href: string; cta: string };

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Days from `today` to `date` (both YYYY-MM-DD). */
function daysBetween(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Reminders in order of urgency. `today` is the spa's date (Asia/Manila). */
export function buildBriefing(d: BriefingData, today: string): Reminder[] {
  const out: Reminder[] = [];

  if (d.upcoming) {
    const u = d.upcoming;
    const what = u.serviceName ?? "Your appointment";
    const where = u.branchName ? ` at ${u.branchName}` : "";
    const days = daysBetween(today, u.date);
    const when = days === 0 ? `today at ${fmtTime(u.time)}` : days === 1 ? `tomorrow at ${fmtTime(u.time)}` : `${fmtDate(u.date)} at ${fmtTime(u.time)}`;
    const href = `/my-glow/appointments/${u.id}`;
    if (u.status === "pending") {
      out.push({ kind: "pending", emoji: "⏳", title: "Waiting for confirmation", detail: `${what} — ${when}${where}. We'll notify you once the branch confirms.`, href, cta: "View booking" });
    } else if (days <= 1) {
      out.push({ kind: "today", emoji: "⏰", title: days === 0 ? "Your appointment is today!" : "See you tomorrow!", detail: `${what} — ${when}${where}. Please arrive 10 minutes early.`, href, cta: "View booking" });
    } else {
      out.push({ kind: "booking", emoji: "📅", title: "Coming up", detail: `${what} — ${when}${where}.`, href, cta: "View booking" });
    }
  }

  if (d.unreadNotifications > 0) {
    const n = d.unreadNotifications;
    out.push({ kind: "notifications", emoji: "🔔", title: `${n} new notification${n === 1 ? "" : "s"}`, detail: "Updates about your bookings and offers.", href: "/my-glow", cta: "Open" });
  }

  if (d.toReview.count > 0) {
    const n = d.toReview.count;
    out.push({
      kind: "review",
      emoji: "⭐",
      title: `Review ${n === 1 ? "your recent visit" : `${n} recent visits`}`,
      detail: "Share how it went and earn GlowPoints.",
      href: d.toReview.firstAppointmentId ? `/my-glow?review=${d.toReview.firstAppointmentId}#services` : "/my-glow",
      cta: "Write a review",
    });
  }

  if (d.vouchers.count > 0) {
    const n = d.vouchers.count;
    const exp = d.vouchers.soonestExpiry ? ` The first expires ${fmtDate(d.vouchers.soonestExpiry)}.` : "";
    out.push({ kind: "voucher", emoji: "🎟️", title: `${n} voucher${n === 1 ? "" : "s"} ready to use`, detail: `The Front Desk applies ${n === 1 ? "it" : "them"} when you pay.${exp}`, href: "/my-glow", cta: "See vouchers" });
  }

  if (d.points > 0) {
    out.push({ kind: "points", emoji: "✨", title: `${d.points.toLocaleString()} GlowPoints${d.tier ? ` · ${d.tier}` : ""}`, detail: "Redeem them for vouchers in My Rewards.", href: "/my-glow", cta: "My Rewards" });
  }

  if (!d.upcoming) {
    out.push({ kind: "book", emoji: "💆‍♀️", title: "No upcoming booking", detail: "Ready for your next glow? I can help you pick a treatment.", href: "/services", cta: "Browse services" });
  }

  return out;
}
