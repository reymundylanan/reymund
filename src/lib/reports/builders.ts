// Report builders: real records in → Report out. Pure and deterministic.
import type { Cell, Column, RawAppointment, RawPayment, RawReview, Report, ReportData, ReportFilters, ReportSection, ReportType, SummaryItem } from "./model";
import { REPORT_CATALOG } from "./model";

export type ApptState = "completed" | "in_service" | "upcoming" | "cancelled" | "no_show";

export function apptState(a: Pick<RawAppointment, "status" | "sessionStatus">): ApptState {
  const s = a.sessionStatus ?? "";
  if (a.status === "cancelled") return "cancelled";
  if (s === "no_show" || a.status === "no_show") return "no_show";
  if (a.status === "completed" || s === "completed" || s === "paid") return "completed";
  if (s === "in_service") return "in_service";
  return "upcoming";
}

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
const minutesBetween = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : null);

function groupBy<T>(list: T[], key: (t: T) => string | string[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of list) {
    const keys = key(item);
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      const arr = m.get(k);
      if (arr) arr.push(item);
      else m.set(k, [item]);
    }
  }
  return m;
}

function fmtDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function hourLabel(time: string) {
  const h = Number(time.slice(0, 2));
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${h >= 12 ? "PM" : "AM"}`;
}

// ── Filtering ────────────────────────────────────────────────────────────

const inPeriod = (date: string, f: ReportFilters) => date >= f.from && date <= f.to;

export function filterAppointments(data: ReportData, f: ReportFilters, opts: { status?: boolean } = {}) {
  return data.appointments.filter(
    (a) =>
      inPeriod(a.date, f) &&
      (!f.branchId || a.branchId === f.branchId) &&
      (!f.staffId || a.staffId === f.staffId) &&
      (!f.service || a.services.includes(f.service)) &&
      (!opts.status || !f.status || apptState(a) === f.status)
  );
}

export function filterPayments(data: ReportData, f: ReportFilters, opts: { status?: boolean } = {}) {
  return data.payments.filter(
    (p) =>
      inPeriod(p.date, f) &&
      (!f.branchId || p.branchId === f.branchId) &&
      (!f.staffId || p.staffId === f.staffId) &&
      (!f.service || p.services.includes(f.service)) &&
      (!opts.status || !f.status || p.status === f.status)
  );
}

export function filterReviews(data: ReportData, f: ReportFilters) {
  return data.reviews.filter(
    (r) =>
      inPeriod(r.date, f) &&
      (!f.branchId || r.branchId === f.branchId) &&
      (!f.staffId || r.staffId === f.staffId) &&
      (!f.service || r.serviceName === f.service) &&
      (!f.rating || r.rating === f.rating)
  );
}

/** A payment's amount split evenly across its booked services. */
function revenueByService(pays: RawPayment[]) {
  const m = new Map<string, number>();
  for (const p of pays) {
    const names = p.services.length ? p.services : ["(Unlisted service)"];
    for (const n of names) m.set(n, (m.get(n) ?? 0) + p.amount / names.length);
  }
  return m;
}

const settled = (pays: RawPayment[]) => pays.filter((p) => p.status === "settled");
const sum = (pays: RawPayment[]) => pays.reduce((s, p) => s + p.amount, 0);

const C = (key: string, label: string, kind: Column["kind"] = "text"): Column => ({ key, label, kind });

// ── Reports ──────────────────────────────────────────────────────────────

function sales(data: ReportData, f: ReportFilters): Partial<Report> {
  const all = filterPayments(data, f);
  const paid = settled(all);
  const pending = all.filter((p) => p.status === "pending");
  const total = sum(paid);
  const byDay = [...groupBy(paid, (p) => p.date).entries()].sort(([a], [b]) => a.localeCompare(b));
  const byMethod = groupBy(paid, (p) => (p.method === "gcash" ? (p.paymentType === "pay_now" ? "GCash — Pay Now" : "GCash") : p.method === "cash" ? "Cash" : p.method));
  const svc = [...revenueByService(paid).entries()].sort((a, b) => b[1] - a[1]);
  return {
    summary: [
      { label: "Total Revenue", value: peso(total) },
      { label: "Paid Transactions", value: String(paid.length) },
      { label: "Average Sale", value: peso(paid.length ? total / paid.length : 0) },
      { label: "Pending Payments", value: `${pending.length} · ${peso(sum(pending))}` },
      { label: "Cash", value: peso(sum(paid.filter((p) => p.method === "cash"))) },
      { label: "GCash", value: peso(sum(paid.filter((p) => p.method === "gcash"))) },
      { label: "Advance (Pay Now)", value: peso(sum(paid.filter((p) => p.paymentType === "pay_now"))) },
    ],
    sections: [
      {
        title: "Daily Sales",
        columns: [C("date", "Date"), C("count", "Transactions", "number"), C("revenue", "Revenue", "money")],
        rows: byDay.map(([d, ps]) => ({ date: fmtDate(d), count: ps.length, revenue: sum(ps) })),
        chart: { labelKey: "date", valueKey: "revenue" },
      },
      {
        title: "Revenue by Payment Method",
        columns: [C("method", "Method"), C("count", "Transactions", "number"), C("revenue", "Revenue", "money"), C("share", "Share", "percent")],
        rows: [...byMethod.entries()].map(([m, ps]) => ({ method: m, count: ps.length, revenue: sum(ps), share: pct(sum(ps), total) })),
      },
      {
        title: "Revenue by Branch",
        columns: [C("branch", "Branch"), C("count", "Transactions", "number"), C("revenue", "Revenue", "money"), C("share", "Share", "percent")],
        rows: [...groupBy(paid, (p) => p.branchName).entries()]
          .map(([b, ps]) => ({ branch: b, count: ps.length, revenue: sum(ps), share: pct(sum(ps), total) }))
          .sort((a, b) => b.revenue - a.revenue),
        chart: { labelKey: "branch", valueKey: "revenue" },
      },
      {
        title: "Revenue by Service",
        note: "A payment covering several services is split evenly between them.",
        columns: [C("service", "Service"), C("revenue", "Revenue", "money"), C("share", "Share", "percent")],
        rows: svc.map(([s, r]) => ({ service: s, revenue: Math.round(r * 100) / 100, share: pct(r, total) })),
      },
      {
        title: "Revenue by Staff",
        columns: [C("staff", "Staff"), C("count", "Transactions", "number"), C("revenue", "Revenue", "money")],
        rows: [...groupBy(paid, (p) => p.staffName || "Unassigned").entries()]
          .map(([s, ps]) => ({ staff: s, count: ps.length, revenue: sum(ps) }))
          .sort((a, b) => b.revenue - a.revenue),
      },
    ],
    findings: [
      paid.length ? `Revenue of ${peso(total)} from ${paid.length} verified payments.` : "No verified payments in this period.",
      ...(svc[0] ? [`Top service by revenue: ${svc[0][0]} (${peso(svc[0][1])}).`] : []),
      ...(pending.length ? [`${pending.length} payment(s) worth ${peso(sum(pending))} are still pending.`] : []),
    ],
  };
}

function appointmentsReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const list = filterAppointments(data, f, { status: true }).filter((a) => a.visitType === "appointment");
  const count = (s: ApptState[]) => list.filter((a) => s.includes(apptState(a))).length;
  const by = (key: (a: RawAppointment) => string | string[], label: string, title: string): ReportSection => ({
    title,
    columns: [C("name", label), C("total", "Total", "number"), C("completed", "Completed", "number"), C("cancelled", "Cancelled", "number"), C("noShow", "No-Shows", "number")],
    rows: [...groupBy(list, key).entries()]
      .map(([n, as]) => ({
        name: n,
        total: as.length,
        completed: as.filter((a) => apptState(a) === "completed").length,
        cancelled: as.filter((a) => apptState(a) === "cancelled").length,
        noShow: as.filter((a) => apptState(a) === "no_show").length,
      }))
      .sort((a, b) => b.total - a.total),
  });
  const days = [...groupBy(list, (a) => a.date).entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  const hours = [...groupBy(list, (a) => a.time.slice(0, 2)).entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    summary: [
      { label: "Total Appointments", value: String(list.length) },
      { label: "Completed", value: String(count(["completed"])) },
      { label: "Upcoming / In Service", value: String(count(["upcoming", "in_service"])) },
      { label: "Cancelled", value: String(count(["cancelled"])) },
      { label: "No-Shows", value: String(count(["no_show"])) },
      { label: "Rescheduled", value: String(list.filter((a) => a.rescheduleCount > 0).length) },
    ],
    sections: [
      by((a) => a.branchName, "Branch", "Appointments by Branch"),
      by((a) => (a.services.length ? a.services : ["(Unlisted service)"]), "Service", "Appointments by Service"),
      by((a) => a.staffName || "Unassigned", "Staff", "Appointments by Staff"),
      {
        title: "Peak Booking Times",
        columns: [C("hour", "Start Time"), C("count", "Appointments", "number")],
        rows: hours.map(([h, as]) => ({ hour: hourLabel(`${h}:00`), count: as.length })),
        chart: { labelKey: "hour", valueKey: "count" },
      },
      {
        title: "Busiest Dates",
        columns: [C("date", "Date"), C("count", "Appointments", "number")],
        rows: days.map(([d, as]) => ({ date: fmtDate(d), count: as.length })),
      },
    ],
    findings: list.length
      ? [`${pct(count(["completed"]), list.length)}% of appointments were completed; ${pct(count(["cancelled", "no_show"]), list.length)}% were cancelled or no-shows.`]
      : ["No appointments in this period."],
  };
}

function ratingStats(reviews: RawReview[]) {
  return { count: reviews.length, average: avg(reviews.map((r) => r.rating)), five: reviews.filter((r) => r.rating === 5).length, low: reviews.filter((r) => r.rating <= 2).length };
}

function staffReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const appts = filterAppointments(data, f);
  const pays = settled(filterPayments(data, f));
  const reviews = filterReviews({ ...data }, { ...f, service: null, rating: null }).filter((r) => r.type === "staff" && r.status !== "removed");
  const staff = data.staff.filter((s) => (!f.staffId || s.id === f.staffId) && (!f.branchId || s.branchId === f.branchId || appts.some((a) => a.staffId === s.id)));
  const rows = staff
    .map((s) => {
      const mine = appts.filter((a) => a.staffId === s.id);
      const done = mine.filter((a) => apptState(a) === "completed");
      const durations = done.map((a) => minutesBetween(a.serviceStartedAt, a.completedAt)).filter((x): x is number => x !== null && x > 0);
      const r = ratingStats(reviews.filter((x) => x.staffId === s.id));
      return {
        staff: s.name,
        department: s.department ?? "—",
        appointments: mine.length,
        completed: done.length,
        cancelled: mine.filter((a) => apptState(a) === "cancelled").length,
        noShows: mine.filter((a) => apptState(a) === "no_show").length,
        sales: sum(pays.filter((p) => p.staffId === s.id)),
        rating: r.count ? r.average : "—",
        reviews: r.count,
        avgMinutes: durations.length ? Math.round(avg(durations)) : "—",
      } as Record<string, Cell>;
    })
    .sort((a, b) => Number(b.completed) - Number(a.completed) || Number(b.sales) - Number(a.sales));
  const totalCompleted = rows.reduce((s, r) => s + Number(r.completed), 0);
  const rated = reviews.length ? avg(reviews.map((r) => r.rating)) : null;
  const columns = [
    C("staff", "Staff"),
    C("department", "Department"),
    C("appointments", "Appointments", "number"),
    C("completed", "Completed", "number"),
    C("cancelled", "Cancelled", "number"),
    C("noShows", "No-Shows", "number"),
    C("sales", "Sales", "money"),
    C("rating", "Avg Rating", "rating"),
    C("reviews", "Reviews", "number"),
    C("avgMinutes", "Avg Service (min)", "number"),
  ];
  return {
    summary: [
      { label: "Staff", value: String(rows.length) },
      { label: "Completed Services", value: String(totalCompleted) },
      { label: "Sales Generated", value: peso(rows.reduce((s, r) => s + Number(r.sales), 0)) },
      { label: "Average Rating", value: rated !== null ? `${rated} ★` : "No reviews" },
    ],
    sections: [
      {
        title: "Top Performing Staff",
        note: "Ranked by completed services, then sales. All metrics are from this period's records.",
        columns: [C("rank", "#", "number"), ...columns.filter((c) => ["staff", "completed", "sales", "rating", "reviews"].includes(c.key))],
        rows: rows.filter((r) => Number(r.completed) > 0).slice(0, 5).map((r, i) => ({ rank: i + 1, ...r })),
        chart: { labelKey: "staff", valueKey: "completed" },
      },
      { title: "Staff Performance", columns, rows },
    ],
    findings: rows[0] && Number(rows[0].completed) > 0 ? [`${rows[0].staff} completed the most services (${rows[0].completed}).`] : ["No completed services in this period."],
  };
}

function clientKey(x: { clientId: string | null; clientName: string }) {
  return x.clientId ? `c:${x.clientId}` : `w:${x.clientName.trim().toLowerCase()}`;
}

function mostCommon(values: string[]) {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

function clientSpending(data: ReportData, f: ReportFilters): Partial<Report> {
  const pays = settled(filterPayments(data, f));
  const rows = [...groupBy(pays, clientKey).values()]
    .map((ps) => {
      const total = sum(ps);
      const visits = new Set(ps.map((p) => p.appointmentId)).size;
      const services = [...new Set(ps.flatMap((p) => p.services))];
      return {
        client: ps[0].clientName + (ps[0].clientId ? "" : " (walk-in)"),
        visits,
        services: services.slice(0, 4).join(", ") + (services.length > 4 ? ` +${services.length - 4}` : ""),
        total,
        average: Math.round((total / ps.length) * 100) / 100,
        lastVisit: fmtDate(ps.map((p) => p.date).sort().at(-1)!),
        branch: mostCommon(ps.map((p) => p.branchName)),
      } as Record<string, Cell>;
    })
    .sort((a, b) => Number(b.total) - Number(a.total));
  const columns = [
    C("client", "Client"),
    C("visits", "Paid Visits", "number"),
    C("services", "Services Purchased"),
    C("total", "Total Spent", "money"),
    C("average", "Avg Transaction", "money"),
    C("lastVisit", "Last Paid Visit"),
    C("branch", "Main Branch"),
  ];
  const total = sum(pays);
  return {
    summary: [
      { label: "Paying Clients", value: String(rows.length) },
      { label: "Total Spent", value: peso(total) },
      { label: "Average per Client", value: peso(rows.length ? total / rows.length : 0) },
      { label: "Top Client", value: rows[0] ? `${rows[0].client} · ${peso(Number(rows[0].total))}` : "—" },
    ],
    sections: [
      { title: "Top Clients by Spending", note: "Based on verified (settled) payments only.", columns, rows: rows.slice(0, 10), chart: { labelKey: "client", valueKey: "total" } },
      { title: "All Clients", columns, rows },
    ],
    findings: rows.length ? [`The top 10 clients account for ${pct(rows.slice(0, 10).reduce((s, r) => s + Number(r.total), 0), total)}% of spending.`] : ["No paid transactions in this period."],
  };
}

function clientActivity(data: ReportData, f: ReportFilters): Partial<Report> {
  const appts = filterAppointments(data, { ...f, staffId: null, service: null });
  const groups = [...groupBy(appts, clientKey).values()];
  const accounts = groups.filter((g) => g[0].clientId);
  const returning = accounts.filter((g) => data.returningClientIds.has(g[0].clientId!)).length;
  const rows = groups
    .map((as) => ({
      client: as[0].clientName + (as[0].clientId ? "" : " (walk-in)"),
      type: as[0].clientId ? (data.returningClientIds.has(as[0].clientId) ? "Returning" : "New") : "Walk-in guest",
      bookings: as.length,
      completed: as.filter((a) => apptState(a) === "completed").length,
      cancelled: as.filter((a) => apptState(a) === "cancelled").length,
      noShows: as.filter((a) => apptState(a) === "no_show").length,
      lastVisit: fmtDate(as.map((a) => a.date).sort().at(-1)!),
    }))
    .sort((a, b) => b.completed - a.completed || b.bookings - a.bookings);
  const completedVisits = appts.filter((a) => apptState(a) === "completed").length;
  return {
    summary: [
      { label: "Active Clients", value: String(groups.length) },
      { label: "New Clients", value: String(accounts.length - returning) },
      { label: "Returning Clients", value: String(returning) },
      { label: "Walk-in Guests", value: String(groups.length - accounts.length) },
      { label: "Completed Visits", value: String(completedVisits) },
      { label: "Bookings per Client", value: String(groups.length ? round1(appts.length / groups.length) : 0) },
      { label: "Cancellations", value: String(appts.filter((a) => apptState(a) === "cancelled").length) },
      { label: "No-Shows", value: String(appts.filter((a) => apptState(a) === "no_show").length) },
    ],
    sections: [
      {
        title: "Most Active Clients",
        note: "New = first visit in this period; Returning = visited before it. Walk-in guests have no account.",
        columns: [C("client", "Client"), C("type", "Type"), C("bookings", "Bookings", "number"), C("completed", "Completed", "number"), C("cancelled", "Cancelled", "number"), C("noShows", "No-Shows", "number"), C("lastVisit", "Last Visit")],
        rows,
      },
    ],
    findings: [],
  };
}

function servicesReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const appts = filterAppointments(data, { ...f, service: null });
  const rev = revenueByService(settled(filterPayments(data, { ...f, service: null })));
  const reviews = filterReviews(data, { ...f, service: null, staffId: null, rating: null }).filter((r) => r.type === "service" && r.status !== "removed");
  const rows = [...groupBy(appts, (a) => (a.services.length ? a.services : ["(Unlisted service)"])).entries()]
    .map(([name, as]) => {
      const r = ratingStats(reviews.filter((x) => x.serviceName === name));
      return {
        service: name,
        bookings: as.length,
        completed: as.filter((a) => apptState(a) === "completed").length,
        cancelled: as.filter((a) => apptState(a) === "cancelled" || apptState(a) === "no_show").length,
        revenue: Math.round((rev.get(name) ?? 0) * 100) / 100,
        rating: r.count ? r.average : "—",
        reviews: r.count,
        duration: Math.round(avg(as.map((a) => a.durationMinutes / Math.max(1, a.services.length)))),
      } as Record<string, Cell>;
    })
    .sort((a, b) => Number(b.bookings) - Number(a.bookings) || Number(b.revenue) - Number(a.revenue));
  const columns = [
    C("service", "Service"),
    C("bookings", "Bookings", "number"),
    C("completed", "Completed", "number"),
    C("cancelled", "Cancelled / No-Show", "number"),
    C("revenue", "Revenue", "money"),
    C("rating", "Avg Rating", "rating"),
    C("reviews", "Reviews", "number"),
    C("duration", "Avg Duration (min)", "number"),
  ];
  return {
    summary: [
      { label: "Services Booked", value: String(rows.length) },
      { label: "Total Bookings", value: String(appts.length) },
      { label: "Service Revenue", value: peso([...rev.values()].reduce((s, v) => s + v, 0)) },
      { label: "Top Service", value: rows[0] ? String(rows[0].service) : "—" },
    ],
    sections: [
      { title: "Top Services", note: "Ranked by bookings, then revenue.", columns, rows: rows.slice(0, 5), chart: { labelKey: "service", valueKey: "bookings" } },
      { title: "Service Performance", columns, rows },
    ],
    findings: [],
  };
}

function branchesReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const scope = { ...f, branchId: null, staffId: null, service: null };
  const appts = filterAppointments(data, scope);
  const pays = settled(filterPayments(data, scope));
  const reviews = filterReviews(data, { ...scope, rating: null }).filter((r) => r.type === "branch" && r.status !== "removed");
  const rows = data.branches.map((b) => {
    const as = appts.filter((a) => a.branchId === b.id);
    const bookings = as.filter((a) => a.visitType === "appointment");
    const r = ratingStats(reviews.filter((x) => x.branchId === b.id));
    return {
      branch: b.name,
      appointments: bookings.length,
      completed: as.filter((a) => apptState(a) === "completed").length,
      walkins: as.filter((a) => a.visitType === "walk_in").length,
      revenue: sum(pays.filter((p) => p.branchId === b.id)),
      clients: new Set(as.map(clientKey)).size,
      staff: new Set(as.map((a) => a.staffId).filter(Boolean)).size,
      rating: r.count ? r.average : "—",
      cancelRate: pct(bookings.filter((a) => apptState(a) === "cancelled").length, bookings.length),
      noShowRate: pct(bookings.filter((a) => apptState(a) === "no_show").length, bookings.length),
    } as Record<string, Cell>;
  });
  return {
    summary: [
      { label: "Branches", value: String(rows.length) },
      { label: "Total Revenue", value: peso(sum(pays)) },
      { label: "Appointments", value: String(rows.reduce((s, r) => s + Number(r.appointments), 0)) },
      { label: "Walk-Ins", value: String(rows.reduce((s, r) => s + Number(r.walkins), 0)) },
    ],
    sections: [
      {
        title: "Branch Comparison",
        columns: [
          C("branch", "Branch"),
          C("appointments", "Appointments", "number"),
          C("completed", "Completed", "number"),
          C("walkins", "Walk-Ins", "number"),
          C("revenue", "Revenue", "money"),
          C("clients", "Clients", "number"),
          C("staff", "Active Staff", "number"),
          C("rating", "Avg Rating", "rating"),
          C("cancelRate", "Cancellation Rate", "percent"),
          C("noShowRate", "No-Show Rate", "percent"),
        ],
        rows,
        chart: { labelKey: "branch", valueKey: "revenue" },
      },
    ],
    findings: [],
  };
}

function reviewsReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const all = filterReviews(data, f);
  const counted = all.filter((r) => r.status !== "removed");
  const perf = (type: RawReview["type"], label: string, title: string): ReportSection => ({
    title,
    columns: [C("name", label), C("count", "Reviews", "number"), C("average", "Avg Rating", "rating"), C("five", "5-Star", "number"), C("low", "1–2 Star", "number")],
    rows: [...groupBy(counted.filter((r) => r.type === type), (r) => r.target).entries()]
      .map(([n, rs]) => ({ name: n, ...ratingStats(rs) }))
      .sort((a, b) => b.count - a.count || b.average - a.average),
  });
  const stars = [5, 4, 3, 2, 1].map((s) => ({ stars: `${s} ★`, count: counted.filter((r) => r.rating === s).length, share: pct(counted.filter((r) => r.rating === s).length, counted.length) }));
  return {
    summary: [
      { label: "Total Reviews", value: String(counted.length) },
      { label: "Average Rating", value: counted.length ? `${avg(counted.map((r) => r.rating))} ★` : "—" },
      { label: "With Photos", value: String(counted.filter((r) => r.photos > 0).length) },
      { label: "Visible", value: String(all.filter((r) => r.status === "visible").length) },
      { label: "Flagged", value: String(all.filter((r) => r.status === "flagged").length) },
      { label: "Hidden", value: String(all.filter((r) => r.status === "hidden").length) },
      { label: "Removed", value: String(all.filter((r) => r.status === "removed").length) },
    ],
    sections: [
      { title: "Rating Breakdown", columns: [C("stars", "Rating"), C("count", "Reviews", "number"), C("share", "Share", "percent")], rows: stars, chart: { labelKey: "stars", valueKey: "count" } },
      perf("staff", "Staff", "Staff Review Performance"),
      perf("service", "Service", "Service Review Performance"),
      perf("branch", "Branch", "Branch Review Performance"),
      {
        title: "Review Details",
        columns: [C("date", "Date"), C("type", "Type"), C("target", "About"), C("rating", "Rating", "number"), C("client", "Client"), C("status", "Status"), C("comment", "Comment")],
        rows: [...all]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((r) => ({
            date: fmtDate(r.date),
            type: r.type[0].toUpperCase() + r.type.slice(1),
            target: r.target,
            rating: r.rating,
            client: r.clientName,
            status: r.status,
            comment: (r.text ?? "").replace(/\s+/g, " ").slice(0, 160),
          })),
      },
    ],
    findings: [],
  };
}

function paymentsReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const all = filterPayments(data, f, { status: true });
  const paid = settled(all);
  const pending = all.filter((p) => p.status === "pending");
  const label = (p: RawPayment) => (p.method === "gcash" ? "GCash" : p.method === "cash" ? "Cash" : p.method);
  const statusLabel: Record<string, string> = { settled: "Paid / Verified", pending: "Pending", failed: "Not Received", refunded: "Refunded" };
  return {
    summary: [
      { label: "Payments", value: String(all.length) },
      { label: "Total Paid", value: peso(sum(paid)) },
      { label: "Pending", value: `${pending.length} · ${peso(sum(pending))}` },
      { label: "Verified", value: String(paid.length) },
      { label: "Cash", value: peso(sum(paid.filter((p) => p.method === "cash"))) },
      { label: "GCash", value: peso(sum(paid.filter((p) => p.method === "gcash"))) },
      { label: "Advance (Pay Now)", value: peso(sum(paid.filter((p) => p.paymentType === "pay_now"))) },
    ],
    sections: [
      {
        title: "Paid Totals by Branch",
        columns: [C("branch", "Branch"), C("count", "Payments", "number"), C("total", "Total", "money")],
        rows: [...groupBy(paid, (p) => p.branchName).entries()].map(([b, ps]) => ({ branch: b, count: ps.length, total: sum(ps) })).sort((a, b) => b.total - a.total),
      },
      {
        title: "Paid Totals by Service",
        note: "A payment covering several services is split evenly between them.",
        columns: [C("service", "Service"), C("total", "Total", "money")],
        rows: [...revenueByService(paid).entries()].map(([s, t]) => ({ service: s, total: Math.round(t * 100) / 100 })).sort((a, b) => b.total - a.total),
      },
      {
        title: "Transactions",
        columns: [C("date", "Date"), C("client", "Client"), C("services", "Services"), C("branch", "Branch"), C("method", "Method"), C("type", "Type"), C("status", "Status"), C("reference", "Reference"), C("amount", "Amount", "money")],
        rows: [...all]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((p) => ({
            date: fmtDate(p.date),
            client: p.clientName,
            services: p.services.join(", ") || "—",
            branch: p.branchName,
            method: label(p),
            type: p.paymentType === "pay_now" ? "Pay Now" : "At branch",
            status: statusLabel[p.status] ?? p.status,
            reference: p.referenceNo ?? "—",
            amount: p.amount,
          })),
      },
    ],
    findings: [],
  };
}

function cancellationsReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const appts = filterAppointments(data, f);
  const lost = appts.filter((a) => ["cancelled", "no_show"].includes(apptState(a)));
  const by = (key: (a: RawAppointment) => string | string[], label: string, title: string): ReportSection => ({
    title,
    columns: [C("name", label), C("total", "Bookings", "number"), C("cancelled", "Cancelled", "number"), C("noShows", "No-Shows", "number"), C("rate", "Lost Rate", "percent")],
    rows: [...groupBy(appts, key).entries()]
      .map(([n, as]) => {
        const c = as.filter((a) => apptState(a) === "cancelled").length;
        const ns = as.filter((a) => apptState(a) === "no_show").length;
        return { name: n, total: as.length, cancelled: c, noShows: ns, rate: pct(c + ns, as.length) };
      })
      .filter((r) => r.cancelled + r.noShows > 0)
      .sort((a, b) => b.cancelled + b.noShows - (a.cancelled + a.noShows)),
  });
  const repeat = [...groupBy(appts.filter((a) => apptState(a) === "no_show"), clientKey).values()].filter((g) => g.length >= 2);
  const cancelled = appts.filter((a) => apptState(a) === "cancelled").length;
  const noShows = appts.filter((a) => apptState(a) === "no_show").length;
  return {
    summary: [
      { label: "Total Bookings", value: String(appts.length) },
      { label: "Cancellations", value: String(cancelled) },
      { label: "No-Shows", value: String(noShows) },
      { label: "Cancellation Rate", value: `${pct(cancelled, appts.length)}%` },
      { label: "No-Show Rate", value: `${pct(noShows, appts.length)}%` },
    ],
    sections: [
      by((a) => (a.services.length ? a.services : ["(Unlisted service)"]), "Service", "By Service"),
      by((a) => a.staffName || "Unassigned", "Staff", "By Staff"),
      by((a) => a.branchName, "Branch", "By Branch"),
      {
        title: "Clients with Repeated No-Shows",
        columns: [C("client", "Client"), C("noShows", "No-Shows", "number"), C("last", "Most Recent")],
        rows: repeat.map((g) => ({ client: g[0].clientName, noShows: g.length, last: fmtDate(g.map((a) => a.date).sort().at(-1)!) })).sort((a, b) => b.noShows - a.noShows),
      },
    ],
    findings: lost.length ? [] : ["No cancellations or no-shows in this period."],
  };
}

function walkinsReport(data: ReportData, f: ReportFilters): Partial<Report> {
  const list = filterAppointments(data, f).filter((a) => a.visitType === "walk_in");
  const done = list.filter((a) => apptState(a) === "completed");
  const waits = list.map((a) => minutesBetween(a.arrivalTime, a.serviceStartedAt)).filter((x): x is number => x !== null);
  const serviceTimes = done.map((a) => minutesBetween(a.serviceStartedAt, a.completedAt)).filter((x): x is number => x !== null && x > 0);
  const by = (key: (a: RawAppointment) => string | string[], label: string, title: string): ReportSection => ({
    title,
    columns: [C("name", label), C("total", "Walk-Ins", "number"), C("completed", "Completed", "number"), C("avgService", "Avg Service (min)", "number")],
    rows: [...groupBy(list, key).entries()]
      .map(([n, as]) => {
        const t = as.map((a) => minutesBetween(a.serviceStartedAt, a.completedAt)).filter((x): x is number => x !== null && x > 0);
        return { name: n, total: as.length, completed: as.filter((a) => apptState(a) === "completed").length, avgService: t.length ? Math.round(avg(t)) : "—" } as Record<string, Cell>;
      })
      .sort((a, b) => Number(b.total) - Number(a.total)),
  });
  return {
    summary: [
      { label: "Total Walk-Ins", value: String(list.length) },
      { label: "Completed", value: String(done.length) },
      { label: "Cancelled", value: String(list.filter((a) => apptState(a) === "cancelled").length) },
      { label: "Avg Waiting Time", value: waits.length ? `${Math.round(avg(waits))} min` : "—" },
      { label: "Avg Service Time", value: serviceTimes.length ? `${Math.round(avg(serviceTimes))} min` : "—" },
    ],
    sections: [
      by((a) => (a.services.length ? a.services : ["(Unlisted service)"]), "Service", "Walk-Ins by Service"),
      by((a) => a.branchName, "Branch", "Walk-Ins by Branch"),
      by((a) => a.staffName || "Unassigned", "Staff", "Walk-Ins by Staff"),
    ],
    findings: [],
  };
}

const BUILDERS: Record<ReportType, (d: ReportData, f: ReportFilters) => Partial<Report>> = {
  sales,
  appointments: appointmentsReport,
  staff: staffReport,
  client_spending: clientSpending,
  client_activity: clientActivity,
  services: servicesReport,
  branches: branchesReport,
  reviews: reviewsReport,
  payments: paymentsReport,
  cancellations: cancellationsReport,
  walkins: walkinsReport,
};

export function filtersUsed(data: ReportData, f: ReportFilters, applies: string[]): [string, string][] {
  const out: [string, string][] = [["Period", `${fmtDate(f.from)} – ${fmtDate(f.to)}`]];
  if (applies.includes("branch")) out.push(["Branch", data.branches.find((b) => b.id === f.branchId)?.name ?? "All Branches"]);
  if (applies.includes("staff")) out.push(["Staff", data.staff.find((s) => s.id === f.staffId)?.name ?? "All Staff"]);
  if (applies.includes("service")) out.push(["Service", f.service ?? "All Services"]);
  if (applies.includes("status")) out.push(["Status", f.status ? f.status.replace(/_/g, " ") : "All"]);
  if (applies.includes("rating")) out.push(["Rating", f.rating ? `${f.rating} ★` : "All Ratings"]);
  return out;
}

export function buildReport(type: ReportType, data: ReportData, f: ReportFilters, now = new Date()): Report {
  const meta = REPORT_CATALOG.find((r) => r.type === type)!;
  const part = BUILDERS[type](data, f);
  return {
    type,
    title: `${meta.title} Report`,
    period: { from: f.from, to: f.to },
    filtersUsed: filtersUsed(data, f, meta.filters),
    summary: (part.summary ?? []) as SummaryItem[],
    sections: part.sections ?? [],
    findings: part.findings ?? [],
    generatedAt: now.toISOString(),
  };
}

// ── Custom report ───────────────────────────────────────────────────────

export type CustomSource = "appointments" | "payments" | "reviews";

export const CUSTOM_COLUMNS: Record<CustomSource, Column[]> = {
  appointments: [
    C("date", "Date"),
    C("time", "Time"),
    C("client", "Client Name"),
    C("services", "Service"),
    C("staff", "Staff"),
    C("branch", "Branch"),
    C("visit", "Visit Type"),
    C("status", "Status"),
    C("amount", "Amount", "money"),
  ],
  payments: [
    C("date", "Date"),
    C("client", "Client Name"),
    C("services", "Service"),
    C("staff", "Staff"),
    C("branch", "Branch"),
    C("method", "Method"),
    C("type", "Payment Type"),
    C("status", "Status"),
    C("reference", "Reference"),
    C("amount", "Amount", "money"),
  ],
  reviews: [C("date", "Date"), C("type", "Type"), C("target", "About"), C("rating", "Rating", "number"), C("client", "Client Name"), C("status", "Status"), C("photos", "Photos", "number"), C("comment", "Comment")],
};

const STATE_LABEL: Record<ApptState, string> = { completed: "Completed", in_service: "In Service", upcoming: "Upcoming", cancelled: "Cancelled", no_show: "No Show" };

export function buildCustomReport(source: CustomSource, columnKeys: string[], data: ReportData, f: ReportFilters, now = new Date()): Report {
  const columns = CUSTOM_COLUMNS[source].filter((c) => columnKeys.includes(c.key));
  let rows: Record<string, Cell>[] = [];
  if (source === "appointments") {
    rows = filterAppointments(data, f, { status: true })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((a) => ({
        date: fmtDate(a.date),
        time: a.time.slice(0, 5),
        client: a.clientName,
        services: a.services.join(", ") || "—",
        staff: a.staffName || "—",
        branch: a.branchName,
        visit: a.visitType === "walk_in" ? "Walk-in" : "Appointment",
        status: STATE_LABEL[apptState(a)],
        amount: a.price ?? 0,
      }));
  } else if (source === "payments") {
    rows = filterPayments(data, f, { status: true })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((p) => ({
        date: fmtDate(p.date),
        client: p.clientName,
        services: p.services.join(", ") || "—",
        staff: p.staffName || "—",
        branch: p.branchName,
        method: p.method === "gcash" ? "GCash" : p.method === "cash" ? "Cash" : p.method,
        type: p.paymentType === "pay_now" ? "Pay Now" : "At branch",
        status: p.status,
        reference: p.referenceNo ?? "—",
        amount: p.amount,
      }));
  } else {
    rows = filterReviews(data, f)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: fmtDate(r.date), type: r.type, target: r.target, rating: r.rating, client: r.clientName, status: r.status, photos: r.photos, comment: (r.text ?? "").replace(/\s+/g, " ") }));
  }
  const name = { appointments: "Appointments", payments: "Payments", reviews: "Reviews" }[source];
  return {
    type: "custom",
    title: `Custom ${name} Report`,
    period: { from: f.from, to: f.to },
    filtersUsed: filtersUsed(data, f, ["branch", "staff", "service", ...(source === "reviews" ? ["rating"] : ["status"])]),
    summary: [{ label: "Rows", value: String(rows.length) }, ...(columns.some((c) => c.kind === "money") ? [{ label: "Total Amount", value: peso(rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)) }] : [])],
    sections: [{ title: `${name} (${rows.length})`, columns, rows }],
    findings: [],
    generatedAt: now.toISOString(),
  };
}
