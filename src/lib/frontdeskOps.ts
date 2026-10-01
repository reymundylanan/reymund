// Front Desk Operations Dashboard: turns today's existing records
// (appointments incl. walk-ins, staff, attendance, pending payments) into
// the cards and lists the dashboard shows. Pure — no Supabase here.

export type VisitState = "upcoming" | "waiting" | "in_service" | "completed" | "cancelled" | "no_show";

export type OpsVisit = {
  id: string;
  visitType: "appointment" | "walk_in";
  clientId: string | null;
  clientName: string;
  clientAvatar?: string | null;
  walkinPhone: string | null;
  startTime: string; // "HH:MM[:SS]" Manila-local
  durationMinutes: number;
  status: string;
  sessionStatus: string | null;
  arrivalTime: string | null;
  serviceStartedAt: string | null;
  professionalId: string | null;
  professionalName: string;
  serviceName: string;
  price: number | null;
};

export type OpsStaff = { id: string; name: string; department: string | null; avatarUrl?: string | null };
export type OpsAttendance = { staffId: string; status: string; timeIn: string | null; timeOut: string | null };
export type OpsPayment = { id: string; amount: number; method: string; clientName: string; createdAt?: string };

export type StaffState = "available" | "in_service" | "on_break" | "not_checked_in" | "out" | "off";

export type OpsInput = {
  visits: OpsVisit[];
  staff: OpsStaff[];
  offStaffIds: Set<string>;
  attendance: OpsAttendance[];
  pendingPayments: OpsPayment[];
  returningClientIds: Set<string>;
  returningPhones: Set<string>;
  graceMinutes: number;
};

export type StaffCard = OpsStaff & {
  state: StaffState;
  total: number;
  completed: number;
  inService: number;
  upcoming: number;
};

export type Alert = { key: string; tone: "red" | "amber" | "orange" | "blue" | "gray"; text: string; href: string };

const WAITING = new Set(["arrived", "waiting", "ready", "late_arrival"]);

export function visitState(v: Pick<OpsVisit, "status" | "sessionStatus">): VisitState {
  const s = v.sessionStatus ?? "";
  if (v.status === "cancelled") return "cancelled";
  if (s === "no_show" || v.status === "no_show") return "no_show";
  if (s === "completed" || s === "paid" || v.status === "completed") return "completed";
  if (s === "in_service") return "in_service";
  if (WAITING.has(s)) return "waiting";
  return "upcoming";
}

/** Badge text for Today's Schedule. */
export function scheduleLabel(v: Pick<OpsVisit, "status" | "sessionStatus">): string {
  const state = visitState(v);
  if (state === "upcoming") return v.status === "confirmed" ? "Confirmed" : "Upcoming";
  return { waiting: "Waiting", in_service: "In Service", completed: "Completed", cancelled: "Cancelled", no_show: "No Show" }[state];
}

/** Today at HH:MM in the browser's local time (the desk runs in Manila). */
export function startAt(startTime: string, now: Date): Date {
  const [h, m] = startTime.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60_000);
}

export function formatClock(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}

export function peso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

