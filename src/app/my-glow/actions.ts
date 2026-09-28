"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelAppointment, rescheduleAppointment } from "@/lib/supabase/queries/appointments";

/** Every action here mutates a booking on the client's behalf, so each
 * one re-verifies the signed-in user actually owns that appointment
 * with the admin client before touching it — the mutation itself then
 * reuses the exact same Front Desk logic (conflict checks, original-
 * date tracking) so client-initiated and staff-initiated reschedules
 * behave identically. */
async function verifyOwnership(appointmentId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "You need to be signed in." };

  const admin = createAdminClient();
  const { data: appt, error } = await admin
    .from("appointments")
    .select("client_id")
    .eq("id", appointmentId)
    .single();
  if (error || !appt) return { error: "Booking not found." };
  if (appt.client_id !== auth.user.id) return { error: "You don't have permission to change this booking." };
  return { error: null };
}

export async function cancelMyBookingAction(appointmentId: string): Promise<{ error: string | null }> {
  try {
    const { error: ownError } = await verifyOwnership(appointmentId);
    if (ownError) return { error: ownError };

    const admin = createAdminClient();
    return await cancelAppointment(admin, appointmentId);
  } catch (err) {
    console.error("cancelMyBookingAction failed:", err);
    return { error: "Something went wrong on our end. Please try again." };
  }
}

export async function rescheduleMyBookingAction(input: {
  appointmentId: string;
  scheduledDate: string;
  startTime: string;
}): Promise<{ error: string | null }> {
  try {
    const { error: ownError } = await verifyOwnership(input.appointmentId);
    if (ownError) return { error: ownError };

    const admin = createAdminClient();
    const { data: appt, error: fetchError } = await admin
      .from("appointments")
      .select("professional_id, duration_minutes, status")
      .eq("id", input.appointmentId)
      .single();
    if (fetchError || !appt) return { error: "Booking not found." };
    if (appt.status === "cancelled") return { error: "This booking is already cancelled — book a new appointment instead." };

    return await rescheduleAppointment(admin, {
      appointmentId: input.appointmentId,
      professionalId: appt.professional_id,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      durationMinutes: appt.duration_minutes,
    });
  } catch (err) {
    console.error("rescheduleMyBookingAction failed:", err);
    return { error: "Something went wrong on our end. Please try again." };
  }
}
