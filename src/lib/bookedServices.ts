const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Booking-form ids: "<uuid>", "<uuid>·short" (hair size) or a package key. */
export function bookedServiceId(id: string | undefined): string | null {
  const base = (id ?? "").split("·")[0];
  return UUID_RE.test(base) ? base : null;
}

/** Mirrors 051's backfill: "<A>, <B> with <therapist> — ₱…" → ["A", "B"]. */
export function parseNotesServiceNames(notes: string | null): string[] {
  const head = (notes ?? "").split(" with ")[0];
  return head
    .split(", ")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function toAppointmentServiceRows(appointmentId: string, services: { id?: string; name: string }[]) {
  return services.slice(0, 20).map((s, position) => ({
    appointment_id: appointmentId,
    position,
    service_id: bookedServiceId(s.id),
    service_name: s.name.trim().slice(0, 200),
  }));
}
