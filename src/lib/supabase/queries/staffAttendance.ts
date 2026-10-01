import type { SupabaseClient } from "@supabase/supabase-js";

export type AttendanceStatus = "scheduled" | "available" | "in_service" | "on_break" | "out";

export type AttendanceRow = {
  id: string;
  staff_member_id: string;
  branch_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  shift_start: string;
  shift_end: string;
  time_in: string | null;
  time_out: string | null;
  updated_at: string;
};

export type AttendanceBreak = {
  id: string;
  attendance_id: string;
  break_start: string;
  break_end: string | null;
};

const SELECT_FIELDS =
  "id, staff_member_id, branch_id, attendance_date, status, shift_start, shift_end, time_in, time_out, updated_at";

export async function getAttendanceForDate(
  supabase: SupabaseClient,
  branchId: string,
  dateKey: string
): Promise<AttendanceRow[]> {
  const { data, error } = await supabase
    .from("staff_attendance")
    .select(SELECT_FIELDS)
    .eq("branch_id", branchId)
    .eq("attendance_date", dateKey);

  if (error) {
    console.error("getAttendanceForDate failed:", error);
    return [];
  }
  return (data as AttendanceRow[]) ?? [];
}

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function ensureAttendanceRow(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; dateKey: string }
): Promise<{ row: AttendanceRow | null; error: string | null }> {
  const { data: existing, error: fetchError } = await supabase
    .from("staff_attendance")
    .select(SELECT_FIELDS)
    .eq("staff_member_id", input.staffMemberId)
    .eq("attendance_date", input.dateKey)
    .maybeSingle();

  if (fetchError) return { row: null, error: fetchError.message };
  if (existing) return { row: existing as AttendanceRow, error: null };

  const recordedBy = await currentUserId(supabase);
  const { data: created, error: insertError } = await supabase
    .from("staff_attendance")
    .insert({
      staff_member_id: input.staffMemberId,
      branch_id: input.branchId,
      attendance_date: input.dateKey,
      status: "scheduled",
      recorded_by: recordedBy,
    })
    .select(SELECT_FIELDS)
    .single();

  if (insertError) return { row: null, error: insertError.message };
  return { row: created as AttendanceRow, error: null };
}

export async function punchIn(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; dateKey: string }
): Promise<{ error: string | null }> {
  const { row, error } = await ensureAttendanceRow(supabase, input);
  if (error || !row) return { error: error ?? "Could not load today's attendance record." };
  if (row.status === "in_service" || row.status === "on_break" || row.status === "available") {
    return { error: null };
  }

  const recordedBy = await currentUserId(supabase);
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("staff_attendance")
    .update({ status: "available", time_in: now, recorded_by: recordedBy, updated_at: now })
    .eq("id", row.id);
  return { error: updateError?.message ?? null };
}

export async function punchOut(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; dateKey: string }
): Promise<{ error: string | null }> {
  const { row, error } = await ensureAttendanceRow(supabase, input);
  if (error || !row) return { error: error ?? "Could not load today's attendance record." };
  if (row.status === "in_service") return { error: "Still In Service — cannot punch out while serving a client." };

  const recordedBy = await currentUserId(supabase);
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("staff_attendance")
    .update({ status: "out", time_out: now, recorded_by: recordedBy, updated_at: now })
    .eq("id", row.id);
  return { error: updateError?.message ?? null };
}

const BREAK_LOCKOUT_MINUTES = 15;

