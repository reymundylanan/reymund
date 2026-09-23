import type { SupabaseClient } from "@supabase/supabase-js";

export type FrontDeskStat = { label: string; value: string; note: string };
export type ScheduleItem = {
  id: string;
  time: string;
  client: string;
  service: string;
  status: string;
};
export type StaffRosterItem = { id: string; name: string; role: string };
export type PaymentVerification = { id: string; title: string; detail: string };

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export async function getFrontDeskStats(
  supabase: SupabaseClient,
  branchId: string
): Promise<FrontDeskStat[]> {
  const [todayCount, yesterdayCount, pending] = await Promise.all([
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("scheduled_date", todayKey()),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("scheduled_date", yesterdayKey()),
    supabase
      .from("payments")
      .select("amount, appointment:appointments!inner(branch_id)")
      .eq("status", "pending")
      .eq("appointment.branch_id", branchId),
  ]);

  const today = todayCount.count ?? 0;
  const yest = yesterdayCount.count ?? 0;
  const trend =
    yest === 0 ? (today > 0 ? "New" : "0%") : `${Math.round(((today - yest) / yest) * 100)}%`;

  const pendingRows = (pending.data as { amount: number }[]) ?? [];
  const pendingTotal = pendingRows.reduce((sum, r) => sum + Number(r.amount), 0);

  return [
    {
      label: "Daily Appointments",
      value: today.toLocaleString(),
      note: `${trend.startsWith("-") || trend === "New" ? trend : `+${trend}`} from yesterday`,
    },
    {
      label: "Pending Payments",
      value: `₱${pendingTotal.toLocaleString()}`,
      note: `${pendingRows.length} unverified`,
    },
  ];
}

type ApptRow = {
  id: string;
  start_time: string;
  status: string;
  notes: string | null;
  client: Rel<{ full_name: string }>;
};

export async function getTodaySchedule(
  supabase: SupabaseClient,
  branchId: string
): Promise<ScheduleItem[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, start_time, status, notes, client:profiles(full_name)")
    .eq("branch_id", branchId)
    .eq("scheduled_date", todayKey())
    .order("start_time", { ascending: true });

  if (error) console.error("getTodaySchedule failed:", error);

  return ((data as unknown as ApptRow[]) ?? []).map((row) => ({
    id: row.id,
    time: formatTime(row.start_time),
    client: one(row.client)?.full_name ?? "Unknown",
    service: row.notes ?? "Appointment",
    status: row.status,
  }));
}

export async function getStaffRoster(
  supabase: SupabaseClient,
  branchId: string
): Promise<StaffRosterItem[]> {
  const { data, error } = await supabase
    .from("staff_members")
    .select("id, full_name, department")
    .eq("branch_id", branchId)
    .order("full_name");

  if (error) console.error("getStaffRoster failed:", error);

  return ((data as { id: string; full_name: string; department: string }[]) ?? []).map((r) => ({
    id: r.id,
    name: r.full_name,
    role: r.department,
  }));
}

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  reference_no: string | null;
  appointment: Rel<{ start_time: string; client: Rel<{ full_name: string }> }>;
};

export async function getPaymentVerifications(
  supabase: SupabaseClient,
  branchId: string
): Promise<PaymentVerification[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, amount, method, reference_no, appointment:appointments!inner(branch_id, start_time, client:profiles(full_name))"
    )
    .eq("status", "pending")
    .eq("appointment.branch_id", branchId)
    .order("created_at", { ascending: false });

  if (error) console.error("getPaymentVerifications failed:", error);

  return ((data as unknown as PaymentRow[]) ?? []).map((row) => {
    const appt = one(row.appointment);
    const clientName = appt ? one(appt.client)?.full_name ?? "Unknown" : "Unknown";
    const time = appt ? formatTime(appt.start_time) : "";
    return {
      id: row.id,
      title: `Payment Pending — ₱${Number(row.amount).toLocaleString()}`,
      detail: `${clientName}${time ? ` (${time})` : ""} via ${row.method}${
        row.reference_no ? ` — Ref: ${row.reference_no}` : ""
      }`,
    };
  });
}
