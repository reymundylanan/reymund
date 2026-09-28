import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportFilters = {
  branchId: string | null;
  staffId: string | null;
  serviceId: string | null;
  status: string; // "all" | "confirmed" | "pending" | "cancelled"
  startDate: string;
  endDate: string;
};

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function prevRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  return { prevStart: toKey(prevStart), prevEnd: toKey(prevEnd) };
}

type ApptRow = {
  id: string;
  branch_id: string;
  scheduled_date: string;
  status: string;
  client_id: string | null;
  walkin_name: string | null;
  professional_id: string | null;
  service_id: string | null;
  notes: string | null;
};

async function fetchAppointments(supabase: SupabaseClient, filters: ReportFilters): Promise<ApptRow[]> {
  let query = supabase
    .from("appointments")
    .select("id, branch_id, scheduled_date, status, client_id, walkin_name, professional_id, service_id, notes")
    .gte("scheduled_date", filters.startDate)
    .lte("scheduled_date", filters.endDate);
  query = filters.status === "all" ? query.neq("status", "cancelled") : query.eq("status", filters.status);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.staffId) query = query.eq("professional_id", filters.staffId);
  if (filters.serviceId) query = query.eq("service_id", filters.serviceId);
  const { data, error } = await query;
  if (error) {
    console.error("fetchAppointments failed:", error);
    return [];
  }
  return (data as ApptRow[]) ?? [];
}

type PaymentRow = { amount: number; method: string; status: string; appointment_id: string };

async function fetchPayments(supabase: SupabaseClient, filters: ReportFilters): Promise<PaymentRow[]> {
  let query = supabase
    .from("payments")
    .select(
      "amount, method, status, appointment_id, appointment:appointments!inner(branch_id, scheduled_date, professional_id, service_id)"
    )
    .eq("status", "settled")
    .gte("appointment.scheduled_date", filters.startDate)
    .lte("appointment.scheduled_date", filters.endDate);
  if (filters.branchId) query = query.eq("appointment.branch_id", filters.branchId);
  if (filters.staffId) query = query.eq("appointment.professional_id", filters.staffId);
  if (filters.serviceId) query = query.eq("appointment.service_id", filters.serviceId);
  const { data, error } = await query;
  if (error) {
    console.error("fetchPayments failed:", error);
    return [];
  }
  return (data as unknown as PaymentRow[]) ?? [];
}

export type ReportsSummary = {
  totalRevenue: number;
  revenueTrendPct: number;
  totalAppointments: number;
  appointmentsTrendPct: number;
  walkIns: number;
  walkInsTrendPct: number;
  totalClients: number;
  clientsTrendPct: number;
};

export async function getReportsSummary(supabase: SupabaseClient, filters: ReportFilters): Promise<ReportsSummary> {
  const { prevStart, prevEnd } = prevRange(filters.startDate, filters.endDate);
  const prevFilters: ReportFilters = { ...filters, startDate: prevStart, endDate: prevEnd };

  const [appts, prevAppts, payments, prevPayments, clientCount, prevClientCount] = await Promise.all([
    fetchAppointments(supabase, filters),
    fetchAppointments(supabase, prevFilters),
    fetchPayments(supabase, filters),
    fetchPayments(supabase, prevFilters),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "customer")
      .lte("created_at", `${prevEnd}T23:59:59`),
  ]);

  const revenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const prevRevenue = prevPayments.reduce((sum, p) => sum + p.amount, 0);
  const walkIns = appts.filter((a) => !!a.walkin_name).length;
  const prevWalkIns = prevAppts.filter((a) => !!a.walkin_name).length;

  return {
    totalRevenue: revenue,
    revenueTrendPct: pctChange(revenue, prevRevenue),
    totalAppointments: appts.length,
    appointmentsTrendPct: pctChange(appts.length, prevAppts.length),
    walkIns,
    walkInsTrendPct: pctChange(walkIns, prevWalkIns),
    totalClients: clientCount.count ?? 0,
    clientsTrendPct: pctChange(clientCount.count ?? 0, prevClientCount.count ?? 0),
  };
}

export type SeriesPoint = { label: string; value: number };

export async function getRevenueOverview(supabase: SupabaseClient, filters: ReportFilters): Promise<SeriesPoint[]> {
  const payments = await fetchPayments(supabase, filters);
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("id, scheduled_date")
    .gte("scheduled_date", filters.startDate)
    .lte("scheduled_date", filters.endDate);
  const apptDates = new Map(
    ((apptRows as { id: string; scheduled_date: string }[]) ?? []).map((row) => [row.id, row.scheduled_date])
  );
  const byDate = new Map<string, number>();
  for (const p of payments) {
    const date = apptDates.get(p.appointment_id);
    if (!date) continue;
    byDate.set(date, (byDate.get(date) ?? 0) + p.amount);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value,
    }));
}

export type BookingTrendPoint = { label: string; appointments: number; walkIns: number };

