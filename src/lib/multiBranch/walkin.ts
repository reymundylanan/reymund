/**
 * Walk-in transfers: when a walk-in's service can't be done at the current
 * branch, find where (and when) it can — using the same availability rules as
 * the rest of Multi-Branch (checkSlot). Pure functions; the server loads data.
 */
import { addDays, branchHours, candidateStaff, checkSlot, isBranchActive, parseDuration, type Context, type Service } from "./engine";

export type HairSize = "short" | "medium" | "long";
/** A requested service, by its catalog name (and hair length when priced by it). */
export type WalkinService = { name: string; size?: HairSize | null; price?: number | null };

export type WalkinRequest = {
  originBranchId: string;
  services: WalkinService[];
  /** Total minutes the client asked for (never shortened). */
  duration: number;
  preferredStaffId?: string | null;
  /** Day and time the client wants (defaults: today, now). */
  date: string;
  fromMinutes?: number | null;
  /** How many days ahead to look for later options. */
  days?: number;
};

export type WalkinOption = {
  branchId: string;
  staffId: string;
  date: string;
  start: number;
  duration: number;
  immediate: boolean;
  travelMinutes: number;
  /** Other qualified staff free at that same time (capacity). */
  alsoFree: number;
  price: number;
  priceDiffers: boolean;
  services: { serviceId: string; name: string; price: number }[];
};

export type BranchCheck = { branchId: string; ok: boolean; reason: string | null };

const SLOT_STEP = 15;
const roundUp = (m: number, step: number) => Math.ceil(m / step) * step;

/** Rough travel time between branches from their map pins (10 min to get
 * going + ~3 min per km in town). Unknown pins: 30 min. Same branch: 0. */
export function travelMinutes(ctx: Context, fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const a = ctx.branches.find((b) => b.id === fromId);
  const b = ctx.branches.find((x) => x.id === toId);
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return 30;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(h));
  return Math.round(10 + km * 3);
}

/** The destination's own services (and prices) for what was asked; null if it doesn't offer one. */
export function servicesAt(ctx: Context, branchId: string, wanted: WalkinService[]): { list: { svc: Service; name: string; price: number }[]; missing: string[] } {
  const list: { svc: Service; name: string; price: number }[] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const svc = ctx.services.find((s) => s.branchId === branchId && s.status === "Active" && s.name.toLowerCase() === w.name.toLowerCase());
    if (!svc) {
      missing.push(w.name);
      continue;
    }
    const sized = w.size && svc.hairPrices?.[w.size];
    const price = sized ?? svc.price;
    list.push({ svc, name: w.size ? `${svc.name} (${w.size[0].toUpperCase()}${w.size.slice(1)})` : svc.name, price });
  }
  return { list, missing };
}

/**
 * Can the current branch serve the walk-in right now (any qualified staff, not
 * only the preferred one)? And which other branches can, earliest first.
 */
