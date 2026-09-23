import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminStat = {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  note: string;
};

export type BookingTrendPoint = { day: string; value: number };
export type RevenueByBranchItem = { branch: string; value: number };
export type ActivityItem = { id: string; text: string; time: string };
export type PendingBookingAlert = { id: string; text: string; tag: string };

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function monthBounds(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function trendFrom(current: number, previous: number): { trend: string; trendUp: boolean } {
  if (previous === 0) {
    return current > 0 ? { trend: "New", trendUp: true } : { trend: "0%", trendUp: true };
  }
  const pct = ((current - previous) / previous) * 100;
  return {
    trend: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    trendUp: pct >= 0,
  };
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `₱${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `₱${(amount / 1_000).toFixed(1)}K`;
  return `₱${amount.toLocaleString()}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function getAdminStats(supabase: SupabaseClient): Promise<AdminStat[]> {
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(1);

  const [
    bookingsThis,
    bookingsLast,
    revenueThis,
    revenueLast,
    pendingThis,
    pendingLast,
    promosActive,
    promosThis,
    promosLast,
  ] = await Promise.all([
    supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", thisMonth.start).lt("created_at", thisMonth.end),
    supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", lastMonth.start).lt("created_at", lastMonth.end),
    supabase.from("payments").select("amount").eq("status", "settled").gte("created_at", thisMonth.start).lt("created_at", thisMonth.end),
    supabase.from("payments").select("amount").eq("status", "settled").gte("created_at", lastMonth.start).lt("created_at", lastMonth.end),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").gte("created_at", thisMonth.start).lt("created_at", thisMonth.end),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").gte("created_at", lastMonth.start).lt("created_at", lastMonth.end),
    supabase.from("branch_promotions").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("branch_promotions").select("id", { count: "exact", head: true }).gte("created_at", thisMonth.start).lt("created_at", thisMonth.end),
    supabase.from("branch_promotions").select("id", { count: "exact", head: true }).gte("created_at", lastMonth.start).lt("created_at", lastMonth.end),
  ]);

  const revenueThisTotal = (revenueThis.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const revenueLastTotal = (revenueLast.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

  const bookingsTrend = trendFrom(bookingsThis.count ?? 0, bookingsLast.count ?? 0);
  const revenueTrend = trendFrom(revenueThisTotal, revenueLastTotal);
  const pendingTrend = trendFrom(pendingThis.count ?? 0, pendingLast.count ?? 0);
  const promosDelta = (promosThis.count ?? 0) - (promosLast.count ?? 0);

  return [
    {
      label: "Total Bookings",
      value: (bookingsThis.count ?? 0).toLocaleString(),
      ...bookingsTrend,
      note: "vs last month",
    },
    {
      label: "Monthly Revenue",
      value: formatCurrency(revenueThisTotal),
      ...revenueTrend,
      note: "vs last month",
    },
    {
      label: "Pending Payments",
      value: (pendingThis.count ?? 0).toLocaleString(),
      trend: pendingTrend.trend,
      trendUp: !pendingTrend.trendUp,
      note: "vs last month",
    },
    {
      label: "Active Promotions",
      value: (promosActive.count ?? 0).toLocaleString(),
      trend: `${promosDelta >= 0 ? "+" : ""}${promosDelta}`,
      trendUp: promosDelta >= 0,
      note: "vs last month",
    },
  ];
}

export async function getBookingTrends(supabase: SupabaseClient): Promise<BookingTrendPoint[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);

  const { data, error } = await supabase
    .from("appointments")
    .select("scheduled_date")
    .gte("scheduled_date", start.toISOString().slice(0, 10))
    .lte("scheduled_date", today.toISOString().slice(0, 10));

  if (error) console.error("getBookingTrends failed:", error);

  const counts = new Map<string, number>();
  for (const row of (data as { scheduled_date: string }[]) ?? []) {
    counts.set(row.scheduled_date, (counts.get(row.scheduled_date) ?? 0) + 1);
  }

  const points: BookingTrendPoint[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`;
    points.push({ day: label, value: counts.get(key) ?? 0 });
  }
  return points;
}

export async function getRevenueByBranch(supabase: SupabaseClient): Promise<RevenueByBranchItem[]> {
  const thisMonth = monthBounds(0);

  const { data, error } = await supabase
    .from("payments")
    .select("amount, appointment:appointments(branch:branches(name))")
    .eq("status", "settled")
    .gte("created_at", thisMonth.start)
    .lt("created_at", thisMonth.end);

  if (error) console.error("getRevenueByBranch failed:", error);

  type Row = {
    amount: number;
    appointment: Rel<{ branch: Rel<{ name: string }> }>;
  };

  const totals = new Map<string, number>();
  for (const row of (data as unknown as Row[]) ?? []) {
    const branchName = one(one(row.appointment)?.branch ?? null)?.name;
    if (!branchName) continue;
    totals.set(branchName, (totals.get(branchName) ?? 0) + Number(row.amount));
  }

  const max = Math.max(1, ...totals.values());
  return Array.from(totals.entries())
    .map(([branch, amount]) => ({ branch, value: Math.round((amount / max) * 100) }))
    .sort((a, b) => b.value - a.value);
}

export async function getRecentActivity(supabase: SupabaseClient): Promise<ActivityItem[]> {
  const [{ data: appts, error: apptsError }, { data: pays, error: paysError }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, notes, status, created_at, branch:branches(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("payments")
      .select("id, amount, method, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (apptsError) console.error("getRecentActivity (appointments) failed:", apptsError);
  if (paysError) console.error("getRecentActivity (payments) failed:", paysError);

  type ApptRow = {
    id: string;
    notes: string | null;
    status: string;
    created_at: string;
    branch: Rel<{ name: string }>;
  };
  type PayRow = {
    id: string;
    amount: number;
    method: string;
    status: string;
    created_at: string;
  };

  const items: (ActivityItem & { at: string })[] = [];

  for (const a of (appts as unknown as ApptRow[]) ?? []) {
    const branchName = one(a.branch)?.name;
    items.push({
      id: `appt-${a.id}`,
      text: `New booking${branchName ? ` at ${branchName}` : ""}${a.notes ? `: ${a.notes}` : ""}`,
      time: timeAgo(a.created_at),
      at: a.created_at,
    });
  }

  for (const p of (pays as unknown as PayRow[]) ?? []) {
    items.push({
      id: `pay-${p.id}`,
      text: `Payment ${p.status === "settled" ? "received" : p.status} — ₱${Number(p.amount).toLocaleString()} via ${p.method}`,
      time: timeAgo(p.created_at),
      at: p.created_at,
    });
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8)
    .map(({ id, text, time }) => ({ id, text, time }));
}

export async function getPendingBookingAlerts(
  supabase: SupabaseClient
): Promise<PendingBookingAlert[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("appointments")
    .select("id, notes, scheduled_date, start_time, branch:branches(name)")
    .eq("status", "pending")
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(5);

  if (error) console.error("getPendingBookingAlerts failed:", error);

  type Row = {
    id: string;
    notes: string | null;
    scheduled_date: string;
    start_time: string;
    branch: Rel<{ name: string }>;
  };

  return ((data as unknown as Row[]) ?? []).map((row) => {
    const branchName = one(row.branch)?.name ?? "Unknown branch";
    return {
      id: row.id,
      text: `${branchName}: ${row.notes ?? "Booking"} awaiting confirmation (${new Date(
        row.scheduled_date
      ).toLocaleDateString()})`,
      tag: "Pending Confirmation",
    };
  });
}