export async function getBookingTrends(
  supabase: SupabaseClient,
  filters: ReportFilters
): Promise<BookingTrendPoint[]> {
  const appts = await fetchAppointments(supabase, filters);
  const byDate = new Map<string, { appointments: number; walkIns: number }>();
  for (const a of appts) {
    const entry = byDate.get(a.scheduled_date) ?? { appointments: 0, walkIns: 0 };
    if (a.walkin_name) entry.walkIns += 1;
    else entry.appointments += 1;
    byDate.set(a.scheduled_date, entry);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
      ...v,
    }));
}

export type BranchPerformance = {
  branchId: string;
  branchName: string;
  revenue: number;
  appointments: number;
  walkIns: number;
};

export async function getBranchPerformance(
  supabase: SupabaseClient,
  filters: ReportFilters
): Promise<BranchPerformance[]> {
  const branchless: ReportFilters = { ...filters, branchId: null };
  const [{ data: branches }, appts, payments] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    fetchAppointments(supabase, branchless),
    fetchPayments(supabase, branchless),
  ]);

  const apptBranchMap = new Map(appts.map((a) => [a.id, a.branch_id]));
  const revenueByBranch = new Map<string, number>();
  for (const p of payments) {
    const branchId = apptBranchMap.get(p.appointment_id);
    if (!branchId) continue;
    revenueByBranch.set(branchId, (revenueByBranch.get(branchId) ?? 0) + p.amount);
  }

  return ((branches as { id: string; name: string }[]) ?? []).map((b) => {
    const branchAppts = appts.filter((a) => a.branch_id === b.id);
    return {
      branchId: b.id,
      branchName: b.name,
      revenue: revenueByBranch.get(b.id) ?? 0,
      appointments: branchAppts.filter((a) => !a.walkin_name).length,
      walkIns: branchAppts.filter((a) => !!a.walkin_name).length,
    };
  });
}

export type SalesPayments = {
  totalSales: number;
  byMethod: { method: string; amount: number; pct: number }[];
  paid: number;
  unpaidCount: number;
  transactions: number;
};

export async function getSalesPayments(supabase: SupabaseClient, filters: ReportFilters): Promise<SalesPayments> {
  const [payments, appts] = await Promise.all([fetchPayments(supabase, filters), fetchAppointments(supabase, filters)]);

  const totalSales = payments.reduce((sum, p) => sum + p.amount, 0);
  const byMethodMap = new Map<string, number>();
  for (const p of payments) {
    byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + p.amount);
  }
  const byMethod = Array.from(byMethodMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([method, amount]) => ({
      method,
      amount,
      pct: totalSales > 0 ? Math.round((amount / totalSales) * 1000) / 10 : 0,
    }));

  const paidAppointmentIds = new Set(payments.map((p) => p.appointment_id));
  const unpaidCount = appts.filter((a) => a.status !== "cancelled" && !paidAppointmentIds.has(a.id)).length;

  return { totalSales, byMethod, paid: totalSales, unpaidCount, transactions: payments.length };
}

export type TopService = { name: string; bookings: number; revenue: number };

export async function getTopServices(supabase: SupabaseClient, filters: ReportFilters): Promise<TopService[]> {
  const appts = await fetchAppointments(supabase, filters);
  const serviceIds = Array.from(new Set(appts.map((a) => a.service_id).filter((id): id is string => !!id)));
  const { data: services } = serviceIds.length
    ? await supabase.from("branch_services").select("id, name, price").in("id", serviceIds)
    : { data: [] };
  const serviceById = new Map(((services as { id: string; name: string; price: number }[]) ?? []).map((s) => [s.id, s]));

  const byName = new Map<string, { bookings: number; revenue: number }>();
  for (const a of appts) {
    const service = a.service_id ? serviceById.get(a.service_id) : null;
    const name = service?.name ?? a.notes?.split(" with ")[0]?.split(",")[0]?.trim();
    if (!name) continue;
    const entry = byName.get(name) ?? { bookings: 0, revenue: 0 };
    entry.bookings += 1;
    entry.revenue += service?.price ?? 0;
    byName.set(name, entry);
  }
  return Array.from(byName.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 5);
}

export type TopStaffRow = { id: string; name: string; department: string | null; completed: number };

export async function getTopStaff(supabase: SupabaseClient, filters: ReportFilters): Promise<TopStaffRow[]> {
  let query = supabase
    .from("appointments")
    .select("professional_id")
    .eq("session_status", "completed")
    .gte("scheduled_date", filters.startDate)
    .lte("scheduled_date", filters.endDate)
    .not("professional_id", "is", null);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.staffId) query = query.eq("professional_id", filters.staffId);
  if (filters.serviceId) query = query.eq("service_id", filters.serviceId);
  const { data: completedRows } = await query;

  const countByStaff = new Map<string, number>();
  for (const row of (completedRows as { professional_id: string }[]) ?? []) {
    countByStaff.set(row.professional_id, (countByStaff.get(row.professional_id) ?? 0) + 1);
  }

  const ids = Array.from(countByStaff.keys());
  if (ids.length === 0) return [];
  const { data: staffRows } = await supabase.from("staff_members").select("id, full_name, department").in("id", ids);

  return ((staffRows as { id: string; full_name: string; department: string | null }[]) ?? [])
    .map((s) => ({ id: s.id, name: s.full_name, department: s.department, completed: countByStaff.get(s.id) ?? 0 }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 5);
}

