import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { getStaffShiftsForDate, toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getAttendanceForDate } from "@/lib/supabase/queries/staffAttendance";
import { getGracePeriodMinutes } from "@/lib/supabase/queries/spaSettings";
import { parseService } from "@/components/frontdesk/appointments/utils";
import { priceFromNotes, type OpsInput, type OpsVisit } from "@/lib/frontdeskOps";

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type VisitRow = {
  id: string;
  visit_type?: string | null;
  client_id: string | null;
  walkin_name: string | null;
  walkin_phone: string | null;
  start_time: string;
  duration_minutes: number | null;
  status: string;
  session_status: string | null;
  arrival_time: string | null;
  service_started_at: string | null;
  professional_id: string | null;
  notes: string | null;
  client: Rel<{ full_name: string | null; avatar_url: string | null }>;
  professional: Rel<{ full_name: string | null }>;
  service: Rel<{ name: string | null; price: number | null }>;
  appointment_services: { service_name: string; position: number }[] | null;
};

const VISIT_COLUMNS =
  "id, client_id, walkin_name, walkin_phone, start_time, duration_minutes, status, session_status, arrival_time, service_started_at, professional_id, notes, client:profiles!appointments_client_id_fkey(full_name, avatar_url), professional:staff_members(full_name), service:branch_services(name, price)";

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  created_at: string;
  appointment: Rel<{ walkin_name: string | null; client: Rel<{ full_name: string | null }> }>;
};

function toVisit(r: VisitRow): OpsVisit {
  const parsed = parseService(r.notes);
  const services = [...(r.appointment_services ?? [])].sort((a, b) => a.position - b.position).map((s) => s.service_name);
  const visitType: OpsVisit["visitType"] =
    r.visit_type === "walk_in" || (r.visit_type == null && r.client_id == null) ? "walk_in" : "appointment";
  return {
    id: r.id,
    visitType,
    clientId: r.client_id,
    clientName: one(r.client)?.full_name?.trim() || r.walkin_name?.trim() || "Walk-in guest",
    clientAvatar: one(r.client)?.avatar_url ?? null,
    walkinPhone: r.walkin_phone,
    startTime: r.start_time,
    durationMinutes: r.duration_minutes ?? 60,
    status: r.status,
    sessionStatus: r.session_status,
    arrivalTime: r.arrival_time,
    serviceStartedAt: r.service_started_at,
    professionalId: r.professional_id,
    professionalName: one(r.professional)?.full_name ?? (parsed.specialist !== "—" ? parsed.specialist : ""),
    serviceName: services.join(", ") || one(r.service)?.name || (parsed.service !== "—" ? parsed.service : "Appointment"),
    price: priceFromNotes(r.notes) ?? one(r.service)?.price ?? null,
  };
}

async function loadVisits(supabase: SupabaseClient, branchId: string, todayKey: string): Promise<OpsVisit[]> {
  const base = (columns: string) =>
    supabase.from("appointments").select(columns).eq("branch_id", branchId).eq("scheduled_date", todayKey).order("start_time");
  let res = await base(`${VISIT_COLUMNS}, visit_type, appointment_services(service_name, position)`);
  if (res.error && isNotMigratedError(res.error)) res = await base(VISIT_COLUMNS);
  if (res.error) {
    logQueryError("frontdeskOps visits", res.error);
    return [];
  }
  return ((res.data ?? []) as unknown as VisitRow[]).map(toVisit);
}

async function loadReturning(supabase: SupabaseClient, branchId: string, todayKey: string, visits: OpsVisit[]) {
  const clientIds = [...new Set(visits.map((v) => v.clientId).filter((id): id is string => !!id))];
  const phones = [...new Set(visits.filter((v) => !v.clientId && v.walkinPhone).map((v) => v.walkinPhone as string))];
  const [byClient, byPhone] = await Promise.all([
    clientIds.length
      ? supabase.from("appointments").select("client_id").in("client_id", clientIds).lt("scheduled_date", todayKey).neq("status", "cancelled").limit(1000)
      : Promise.resolve({ data: [], error: null }),
    phones.length
      ? supabase.from("appointments").select("walkin_phone").eq("branch_id", branchId).in("walkin_phone", phones).lt("scheduled_date", todayKey).limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  logQueryError("frontdeskOps returning clients", byClient.error);
  logQueryError("frontdeskOps returning phones", byPhone.error);
  return {
    returningClientIds: new Set(((byClient.data ?? []) as { client_id: string }[]).map((r) => r.client_id)),
    returningPhones: new Set(
      ((byPhone.data ?? []) as { walkin_phone: string | null }[]).map((r) => (r.walkin_phone ?? "").replace(/\D/g, "").slice(-10)).filter(Boolean)
    ),
  };
}

export async function loadFrontDeskOps(supabase: SupabaseClient, branchId: string, today = new Date()): Promise<OpsInput> {
  const todayKey = toDateKey(today);
  const [visits, staffRes, offRecords, attendance, paymentsRes, graceMinutes] = await Promise.all([
    loadVisits(supabase, branchId, todayKey),
    supabase.from("staff_members").select("id, full_name, department, avatar_url").eq("branch_id", branchId).order("full_name"),
    getStaffShiftsForDate(supabase, branchId, todayKey),
    getAttendanceForDate(supabase, branchId, todayKey),
    supabase
      .from("payments")
      .select("id, amount, method, created_at, appointment:appointments!inner(branch_id, walkin_name, client:profiles!appointments_client_id_fkey(full_name))")
      .eq("status", "pending")
      .eq("appointment.branch_id", branchId)
      .order("created_at", { ascending: false }),
    getGracePeriodMinutes(supabase),
  ]);
  logQueryError("frontdeskOps staff", staffRes.error);
  logQueryError("frontdeskOps payments", paymentsRes.error);

  const returning = await loadReturning(supabase, branchId, todayKey, visits);

  return {
    visits,
    staff: ((staffRes.data ?? []) as { id: string; full_name: string; department: string | null; avatar_url: string | null }[]).map((s) => ({
      id: s.id,
      name: s.full_name,
      department: s.department,
      avatarUrl: s.avatar_url,
    })),
    offStaffIds: new Set(offRecords.map((r) => r.staff_member_id)),
    attendance: attendance.map((a) => ({ staffId: a.staff_member_id, status: a.status, timeIn: a.time_in, timeOut: a.time_out })),
    pendingPayments: ((paymentsRes.data ?? []) as unknown as PaymentRow[]).map((p) => {
      const appt = one(p.appointment);
      return {
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        createdAt: p.created_at,
        clientName: (appt && (one(appt.client)?.full_name || appt.walkin_name)) || "Client",
      };
    }),
    graceMinutes,
    ...returning,
  };
}
