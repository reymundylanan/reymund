// Running late: a therapist whose service has gone past its planned end, and
// how late that makes each of their next clients today. Delays add up — if
// the next client starts 16 minutes late, the one after can too, until a gap
// in the day absorbs it. Pure, so it can be tested.

export type LateVisit = {
  id: string;
  professionalId: string | null;
  professionalName?: string | null;
  clientId: string | null;
  clientName: string;
  /** "HH:MM[:SS]", Manila time. */
  startTime: string;
  durationMinutes: number;
  status: string;
  sessionStatus: string | null;
  /** When the service actually started (ISO). */
  serviceStartedAt: string | null;
  visitType: string;
};

export type DelayedVisit = {
  id: string;
  clientId: string | null;
  clientName: string;
  visitType: string;
  /** Booked start and expected start, minutes after midnight. */
  start: number;
  expected: number;
  delay: number;
};

export type RunningLate = {
  staffId: string;
  staffName: string;
  current: { id: string; clientName: string; overBy: number; plannedEnd: number };
  /** Next clients who'll start at least LATE_MIN minutes late, in order. */
  next: DelayedVisit[];
};

/** Delays shorter than this aren't worth telling anyone about. */
export const LATE_MIN = 5;

const WAITING = new Set(["arrived", "waiting", "ready", "late_arrival"]);

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** An ISO time as minutes after midnight in Manila. */
export function manilaMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

const notStarted = (v: LateVisit) =>
  (v.status === "pending" || v.status === "confirmed") && (v.sessionStatus == null || WAITING.has(v.sessionStatus));

/** Today's visits (one branch or all) and "now" in Manila minutes → who is
 * running over, and the knock-on delay for their next clients. */
export function findRunningLate(visits: LateVisit[], nowMinutes: number): RunningLate[] {
  const out: RunningLate[] = [];
  for (const cur of visits) {
    if (cur.sessionStatus !== "in_service" || cur.status === "cancelled" || !cur.professionalId) continue;
    const started = cur.serviceStartedAt ? manilaMinutes(cur.serviceStartedAt) : toMin(cur.startTime);
    const plannedEnd = started + Math.max(1, cur.durationMinutes);
    const overBy = nowMinutes - plannedEnd;
    if (overBy < 1) continue;

    // Still going: at the earliest they're free now.
    let freeAt = nowMinutes;
    const next: DelayedVisit[] = [];
    const queue = visits
      .filter((v) => v.id !== cur.id && v.professionalId === cur.professionalId && notStarted(v))
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    for (const v of queue) {
      const start = toMin(v.startTime);
      const expected = Math.max(start, freeAt);
      const delay = expected - start;
      if (delay <= 0) break; // a gap in the day absorbs the rest
      if (delay >= LATE_MIN) next.push({ id: v.id, clientId: v.clientId, clientName: v.clientName, visitType: v.visitType, start, expected, delay });
      freeAt = expected + Math.max(1, v.durationMinutes);
    }
    out.push({
      staffId: cur.professionalId,
      staffName: cur.professionalName ?? "Therapist",
      current: { id: cur.id, clientName: cur.clientName, overBy, plannedEnd },
      next,
    });
  }
  return out.sort((a, b) => b.current.overBy - a.current.overBy);
}

/** "2:16 PM" for minutes after midnight. */
export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** What the next client is told. */
export function runningLateMessage(d: Pick<DelayedVisit, "start" | "delay">, branchName: string): string {
  const mins = Math.max(LATE_MIN, Math.round(d.delay / 5) * 5);
  return `Your ${clock(d.start)} appointment at ${branchName} may start about ${mins} minutes late — your therapist is finishing with another client. Thank you for your patience; there's no need to rush.`;
}