export type ClientAnalytics = {
  topSpenders: { name: string; amount: number }[];
  growth: SeriesPoint[];
};

export async function getClientAnalytics(supabase: SupabaseClient, filters: ReportFilters): Promise<ClientAnalytics> {
  const payments = await fetchPayments(supabase, filters);
  const { data: apptRows } = await supabase
    .from("appointments")
    .select("id, client_id")
    .gte("scheduled_date", filters.startDate)
    .lte("scheduled_date", filters.endDate);
  const clientByAppt = new Map(
    ((apptRows as { id: string; client_id: string | null }[]) ?? []).map((a) => [a.id, a.client_id])
  );

  const spendByClient = new Map<string, number>();
  for (const p of payments) {
    const clientId = clientByAppt.get(p.appointment_id);
    if (!clientId) continue;
    spendByClient.set(clientId, (spendByClient.get(clientId) ?? 0) + p.amount);
  }
  const clientIds = Array.from(spendByClient.keys());
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", clientIds)
    : { data: [] };
  const nameById = new Map(((clientProfiles as { id: string; full_name: string }[]) ?? []).map((c) => [c.id, c.full_name]));

  const topSpenders = Array.from(spendByClient.entries())
    .map(([id, amount]) => ({ name: nameById.get(id) ?? "Unknown", amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const { data: newClients } = await supabase
    .from("profiles")
    .select("created_at")
    .eq("role", "customer")
    .gte("created_at", `${filters.startDate}T00:00:00`)
    .lte("created_at", `${filters.endDate}T23:59:59`);
  const growthByDate = new Map<string, number>();
  for (const row of (newClients as { created_at: string }[]) ?? []) {
    const key = row.created_at.slice(0, 10);
    growthByDate.set(key, (growthByDate.get(key) ?? 0) + 1);
  }
  const growth = Array.from(growthByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value,
    }));

  return { topSpenders, growth };
}

export type ReviewsSummary = {
  average: number;
  count: number;
  breakdown: { stars: number; count: number }[];
  recent: { clientName: string; rating: number; text: string | null; date: string }[];
};

export async function getReviewsSummary(supabase: SupabaseClient, branchId: string | null): Promise<ReviewsSummary> {
  let query = supabase
    .from("reviews")
    .select("rating, text, created_at, client:profiles(full_name)")
    .order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data } = await query;
  const rows =
    (data as unknown as {
      rating: number;
      text: string | null;
      created_at: string;
      client: { full_name: string } | { full_name: string }[] | null;
    }[]) ?? [];

  const breakdownMap = new Map<number, number>([5, 4, 3, 2, 1].map((s) => [s, 0]));
  let total = 0;
  for (const r of rows) {
    breakdownMap.set(r.rating, (breakdownMap.get(r.rating) ?? 0) + 1);
    total += r.rating;
  }

  return {
    average: rows.length > 0 ? Math.round((total / rows.length) * 10) / 10 : 0,
    count: rows.length,
    breakdown: Array.from(breakdownMap.entries()).map(([stars, count]) => ({ stars, count })),
    recent: rows.slice(0, 5).map((r) => {
      const client = Array.isArray(r.client) ? r.client[0] : r.client;
      return {
        clientName: client?.full_name ?? "Anonymous",
        rating: r.rating,
        text: r.text,
        date: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      };
    }),
  };
}

export type AttendanceSummary = {
  present: number;
  onLeave: number;
  dayOff: number;
  schedule: { name: string; department: string | null; status: "present" | "on_leave" | "day_off" }[];
};

export async function getAttendanceToday(
  supabase: SupabaseClient,
  branchId: string | null
): Promise<AttendanceSummary> {
  const todayKey = new Date().toISOString().slice(0, 10);
  let staffQuery = supabase.from("staff_members").select("id, full_name, department");
  if (branchId) staffQuery = staffQuery.eq("branch_id", branchId);
  let offQuery = supabase.from("staff_shifts").select("staff_member_id, source").eq("shift_date", todayKey);
  if (branchId) offQuery = offQuery.eq("branch_id", branchId);

  const [{ data: staffRows }, { data: offRows }] = await Promise.all([staffQuery, offQuery]);
  const offMap = new Map(
    ((offRows as { staff_member_id: string; source: string }[]) ?? []).map((r) => [r.staff_member_id, r.source])
  );

  const schedule = ((staffRows as { id: string; full_name: string; department: string | null }[]) ?? []).map((s) => {
    const off = offMap.get(s.id);
    const status: "present" | "on_leave" | "day_off" = !off ? "present" : off === "leave" ? "on_leave" : "day_off";
    return { name: s.full_name, department: s.department, status };
  });

  return {
    present: schedule.filter((s) => s.status === "present").length,
    onLeave: schedule.filter((s) => s.status === "on_leave").length,
    dayOff: schedule.filter((s) => s.status === "day_off").length,
    schedule,
  };
}