/** Price quoted in the notes text ("Foot Spa with Ms. Ann — ₱500.00"). */
export function priceFromNotes(notes: string | null): number | null {
  const match = notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function staffState(member: OpsStaff, input: OpsInput, busy: Set<string>): StaffState {
  if (input.offStaffIds.has(member.id)) return "off";
  const a = input.attendance.find((r) => r.staffId === member.id);
  if (!a || !a.timeIn) return a?.status === "out" ? "out" : "not_checked_in";
  if (a.timeOut || a.status === "out") return "out";
  if (a.status === "on_break") return "on_break";
  if (a.status === "in_service" || busy.has(member.id)) return "in_service";
  return "available";
}

export function buildOps(input: OpsInput, now: Date) {
  const visits = [...input.visits].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const appointments = visits.filter((v) => v.visitType === "appointment");
  const walkins = visits.filter((v) => v.visitType === "walk_in");
  const count = (list: OpsVisit[], ...states: VisitState[]) => list.filter((v) => states.includes(visitState(v))).length;

  const inServiceVisits = visits.filter((v) => visitState(v) === "in_service");
  const busy = new Set(inServiceVisits.map((v) => v.professionalId).filter((id): id is string => !!id));

  const staffCards: StaffCard[] = input.staff.map((m) => {
    const mine = visits.filter((v) => v.professionalId === m.id && !["cancelled", "no_show"].includes(visitState(v)));
    return {
      ...m,
      state: staffState(m, input, busy),
      total: mine.length,
      completed: count(mine, "completed"),
      inService: count(mine, "in_service"),
      upcoming: count(mine, "upcoming", "waiting"),
    };
  });
  const scheduled = staffCards.filter((s) => s.state !== "off");
  const onDuty = scheduled.filter((s) => s.state === "available" || s.state === "in_service" || s.state === "on_break");
  const notCheckedIn = scheduled.filter((s) => s.state === "not_checked_in");

  const active = visits.filter((v) => !["cancelled", "no_show"].includes(visitState(v)));
  const clientKeys = new Map<string, boolean>();
  for (const v of active) {
    if (v.clientId) clientKeys.set(`c:${v.clientId}`, input.returningClientIds.has(v.clientId));
    else {
      const phone = (v.walkinPhone ?? "").replace(/\D/g, "").slice(-10);
      const key = phone ? `p:${phone}` : `w:${v.id}`;
      clientKeys.set(key, phone ? input.returningPhones.has(phone) : false);
    }
  }
  const returning = [...clientKeys.values()].filter(Boolean).length;

  const inService = inServiceVisits
    .map((v) => {
      const started = v.serviceStartedAt ? new Date(v.serviceStartedAt) : v.arrivalTime ? new Date(v.arrivalTime) : startAt(v.startTime, now);
      const elapsedMs = now.getTime() - started.getTime();
      const remaining = v.durationMinutes - Math.floor(elapsedMs / 60_000);
      return { visit: v, started, elapsedMs, remainingMinutes: remaining, overdue: remaining < 0 };
    })
    .sort((a, b) => a.started.getTime() - b.started.getTime());

  const waiting = visits
    .filter((v) => visitState(v) === "waiting")
    .map((v) => {
      const since = v.arrivalTime ? new Date(v.arrivalTime) : startAt(v.startTime, now);
      return { visit: v, since, waitingMinutes: Math.max(0, minutesBetween(since, now)) };
    })
    .sort((a, b) => a.since.getTime() - b.since.getTime());

  const upcomingAppointments = appointments.filter((v) => visitState(v) === "upcoming");
  const comingUp = upcomingAppointments.filter((v) => startAt(v.startTime, now).getTime() >= now.getTime()).slice(0, 5);
  const startingSoon = comingUp.filter((v) => minutesBetween(now, startAt(v.startTime, now)) <= 30);
  const late = upcomingAppointments
    .map((v) => ({ visit: v, minutesLate: minutesBetween(startAt(v.startTime, now), now) }))
    .filter((l) => l.minutesLate >= 1);

  const pendingTotal = input.pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const overdue = inService.filter((s) => s.overdue);

  const alerts: Alert[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (input.pendingPayments.length)
    alerts.push({ key: "payments", tone: "red", text: `${plural(input.pendingPayments.length, "payment needs", "payments need")} verification`, href: "/frontdesk/payments" });
  if (late.length)
    alerts.push({
      key: "late",
      tone: "red",
      text: `${plural(late.length, "client is", "clients are")} late — No Show after ${input.graceMinutes} min`,
      href: "/frontdesk/appointments",
    });
  if (waiting.length)
    alerts.push({ key: "waiting", tone: "amber", text: `${plural(waiting.length, "customer", "customers")} waiting`, href: "/frontdesk/appointments" });
  if (overdue.length)
    alerts.push({
      key: "overdue",
      tone: "orange",
      text: `${plural(overdue.length, "service has", "services have")} exceeded estimated time`,
      href: overdue[0].visit.visitType === "walk_in" ? "/frontdesk/walk-ins" : "/frontdesk/appointments",
    });
  if (startingSoon.length)
    alerts.push({ key: "soon", tone: "blue", text: `${plural(startingSoon.length, "appointment", "appointments")} starting within 30 minutes`, href: "/frontdesk/appointments" });
  if (notCheckedIn.length)
    alerts.push({ key: "staff", tone: "gray", text: `${plural(notCheckedIn.length, "staff member has", "staff members have")} not checked in`, href: "/frontdesk/staff" });

  return {
    appointments: {
      total: appointments.length,
      upcoming: count(appointments, "upcoming", "waiting"),
      inService: count(appointments, "in_service"),
      completed: count(appointments, "completed"),
      cancelled: count(appointments, "cancelled", "no_show"),
    },
    walkins: {
      total: walkins.filter((v) => visitState(v) !== "cancelled").length,
      waiting: count(walkins, "waiting", "upcoming"),
      inService: count(walkins, "in_service"),
      completed: count(walkins, "completed"),
    },
    staff: {
      cards: staffCards,
      scheduled: scheduled.length,
      onDuty: onDuty.length,
      available: onDuty.filter((s) => s.state === "available").length,
      inService: onDuty.filter((s) => s.state === "in_service").length,
      onBreak: onDuty.filter((s) => s.state === "on_break").length,
      checkedIn: scheduled.length - notCheckedIn.length,
      notCheckedIn: notCheckedIn.length,
    },
    payments: { count: input.pendingPayments.length, total: pendingTotal, items: input.pendingPayments },
    clients: { total: clientKeys.size, returning, new: clientKeys.size - returning },
    schedule: appointments,
    inService,
    waiting,
    comingUp,
    alerts,
  };
}

export type Ops = ReturnType<typeof buildOps>;

export function visitHref(v: Pick<OpsVisit, "id" | "visitType">): string {
  return v.visitType === "walk_in" ? `/frontdesk/walk-ins?id=${v.id}` : `/frontdesk/appointments?id=${v.id}`;
}
