import type { SupabaseClient } from "@supabase/supabase-js";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

const ACTIVE_STATUSES = ["pending", "confirmed"];
const BLOCKING_ATTENDANCE_STATUSES = ["out", "on_break", "in_service"];

export type BookedSlot = {
  id: string;
  professional_id: string | null;
  start_time: string;
  duration_minutes: number;
};

/** Every active (non-cancelled) appointment for one professional across a date range — fetch once, then check overlaps locally per candidate slot. */
export async function getProfessionalAppointmentsForRange(
  supabase: SupabaseClient,
  professionalId: string,
  startDateKey: string,
  endDateKey: string
): Promise<Record<string, BookedSlot[]>> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, professional_id, scheduled_date, start_time, duration_minutes")
    .eq("professional_id", professionalId)
    .gte("scheduled_date", startDateKey)
    .lte("scheduled_date", endDateKey)
    .in("status", ACTIVE_STATUSES)
    .or("session_status.is.null,session_status.neq.no_show");

  if (error) {
    console.error("getProfessionalAppointmentsForRange failed:", error);
    return {};
  }

  const byDate: Record<string, BookedSlot[]> = {};
  for (const row of (data ?? []) as (BookedSlot & { scheduled_date: string })[]) {
    byDate[row.scheduled_date] = byDate[row.scheduled_date] ?? [];
    byDate[row.scheduled_date].push(row);
  }
  return byDate;
}

export function isSlotFree(
  bookedOnDate: BookedSlot[] | undefined,
  startTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string
): boolean {
  if (!bookedOnDate || bookedOnDate.length === 0) return true;
  const newStart = toMinutes(startTime);
  const newEnd = newStart + durationMinutes;
  return !bookedOnDate.some((row) => {
    if (excludeAppointmentId && row.id === excludeAppointmentId) return false;
    const start = toMinutes(row.start_time);
    return overlaps(newStart, newEnd, start, start + row.duration_minutes);
  });
}

/** Real-time recheck against the live DB right before writing a new appointment — catches races the client-side cache above can miss. */
export async function isProfessionalFreeNow(
  supabase: SupabaseClient,
  params: {
    professionalId: string;
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    excludeAppointmentId?: string;
  }
): Promise<boolean> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, start_time, duration_minutes")
    .eq("professional_id", params.professionalId)
    .eq("scheduled_date", params.scheduledDate)
    .in("status", ACTIVE_STATUSES)
    .or("session_status.is.null,session_status.neq.no_show");

  if (error) {
    console.error("isProfessionalFreeNow failed:", error);
    return false;
  }

  if (
    !isSlotFree(data as BookedSlot[], params.startTime, params.durationMinutes, params.excludeAppointmentId)
  ) {
    return false;
  }

  const { data: attendance } = await supabase
    .from("staff_attendance")
    .select("status")
    .eq("staff_member_id", params.professionalId)
    .eq("attendance_date", params.scheduledDate)
    .maybeSingle();
  if (attendance && BLOCKING_ATTENDANCE_STATUSES.includes(attendance.status)) return false;

  return true;
}

/** Which professionals (out of a candidate list) are busy for one specific branch-wide date+time+duration window — used by Walk-ins to filter the therapist picker for "right now". Also excludes anyone currently Out, On Break, or In Service per their live attendance status. */
export async function getBusyProfessionalIds(
  supabase: SupabaseClient,
  params: { branchId: string; scheduledDate: string; startTime: string; durationMinutes: number }
): Promise<Set<string>> {
  const [{ data, error }, { data: attendanceRows }] = await Promise.all([
    supabase
      .from("appointments")
      .select("professional_id, start_time, duration_minutes")
      .eq("branch_id", params.branchId)
      .eq("scheduled_date", params.scheduledDate)
      .not("professional_id", "is", null)
      .in("status", ACTIVE_STATUSES)
      .or("session_status.is.null,session_status.neq.no_show"),
    supabase
      .from("staff_attendance")
      .select("staff_member_id, status")
      .eq("branch_id", params.branchId)
      .eq("attendance_date", params.scheduledDate)
      .in("status", BLOCKING_ATTENDANCE_STATUSES),
  ]);

  if (error) {
    console.error("getBusyProfessionalIds failed:", error);
    return new Set();
  }

  const newStart = toMinutes(params.startTime);
  const newEnd = newStart + params.durationMinutes;
  const busy = new Set<string>();
  for (const row of (data ?? []) as { professional_id: string; start_time: string; duration_minutes: number }[]) {
    const start = toMinutes(row.start_time);
    if (overlaps(newStart, newEnd, start, start + row.duration_minutes)) {
      busy.add(row.professional_id);
    }
  }
  for (const row of (attendanceRows ?? []) as { staff_member_id: string; status: string }[]) {
    busy.add(row.staff_member_id);
  }
  return busy;
}
