import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { addDaysKey, lastDays, manilaKey, pctChange } from "@/lib/adminOverview";
import { getRecentActivity, type ActivityItem } from "@/lib/supabase/queries/adminDashboard";

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

type ApptRow = {
  id: string;
  scheduled_date: string;
  start_time: string;
  status: string;
  session_status: string | null;
  visit_type: string | null;
  client_id: string | null;
  walkin_name: string | null;
  notes: string | null;
  branch_id: string;
  professional_id: string | null;
  client: Rel<{ full_name: string | null; avatar_url: string | null }>;
  professional: Rel<{ full_name: string | null }>;
  service: Rel<{ name: string | null }>;
  branch: Rel<{ name: string | null }>;
  appointment_services: { service_name: string; position: number }[] | null;
};

export type ApptState = "upcoming" | "in_service" | "completed" | "cancelled" | "no_show";

function apptState(a: Pick<ApptRow, "status" | "session_status">): ApptState {
  const s = a.session_status ?? "";
  if (a.status === "cancelled") return "cancelled";
  if (s === "no_show") return "no_show";
  if (a.status === "completed" || s === "completed" || s === "paid") return "completed";
  if (s === "in_service") return "in_service";
  return "upcoming";
}

function serviceNames(a: ApptRow): string[] {
  const listed = [...(a.appointment_services ?? [])].sort((x, y) => x.position - y.position).map((s) => s.service_name.trim());
  if (listed.length) return listed;
  const joined = one(a.service)?.name;
  if (joined) return [joined];
  const fromNotes = a.notes?.split(" with ")[0]?.trim();
  return fromNotes ? fromNotes.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function priceFromNotes(notes: string | null): number | null {
  const m = notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;

export async function getAdminOverview(supabase: SupabaseClient) {
  const today = manilaKey(new Date());
  const yesterday = addDaysKey(today, -1);
  const week = lastDays(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = week[0] < monthStart ? week[0] : monthStart;
  const paymentsFrom = addDaysKey(from, -1);

  const [appts, payments, customers, newCustomers, completedClients, staff, attendance, offToday, branches, services, staffReviews, serviceReviews, newReviews, flaggedReviews, pendingGcash, pendingBookings, activity] =
    await Promise.all([
      supabase
        .from("appointments")
        .select(
          "id, scheduled_date, start_time, status, session_status, visit_type, client_id, walkin_name, notes, branch_id, professional_id, client:profiles!appointments_client_id_fkey(full_name, avatar_url), professional:staff_members(full_name), service:branch_services(name), branch:branches(name), appointment_services(service_name, position)"
        )
        .gte("scheduled_date", from)
        .lte("scheduled_date", today)
        .order("start_time")
        .limit(5000),
      supabase
        .from("payments")
        .select("amount, created_at, appointment:appointments(branch_id)")
        .eq("status", "settled")
        .gte("created_at", `${paymentsFrom}T00:00:00+08:00`)
        .limit(10000),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer").gte("created_at", `${monthStart}T00:00:00+08:00`),
      supabase.from("appointments").select("client_id").not("client_id", "is", null).or("status.eq.completed,session_status.in.(completed,paid)").limit(10000),
      supabase.from("staff_members").select("id, full_name, department, avatar_url, branch_id").order("full_name"),
      supabase.from("staff_attendance").select("staff_member_id, status, time_in, time_out").eq("attendance_date", today),
      supabase.from("staff_shifts").select("staff_member_id").eq("shift_date", today),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("branch_services").select("name, status"),
      supabase.from("reviews").select("staff_id, rating").eq("target_type", "staff").eq("status", "visible"),
      supabase.from("reviews").select("rating, service:branch_services(name)").eq("target_type", "service").eq("status", "visible"),
      supabase.from("reviews").select("id", { count: "exact", head: true }).is("admin_seen_at", null),
      supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "flagged"),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").eq("method", "gcash"),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending").gte("scheduled_date", today),
      getRecentActivity(supabase),
    ]);

  for (const [label, res] of [
    ["appointments", appts],
    ["payments", payments],
    ["staff", staff],
    ["attendance", attendance],
    ["branch services", services],
  ] as const) {
    logQueryError(`getAdminOverview ${label}`, res.error);
  }

  const rows = (appts.data ?? []) as unknown as ApptRow[];
  const todays = rows.filter((a) => a.scheduled_date === today);
  const month = rows.filter((a) => a.scheduled_date >= monthStart);
  const count = (list: ApptRow[], ...states: ApptState[]) => list.filter((a) => states.includes(apptState(a))).length;

  // ── Revenue ─────────────────────────────────────────────────────────
  type PayRow = { amount: number; created_at: string; appointment: Rel<{ branch_id: string }> };
  const pays = (payments.data ?? []) as unknown as PayRow[];
  const revenueByDay = new Map<string, number>();
  const revenueByBranch = new Map<string, number>();
  for (const p of pays) {
    const day = manilaKey(new Date(p.created_at));
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(p.amount));
    if (day >= monthStart) {
      const b = one(p.appointment)?.branch_id;
      if (b) revenueByBranch.set(b, (revenueByBranch.get(b) ?? 0) + Number(p.amount));
    }
  }
  const todaySales = revenueByDay.get(today) ?? 0;
  const monthRevenue = [...revenueByDay.entries()].filter(([d]) => d >= monthStart).reduce((s, [, v]) => s + v, 0);

  // ── Staff ───────────────────────────────────────────────────────────
  type StaffRow = { id: string; full_name: string; department: string | null; avatar_url: string | null; branch_id: string | null };
  const staffRows = (staff.data ?? []) as StaffRow[];
  const off = new Set(((offToday.data ?? []) as { staff_member_id: string }[]).map((r) => r.staff_member_id));
  const att = (attendance.data ?? []) as { staff_member_id: string; status: string; time_in: string | null; time_out: string | null }[];
  const scheduled = staffRows.filter((s) => !off.has(s.id));
  const onDuty = scheduled.filter((s) => att.some((a) => a.staff_member_id === s.id && a.time_in && !a.time_out && a.status !== "out"));

  const staffRating = new Map<string, { sum: number; n: number }>();
  for (const r of (staffReviews.data ?? []) as { staff_id: string | null; rating: number }[]) {
    if (!r.staff_id) continue;
    const cur = staffRating.get(r.staff_id) ?? { sum: 0, n: 0 };
    staffRating.set(r.staff_id, { sum: cur.sum + r.rating, n: cur.n + 1 });
  }
  const topStaff = staffRows
    .map((s) => {
      const appointments = month.filter((a) => a.professional_id === s.id && apptState(a) !== "cancelled").length;
      const r = staffRating.get(s.id);
      return { id: s.id, name: s.full_name, department: s.department, avatarUrl: s.avatar_url, appointments, rating: r ? Math.round((r.sum / r.n) * 10) / 10 : null };
    })
    .filter((s) => s.appointments > 0 || s.rating !== null)
    .sort((a, b) => b.appointments - a.appointments || (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 4);

  // ── Services ────────────────────────────────────────────────────────
  const serviceRating = new Map<string, { sum: number; n: number }>();
  for (const r of (serviceReviews.data ?? []) as unknown as { rating: number; service: Rel<{ name: string }> }[]) {
    const name = one(r.service)?.name?.trim();
    if (!name) continue;
    const cur = serviceRating.get(name) ?? { sum: 0, n: 0 };
    serviceRating.set(name, { sum: cur.sum + r.rating, n: cur.n + 1 });
  }
  const serviceCounts = new Map<string, number>();
  for (const a of month) {
    if (apptState(a) === "cancelled") continue;
    for (const name of serviceNames(a)) serviceCounts.set(name, (serviceCounts.get(name) ?? 0) + 1);
  }
  const topServices = [...serviceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, bookings]) => {
      const r = serviceRating.get(name);
      return { name, bookings, rating: r ? Math.round((r.sum / r.n) * 10) / 10 : null };
    });
  const serviceRows = (services.data ?? []) as { name: string; status: string | null }[];
  const activeServices = serviceRows.filter((s) => (s.status ?? "Active") === "Active").length;

  // ── Branches ────────────────────────────────────────────────────────
  const branchRows = (branches.data ?? []) as { id: string; name: string }[];
  const monthActive = month.filter((a) => apptState(a) !== "cancelled");
  const branchPerformance = branchRows
    .map((b) => ({
      id: b.id,
      name: b.name,
      appointments: monthActive.filter((a) => a.branch_id === b.id).length,
      revenue: revenueByBranch.get(b.id) ?? 0,
    }))
    .map((b, _i, all) => {
      const total = all.reduce((s, x) => s + x.appointments, 0);
      return { ...b, share: total ? Math.round((b.appointments / total) * 100) : 0 };
    })
    .sort((a, b) => b.appointments - a.appointments);

  // ── Clients ─────────────────────────────────────────────────────────
  const returning = new Set(((completedClients.data ?? []) as { client_id: string }[]).map((r) => r.client_id)).size;

  return {
    today,
    kpis: {
      appointments: {
        total: todays.length,
        upcoming: count(todays, "upcoming", "in_service"),
        completed: count(todays, "completed"),
        cancelled: count(todays, "cancelled", "no_show"),
      },
      revenue: { month: monthRevenue, today: todaySales, vsYesterday: pctChange(todaySales, revenueByDay.get(yesterday) ?? 0) },
      clients: { total: customers.count ?? 0, returning, newThisMonth: newCustomers.count ?? 0 },
      staff: { onDuty: onDuty.length, scheduled: scheduled.length, notCheckedIn: scheduled.length - onDuty.length },
      branches: { count: branchRows.length, names: branchRows.map((b) => b.name) },
      services: { total: serviceRows.length, active: activeServices, inactive: serviceRows.length - activeServices },
    },
    revenueChart: week.map((d) => ({ day: d, amount: revenueByDay.get(d) ?? 0 })),
    appointmentMix: {
      period: "This month",
      completed: count(month, "completed"),
      upcoming: count(month, "upcoming", "in_service"),
      cancelled: count(month, "cancelled", "no_show"),
    },
    topServices,
    topStaff,
    branchPerformance,
    activity: activity as ActivityItem[],
    notifications: {
      pendingGcash: pendingGcash.count ?? 0,
      pendingBookings: pendingBookings.count ?? 0,
      newReviews: newReviews.count ?? 0,
      flaggedReviews: flaggedReviews.count ?? 0,
      staffNotCheckedIn: scheduled.length - onDuty.length,
    },
    todayAppointments: todays
      .filter((a) => a.visit_type !== "walk_in")
      .map((a) => ({
        id: a.id,
        time: a.start_time,
        client: one(a.client)?.full_name ?? a.walkin_name ?? "Client",
        clientAvatar: one(a.client)?.avatar_url ?? null,
        service: serviceNames(a).join(", ") || "Appointment",
        staff: one(a.professional)?.full_name ?? (a.notes?.split(" with ")[1]?.split(" — ")[0]?.trim() || "—"),
        branch: one(a.branch)?.name ?? "—",
        price: priceFromNotes(a.notes),
        state: apptState(a),
        confirmed: a.status === "confirmed",
      })),
  };
}