export function findWalkinOptions(ctx: Context, req: WalkinRequest): { origin: BranchCheck; branches: BranchCheck[]; options: WalkinOption[] } {
  const days = req.days ?? 3;
  const date = req.date < ctx.today ? ctx.today : req.date;
  const wantedFrom = req.fromMinutes ?? (date === ctx.today ? ctx.nowMinutes : 0);
  const originPrice = req.services.reduce((n, s) => n + (s.price ?? 0), 0);
  const checks: BranchCheck[] = [];
  const options: WalkinOption[] = [];

  for (const b of ctx.branches) {
    if (!isBranchActive(b)) {
      checks.push({ branchId: b.id, ok: false, reason: "Branch isn't open" });
      continue;
    }
    const { list, missing } = servicesAt(ctx, b.id, req.services);
    if (missing.length) {
      checks.push({ branchId: b.id, ok: false, reason: `Doesn't offer ${missing.join(", ")}` });
      continue;
    }
    const departments = [...new Set(list.map((l) => l.svc.department).filter(Boolean))];
    // The full service, never shortened: the longer of what was asked and this branch's catalog time.
    const duration = Math.max(req.duration, list.reduce((n, l) => n + parseDuration(l.svc.duration), 0));
    const travel = travelMinutes(ctx, req.originBranchId, b.id);
    const price = list.reduce((n, l) => n + l.price, 0);
    let found = 0;
    let anyStaff = false;

    for (let d = 0; d < days && found < 3; d++) {
      const day = addDays(date, d);
      const staff = candidateStaff(ctx, b.id, day, departments).sort((x, y) =>
        x.id === req.preferredStaffId ? -1 : y.id === req.preferredStaffId ? 1 : 0
      );
      if (staff.length) anyStaff = true;
      const { open, close } = branchHours(ctx, b.id);
      // Today: not before now plus the trip there. Later days: from opening.
      const earliest = Math.max(open, day === date ? wantedFrom : open, day === ctx.today ? ctx.nowMinutes + travel : 0);
      const first = roundUp(earliest, 5);
      const starts = [first];
      for (let t = roundUp(first + 1, SLOT_STEP); t + duration <= close; t += SLOT_STEP) starts.push(t);

      const perStaff: { staffId: string; start: number }[] = [];
      for (const s of staff) {
        const start = starts.find(
          (t) => checkSlot(ctx, { branchId: b.id, staffId: s.id, date: day, start: t, duration, departments, services: list.map((l) => l.svc.name) }).ok
        );
        if (start !== undefined) perStaff.push({ staffId: s.id, start });
      }
      perStaff.sort((x, y) => x.start - y.start || (x.staffId === req.preferredStaffId ? -1 : y.staffId === req.preferredStaffId ? 1 : 0));
      for (const p of perStaff.slice(0, 3 - found)) {
        options.push({
          branchId: b.id,
          staffId: p.staffId,
          date: day,
          start: p.start,
          duration,
          immediate: day === ctx.today && p.start <= roundUp(Math.max(ctx.nowMinutes + travel, wantedFrom), 5) + 15,
          travelMinutes: travel,
          alsoFree: perStaff.filter((o) => o.start === p.start && o.staffId !== p.staffId).length,
          price,
          priceDiffers: originPrice > 0 && Math.abs(price - originPrice) >= 1,
          services: list.map((l) => ({ serviceId: l.svc.id, name: l.name, price: l.price })),
        });
        found++;
      }
    }
    checks.push({
      branchId: b.id,
      ok: found > 0,
      reason: found > 0 ? null : !anyStaff ? `No qualified staff working` : `No free time for the full ${duration} min in the next ${days} days`,
    });
  }

  options.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start - b.start ||
      a.travelMinutes - b.travelMinutes ||
      b.alsoFree - a.alsoFree ||
      (a.staffId === req.preferredStaffId ? -1 : b.staffId === req.preferredStaffId ? 1 : 0)
  );
  const originCheck = checks.find((c) => c.branchId === req.originBranchId) ?? { branchId: req.originBranchId, ok: false, reason: "Unknown branch" };
  // The current branch "can do it" when it has a valid time on the day asked
  // (today: right now) — with any qualified staff, not only the preferred one.
  const originFits = options.find((o) => o.branchId === req.originBranchId && o.date === date && (date !== ctx.today || o.immediate));
  const notHere = date === ctx.today ? "No qualified staff free right now" : "No free time for it that day";
  return {
    origin: originFits ? { ...originCheck, ok: true, reason: null } : { ...originCheck, ok: false, reason: originCheck.ok ? notHere : originCheck.reason },
    branches: checks,
    options,
  };
}

export type WalkinTransferRow = {
  status: "waiting_availability" | "awaiting_approval" | "confirmed" | "cancelled";
  mode: "immediate" | "later" | null;
  proposed_date: string | null;
};

/** The status everyone sees. After confirmation it follows the destination
 * booking (the receiving Front Desk checks the client in and starts service). */
export function walkinTransferStatus(
  t: WalkinTransferRow,
  appt: { status: string; session_status: string | null } | null,
  today: string
): { key: string; label: string; tone: "green" | "blue" | "amber" | "red" | "gray" | "purple" } {
  if (t.status === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "gray" };
  if (t.status === "waiting_availability") return { key: "waiting", label: "Waiting for Availability", tone: "amber" };
  if (t.status === "awaiting_approval") return { key: "awaiting", label: "Awaiting Client Approval", tone: "amber" };
  if (!appt) return { key: "confirmed", label: "Transfer Confirmed", tone: "blue" };
  if (appt.status === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "gray" };
  if (appt.session_status === "no_show") return { key: "no_show", label: "No-show", tone: "red" };
  if (appt.status === "completed" || appt.session_status === "completed" || appt.session_status === "paid")
    return { key: "completed", label: "Completed", tone: "green" };
  if (appt.session_status === "in_service") return { key: "in_service", label: "In Service", tone: "blue" };
  if (appt.session_status && ["arrived", "waiting", "ready", "late_arrival"].includes(appt.session_status))
    return { key: "checked_in", label: "Checked In at Destination", tone: "purple" };
  if (t.mode === "immediate" || t.proposed_date === today) return { key: "expected", label: "Expected at Destination", tone: "blue" };
  return { key: "confirmed", label: "Transfer Confirmed", tone: "blue" };
}
