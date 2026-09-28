import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduleBlock = {
  id: string;
  professional_id: string;
  start_time: string;
  duration_minutes: number;
  label: string;
  subLabel: string;
  isWalkIn: boolean;
  sessionStatus: string | null;
  serviceStartedAt: string | null;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function getAppointmentBlocksForDate(
  supabase: SupabaseClient,
  branchId: string,
  dateKey: string
): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, professional_id, start_time, duration_minutes, walkin_name, client_id, notes, session_status, service_started_at, service:branch_services(name), client:profiles!appointments_client_id_fkey(full_name)"
    )
    .eq("branch_id", branchId)
    .eq("scheduled_date", dateKey)
    .neq("status", "cancelled")
    .not("professional_id", "is", null)
    .or("session_status.is.null,session_status.neq.no_show");

  if (error) {
    console.error("getAppointmentBlocksForDate failed:", error);
    return [];
  }

  return ((data as unknown as {
    id: string;
    professional_id: string;
    start_time: string;
    duration_minutes: number;
    walkin_name: string | null;
    client_id: string | null;
    notes: string | null;
    session_status: string | null;
    service_started_at: string | null;
    service: Rel<{ name: string }>;
    client: Rel<{ full_name: string }>;
  }[]) ?? []).map((row) => ({
    id: row.id,
    professional_id: row.professional_id,
    start_time: row.start_time,
    duration_minutes: row.duration_minutes,
    label: one(row.service)?.name ?? row.notes ?? "Appointment",
    subLabel: one(row.client)?.full_name ?? row.walkin_name ?? "Client",
    isWalkIn: !row.client_id,
    sessionStatus: row.session_status,
    serviceStartedAt: row.service_started_at,
  }));
}