export async function startBreak(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; dateKey: string }
): Promise<{ error: string | null }> {
  const { row, error } = await ensureAttendanceRow(supabase, input);
  if (error || !row) return { error: error ?? "Could not load today's attendance record." };
  if (row.status === "in_service") return { error: "Still In Service — cannot start a break while serving a client." };
  if (row.status !== "available") return { error: "Punch in before starting a break." };

  const { data: upcoming } = await supabase
    .from("appointments")
    .select("start_time")
    .eq("professional_id", input.staffMemberId)
    .eq("branch_id", input.branchId)
    .eq("scheduled_date", input.dateKey)
    .neq("status", "cancelled")
    .is("session_status", null);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hasBookingSoon = ((upcoming as { start_time: string }[] | null) ?? []).some((r) => {
    const [h, m] = r.start_time.split(":").map(Number);
    const startMin = h * 60 + m;
    return startMin >= nowMin && startMin - nowMin <= BREAK_LOCKOUT_MINUTES;
  });
  if (hasBookingSoon) {
    return { error: `A booking starts within ${BREAK_LOCKOUT_MINUTES} minutes — cannot start a break now.` };
  }

  // 063: the database checks who may record the break and explains a refusal.
  const { error: rpcError } = await supabase.rpc("start_staff_break", { p_attendance_id: row.id });
  if (!rpcError) return { error: null };
  if (!isMissingFunction(rpcError)) return { error: breakErrorMessage(rpcError.message) };

  const { error: breakError } = await supabase.from("staff_attendance_breaks").insert({ attendance_id: row.id });
  if (breakError) return { error: breakError.message };

  const recordedBy = await currentUserId(supabase);
  const { error: updateError } = await supabase
    .from("staff_attendance")
    .update({ status: "on_break", recorded_by: recordedBy, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return { error: updateError?.message ?? null };
}

/** Before migration 063 the break functions don't exist yet. */
function isMissingFunction(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883";
}

/** "BREAK_FORBIDDEN: reason" → "Not allowed: reason." */
export function breakErrorMessage(message: string): string {
  const forbidden = message.split("BREAK_FORBIDDEN:")[1]?.trim();
  if (forbidden) return `Not allowed: ${forbidden}.`;
  const invalid = message.split("BREAK_INVALID:")[1]?.trim();
  if (invalid) return invalid.charAt(0).toUpperCase() + invalid.slice(1) + ".";
  return message;
}

export async function endBreak(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; dateKey: string }
): Promise<{ error: string | null }> {
  const { row, error } = await ensureAttendanceRow(supabase, input);
  if (error || !row) return { error: error ?? "Could not load today's attendance record." };
  if (row.status !== "on_break") return { error: null };

  const { error: rpcError } = await supabase.rpc("end_staff_break", { p_attendance_id: row.id });
  if (!rpcError) return { error: null };
  if (!isMissingFunction(rpcError)) return { error: breakErrorMessage(rpcError.message) };

  const { data: openBreak } = await supabase
    .from("staff_attendance_breaks")
    .select("id")
    .eq("attendance_id", row.id)
    .is("break_end", null)
    .order("break_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openBreak) {
    await supabase.from("staff_attendance_breaks").update({ break_end: new Date().toISOString() }).eq("id", openBreak.id);
  }

  const recordedBy = await currentUserId(supabase);
  const { error: updateError } = await supabase
    .from("staff_attendance")
    .update({ status: "available", recorded_by: recordedBy, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  return { error: updateError?.message ?? null };
}

/** All of today's break periods (open or closed) for the given
 * attendance rows — used to render the "Break" block on the Staff
 * Schedule timeline and to count today's breaks in the detail panel. */
export async function getBreaksForAttendanceIds(
  supabase: SupabaseClient,
  attendanceIds: string[]
): Promise<AttendanceBreak[]> {
  if (attendanceIds.length === 0) return [];
  const { data, error } = await supabase
    .from("staff_attendance_breaks")
    .select("id, attendance_id, break_start, break_end")
    .in("attendance_id", attendanceIds)
    .order("break_start", { ascending: true });

  if (error) {
    console.error("getBreaksForAttendanceIds failed:", error);
    return [];
  }
  return (data as AttendanceBreak[]) ?? [];
}

/** Staff whose live status blocks new bookings right now: Out, On
 * Break, or In Service. Day Off is handled separately via staff_shifts,
 * same as before this feature existed. */
export async function getUnavailableStatusIds(
  supabase: SupabaseClient,
  branchId: string,
  dateKey: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("staff_attendance")
    .select("staff_member_id, status")
    .eq("branch_id", branchId)
    .eq("attendance_date", dateKey)
    .in("status", ["out", "on_break", "in_service"]);

  if (error) {
    console.error("getUnavailableStatusIds failed:", error);
    return new Set();
  }
  return new Set(((data as { staff_member_id: string }[]) ?? []).map((r) => r.staff_member_id));
}

export function isWithinShift(row: Pick<AttendanceRow, "shift_start" | "shift_end">, now = new Date()): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = row.shift_start.split(":").map(Number);
  const [endH, endM] = row.shift_end.split(":").map(Number);
  return nowMin >= startH * 60 + startM && nowMin < endH * 60 + endM;
}

/** Side effect hooked into appointments.updateSessionStatus so a
 * professional's live attendance status always reflects what they're
 * actually doing — set to In Service the moment a session starts, and
 * back to Available once it ends, as long as that's still within their
 * shift for the day. Silently no-ops if attendance isn't being tracked
 * for this staff member today (e.g. they're not scheduled to work). */
export async function syncAttendanceWithSession(
  supabase: SupabaseClient,
  input: { professionalId: string | null; branchId: string; dateKey: string; sessionStatus: string }
): Promise<void> {
  if (!input.professionalId) return;

  const { data: existing } = await supabase
    .from("staff_attendance")
    .select(SELECT_FIELDS)
    .eq("staff_member_id", input.professionalId)
    .eq("attendance_date", input.dateKey)
    .maybeSingle();
  const row = existing as AttendanceRow | null;

  if (input.sessionStatus === "in_service") {
    if (row) {
      await supabase
        .from("staff_attendance")
        .update({ status: "in_service", updated_at: new Date().toISOString() })
        .eq("id", row.id);
    } else {
      await supabase.from("staff_attendance").insert({
        staff_member_id: input.professionalId,
        branch_id: input.branchId,
        attendance_date: input.dateKey,
        status: "in_service",
      });
    }
    return;
  }

  if (input.sessionStatus === "completed" || input.sessionStatus === "no_show") {
    if (!row || row.status !== "in_service") return;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const [shEndH, shEndM] = row.shift_end.split(":").map(Number);
    const stillOnShift = nowMin < shEndH * 60 + shEndM;
    await supabase
      .from("staff_attendance")
      .update({ status: stillOnShift ? "available" : "out", updated_at: new Date().toISOString() })
      .eq("id", row.id);
  }
}
