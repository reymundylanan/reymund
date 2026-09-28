import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionStatus } from "@/lib/sessionStatus";
import { isProfessionalFreeNow } from "@/lib/supabase/queries/availability";
import { syncAttendanceWithSession } from "@/lib/supabase/queries/staffAttendance";

/** Shared by Walk-ins and the Appointments page — both flows track the
 * same on-site session lifecycle on the same appointments row. Stamps
 * the matching timestamp automatically so no caller has to remember to.
 * Also keeps the assigned staff member's live attendance status (In
 * Service / Available) in sync so Staff Schedule reflects it immediately. */
export async function updateSessionStatus(
  supabase: SupabaseClient,
  appointmentId: string,
  sessionStatus: SessionStatus
): Promise<{ error: string | null }> {
  const update: Record<string, unknown> = { session_status: sessionStatus };
  if (sessionStatus === "in_service") update.service_started_at = new Date().toISOString();
  if (sessionStatus === "completed") update.completed_at = new Date().toISOString();
  const { error } = await supabase.from("appointments").update(update).eq("id", appointmentId);
  if (error) return { error: error.message };

  const { data: appt } = await supabase
    .from("appointments")
    .select("professional_id, branch_id, scheduled_date")
    .eq("id", appointmentId)
    .single();
  if (appt) {
    await syncAttendanceWithSession(supabase, {
      professionalId: appt.professional_id,
      branchId: appt.branch_id,
      dateKey: appt.scheduled_date,
      sessionStatus,
    });
  }

  return { error: null };
}

/** "Paid" additionally requires an actual payment record — this pairs
 * the two writes so the status and the money are never out of sync. */
export async function markPaid(
  supabase: SupabaseClient,
  input: { appointmentId: string; amount: number; method: "cash" | "gcash" }
): Promise<{ error: string | null }> {
  const { error: paymentError } = await recordAppointmentPayment(supabase, input);
  if (paymentError) return { error: paymentError };
  return updateSessionStatus(supabase, input.appointmentId, "paid");
}

export async function markArrived(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("appointments")
    .update({ session_status: "arrived", arrival_time: new Date().toISOString() })
    .eq("id", appointmentId);
  return { error: error?.message ?? null };
}

export async function confirmAppointment(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("appointments").update({ status: "confirmed" }).eq("id", appointmentId);
  return { error: error?.message ?? null };
}

export async function cancelAppointment(
  supabase: SupabaseClient,
  appointmentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId);
  return { error: error?.message ?? null };
}

/** Rescheduling never creates a new appointment or a new payment — it
 * updates this same row, keeps the original payment connected, and
 * remembers the very first scheduled date/time (across any number of
 * reschedules) so "original vs new" can always be shown. Availability
 * is re-validated against the live database right before saving. */
export async function rescheduleAppointment(
  supabase: SupabaseClient,
  input: {
    appointmentId: string;
    professionalId: string | null;
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
  }
): Promise<{ error: string | null }> {
  if (input.professionalId) {
    const stillFree = await isProfessionalFreeNow(supabase, {
      professionalId: input.professionalId,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      excludeAppointmentId: input.appointmentId,
    });
    if (!stillFree) {
      return { error: "This professional is already booked at that date/time. Pick another slot." };
    }
  }

  const { data: current, error: fetchError } = await supabase
    .from("appointments")
    .select("scheduled_date, start_time, original_scheduled_date, original_start_time, reschedule_count")
    .eq("id", input.appointmentId)
    .single();
  if (fetchError || !current) return { error: fetchError?.message ?? "Appointment not found." };

  const { error } = await supabase
    .from("appointments")
    .update({
      scheduled_date: input.scheduledDate,
      start_time: input.startTime,
      session_status: "rescheduled",
      original_scheduled_date: current.original_scheduled_date ?? current.scheduled_date,
      original_start_time: current.original_start_time ?? current.start_time,
      reschedule_count: (current.reschedule_count ?? 0) + 1,
    })
    .eq("id", input.appointmentId);
  return { error: error?.message ?? null };
}

export async function recordAppointmentPayment(
  supabase: SupabaseClient,
  input: { appointmentId: string; amount: number; method: "cash" | "gcash" }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("payments").insert({
    appointment_id: input.appointmentId,
    amount: input.amount,
    method: input.method,
    status: "settled",
  });
  return { error: error?.message ?? null };
}
